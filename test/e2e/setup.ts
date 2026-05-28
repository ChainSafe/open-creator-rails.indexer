import { spawn, type ChildProcess } from "node:child_process";
import { rmSync } from "node:fs";
import { createConnection, createServer } from "node:net";
import { dirname, resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import type { Hex, TransactionReceipt } from "viem";
import {
  baseSeed,
  makeClients,
  type BaseDeployments,
  type Clients,
} from "./helpers/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");
const PONDER_BIN = resolve(ROOT, "node_modules/.bin/ponder");
const ANVIL_PORT = 8545;
const ANVIL_RPC_URL = `http://127.0.0.1:${ANVIL_PORT}`;
// Isolated PGlite directory per worker. Sits inside .ponder/ (already in
// .gitignore) and doesn't collide with `pnpm dev:local`'s default .ponder/pglite.
const PONDER_PGLITE_DIR = resolve(ROOT, ".ponder", `test-pglite-${process.pid}`);
// Default unknown-chain finality in ponder/utils/finality.ts; chain 31337 hits
// this branch. Not overridable from ponder.config.ts in 0.16.6.
const FINALITY_BLOCKS = 30;
// Mine a few blocks past the finality boundary so the most recent on-chain
// action is comfortably finalized before we wait on Ponder.
const FINALITY_BUFFER = 5;

export interface World {
  graphqlUrl: string;
  ponderBaseUrl: string;
  rpcUrl: string;
  clients: Clients;
  base: BaseDeployments;
  // Mine `count` empty Anvil blocks. Defaults to one finality window + buffer,
  // which is the right amount to push the most recent on-chain action across
  // the finalized cliff before calling waitForIndex().
  mine: (count?: number) => Promise<void>;
  // Polls Ponder's /status until the indexed head reaches the current chain
  // head minus FINALITY_BLOCKS — i.e. everything currently on chain that could
  // be finalized is reflected in the DB. Call after on-chain work + mine().
  waitForIndex: (timeoutMs?: number) => Promise<void>;
  // Dispatches multiple txs into the same Anvil block. Disables auto-mining,
  // runs the callback (which dispatches txs WITHOUT waiting for receipts and
  // returns their hashes), mines a single block, then waits for receipts.
  mineBatched: (
    send: () => Promise<readonly Hex[]>,
  ) => Promise<TransactionReceipt[]>;
  teardown: () => Promise<void>;
}

export async function setupWorld(): Promise<World> {
  await assertPortFree(ANVIL_PORT);

  // Stale PGlite state from a previous crashed run would let Ponder believe
  // indexing is already done; wipe before starting.
  rmSync(PONDER_PGLITE_DIR, { recursive: true, force: true });

  const anvil = spawn("anvil", ["--port", String(ANVIL_PORT)], {
    stdio: ["ignore", "pipe", "pipe"],
  });
  attachLogPrefix(anvil, "anvil");
  const anvilDied = watchSpawnFailure(anvil, "anvil", {
    hint: "Install Foundry (https://book.getfoundry.sh/getting-started/installation) and ensure 'anvil' is on your PATH.",
  });

  try {
    await Promise.race([waitForRpc(ANVIL_RPC_URL, 15_000), anvilDied.promise]);
    anvilDied.dispose();

    await anvilRpc(ANVIL_RPC_URL, "anvil_setBlockTimestampInterval", [1]);

    const clients = makeClients(ANVIL_RPC_URL);
    const base = await baseSeed(clients);

    // Push the registry deploy past finality so /ready can fire as soon as
    // Ponder backfills it. Tests that need their own on-chain work indexed
    // call world.mine() + world.waitForIndex() to do the same.
    await mineEmptyBlocks(ANVIL_RPC_URL, FINALITY_BLOCKS + FINALITY_BUFFER);

    const ponderPort = await pickFreePort();
    const ponder = spawn(PONDER_BIN, ["start", "--port", String(ponderPort)], {
      cwd: ROOT,
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        PONDER_RPC_URL_31337: ANVIL_RPC_URL,
        // Tells config/index.ts which registries to track for chain 31337
        // (avoids mutating the committed config/deployments/registries_31337.json
        // file). The generic PONDER_<CHAINID>_REGISTRIES knob is implemented
        // there for all chains.
        PONDER_31337_REGISTRIES: JSON.stringify([base.registryAddress]),
        // Isolated PGlite dir per-pid; rmSync'd at suite start + teardown.
        PONDER_PGLITE_DIR: PONDER_PGLITE_DIR,
        // `ponder start` (unlike `dev`) requires an explicit schema.
        DATABASE_SCHEMA: "public",
        // Disable the TTY UI; in CI it spams ANSI control codes into the log.
        NO_COLOR: "1",
      },
    });
    attachLogPrefix(ponder, "ponder");
    const ponderDied = watchSpawnFailure(ponder, "ponder", {
      hint: "Did 'pnpm install' run? The binary should live at node_modules/.bin/ponder.",
    });

    const ponderBaseUrl = `http://127.0.0.1:${ponderPort}`;
    try {
      await Promise.race([
        waitForPonderReady(ponderBaseUrl, 90_000),
        ponderDied.promise,
      ]);
      ponderDied.dispose();
    } catch (err) {
      ponderDied.dispose();
      await killProcess(ponder);
      await killProcess(anvil);
      throw err;
    }

    const teardown = async (): Promise<void> => {
      await killProcess(ponder);
      await killProcess(anvil);
      rmSync(PONDER_PGLITE_DIR, { recursive: true, force: true });
    };

    return {
      graphqlUrl: `${ponderBaseUrl}/v2/graphql`,
      ponderBaseUrl,
      rpcUrl: ANVIL_RPC_URL,
      clients,
      base,
      mine: (count = FINALITY_BLOCKS + FINALITY_BUFFER) =>
        mineEmptyBlocks(ANVIL_RPC_URL, count),
      waitForIndex: (timeoutMs = 30_000) =>
        waitForIndex(clients, ponderBaseUrl, timeoutMs),
      mineBatched: (send) => mineBatched(clients, ANVIL_RPC_URL, send),
      teardown,
    };
  } catch (err) {
    await killProcess(anvil);
    throw err;
  }
}

function attachLogPrefix(child: ChildProcess, prefix: string): void {
  child.stdout?.on("data", (chunk: Buffer) => {
    process.stderr.write(prefixLines(prefix, chunk.toString("utf8")));
  });
  child.stderr?.on("data", (chunk: Buffer) => {
    process.stderr.write(prefixLines(prefix, chunk.toString("utf8")));
  });
}

function prefixLines(prefix: string, text: string): string {
  return text
    .split("\n")
    .map((line, idx, arr) =>
      idx === arr.length - 1 && line === "" ? line : `[${prefix}] ${line}\n`,
    )
    .join("");
}

async function assertPortFree(port: number): Promise<void> {
  const inUse = await isPortInUse(port);
  if (inUse) {
    throw new Error(
      `Port ${port} already in use. Stop any running 'pnpm dev:local' (or other Anvil) before running tests.`,
    );
  }
}

function isPortInUse(port: number): Promise<boolean> {
  return new Promise((resolveFn) => {
    const socket = createConnection({ port, host: "127.0.0.1" });
    socket.once("connect", () => {
      socket.destroy();
      resolveFn(true);
    });
    socket.once("error", () => {
      socket.destroy();
      resolveFn(false);
    });
  });
}

function pickFreePort(): Promise<number> {
  return new Promise((resolveFn, rejectFn) => {
    const server = createServer();
    server.unref();
    server.once("error", rejectFn);
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      if (addr === null || typeof addr === "string") {
        rejectFn(new Error("Failed to acquire free port"));
        return;
      }
      const port = addr.port;
      server.close(() => resolveFn(port));
    });
  });
}

async function mineEmptyBlocks(rpcUrl: string, count: number): Promise<void> {
  await anvilRpc(rpcUrl, "anvil_mine", [`0x${count.toString(16)}`]);
}

async function anvilRpc(
  rpcUrl: string,
  method: string,
  params: unknown[],
): Promise<void> {
  const res = await fetch(rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  if (!res.ok) {
    throw new Error(`${method} failed: ${res.status} ${res.statusText}`);
  }
  // JSON-RPC errors come back as HTTP 200 with `{ error: { ... } }`. Surface
  // them instead of silently no-oping.
  const body = (await res.json()) as { error?: { message: string } };
  if (body.error) {
    throw new Error(`${method} failed: ${body.error.message}`);
  }
}

// Dispatches multiple txs into the same Anvil block. The callback must dispatch
// txs WITHOUT awaiting their receipts (helpers that do are unsuitable) and
// return the hashes. `anvil_setAutomine(false)` keeps txs in the mempool until
// the explicit anvil_mine call, then we restore automining and collect receipts.
async function mineBatched(
  clients: Clients,
  rpcUrl: string,
  send: () => Promise<readonly Hex[]>,
): Promise<TransactionReceipt[]> {
  await anvilRpc(rpcUrl, "anvil_setAutomine", [false]);
  try {
    const hashes = await send();
    await anvilRpc(rpcUrl, "anvil_mine", ["0x1"]);
    return Promise.all(
      hashes.map((hash) =>
        clients.publicClient.waitForTransactionReceipt({ hash }),
      ),
    );
  } finally {
    await anvilRpc(rpcUrl, "anvil_setAutomine", [true]);
  }
}

async function waitForRpc(rpcUrl: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(rpcUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "eth_chainId",
          params: [],
        }),
      });
      if (res.ok) return;
    } catch {
      // Anvil not up yet.
    }
    await sleep(200);
  }
  throw new Error(`Anvil at ${rpcUrl} did not respond within ${timeoutMs}ms`);
}

async function waitForPonderReady(
  baseUrl: string,
  timeoutMs: number,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastStatus: number | undefined;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${baseUrl}/ready`);
      lastStatus = res.status;
      if (res.status === 200) return;
    } catch {
      // Ponder server not listening yet.
    }
    await sleep(500);
  }
  throw new Error(
    `Ponder /ready at ${baseUrl} did not reach 200 within ${timeoutMs}ms (last status: ${lastStatus ?? "no response"})`,
  );
}

interface PonderStatus {
  [chainName: string]: { id: number; block: { number: number; timestamp: number } };
}

async function waitForIndex(
  clients: Clients,
  ponderBaseUrl: string,
  timeoutMs: number,
): Promise<void> {
  const head = await clients.publicClient.getBlockNumber({ cacheTime: 0 });
  const target = Number(head) - FINALITY_BLOCKS;
  if (target <= 0) return; // nothing has been finalized yet.

  const deadline = Date.now() + timeoutMs;
  let lastIndexed: number | undefined;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${ponderBaseUrl}/status`);
      if (res.ok) {
        const status = (await res.json()) as PonderStatus;
        const indexed = status.local?.block.number;
        lastIndexed = indexed;
        if (indexed !== undefined && indexed >= target) return;
      }
    } catch {
      // Server transient error; retry.
    }
    await sleep(200);
  }
  throw new Error(
    `Ponder did not index up to block ${target} within ${timeoutMs}ms (last indexed: ${lastIndexed ?? "unknown"})`,
  );
}

// Surfaces spawn / startup-time failures on a child process as a rejected
// Promise so the caller can race it against a "wait for ready" check.
// Without this, ENOENT (binary not found) reaches the test runner as a cryptic
// unhandled exception and the failure mode that triggers is whichever wait
// times out first (typically waitForRpc), which doesn't tell the user that the
// real problem is a missing binary.
//
// The promise rejects on:
//   - 'error' event (spawn-level failure, e.g. ENOENT)
//   - 'exit' event with non-zero code (process started but died early)
// Call .dispose() once the child is confirmed running so post-startup exits
// don't trigger spurious rejections on a promise nobody awaits anymore.
function watchSpawnFailure(
  child: ChildProcess,
  label: string,
  options: { hint?: string } = {},
): { promise: Promise<never>; dispose: () => void } {
  let disposed = false;
  let onError!: (err: NodeJS.ErrnoException) => void;
  let onExit!: (code: number | null, signal: NodeJS.Signals | null) => void;
  const promise = new Promise<never>((_, reject) => {
    onError = (err) => {
      if (disposed) return;
      const base =
        err.code === "ENOENT"
          ? `Failed to spawn '${label}': binary not found on PATH (${err.message}).`
          : `'${label}' process error: ${err.message}.`;
      reject(new Error(options.hint ? `${base}\n  Hint: ${options.hint}` : base));
    };
    onExit = (code, signal) => {
      if (disposed) return;
      if (code !== null && code !== 0) {
        reject(
          new Error(
            `'${label}' exited early with code ${code}${signal ? ` (signal: ${signal})` : ""}.`,
          ),
        );
      } else if (signal) {
        reject(new Error(`'${label}' was killed by signal ${signal} before becoming ready.`));
      }
    };
    child.once("error", onError);
    child.once("exit", onExit);
  });
  const dispose = () => {
    disposed = true;
    child.off("error", onError);
    child.off("exit", onExit);
  };
  // Don't let a rejection from a disposed promise pop up as unhandled.
  promise.catch(() => {});
  return { promise, dispose };
}

async function killProcess(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return;
  return new Promise((resolveFn) => {
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
    }, 5_000);
    child.once("exit", () => {
      clearTimeout(timer);
      resolveFn();
    });
    child.kill("SIGTERM");
  });
}
