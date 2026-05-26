import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Abi, Hex } from "viem";
import { AssetABI, AssetRegistryABI } from "../../../config/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../../..");
const FORGE_OUT = resolve(ROOT, "open-creator-rails/out");

export type ContractName = "Asset" | "AssetRegistry" | "TestToken";

export interface Artifact {
  abi: Abi;
  bytecode: Hex;
}

// ABIs come from config/*ABI.ts (kept fresh by `pnpm sync` + the abi-sync-check
// CI workflow) so tests and the indexer can't drift apart. TestToken has no
// indexer-side ABI, so we still parse its Forge artifact.
// Bytecode always comes from the Forge artifact; config/ tracks ABI only.
export function loadArtifact(name: ContractName): Artifact {
  return { abi: loadAbi(name), bytecode: loadBytecode(name) };
}

function loadAbi(name: ContractName): Abi {
  switch (name) {
    case "Asset":
      return AssetABI as Abi;
    case "AssetRegistry":
      return AssetRegistryABI as Abi;
    case "TestToken":
      return readArtifact("TestToken").abi as Abi;
  }
}

function loadBytecode(name: ContractName): Hex {
  return readArtifact(name).bytecode.object as Hex;
}

interface ForgeArtifact {
  abi: unknown;
  bytecode: { object: string };
}

function readArtifact(name: ContractName): ForgeArtifact {
  const path = resolve(FORGE_OUT, `${name}.sol`, `${name}.json`);
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch (err) {
    throw new Error(
      `Forge artifact not found at ${path}. Run 'pnpm contracts:build' before tests.`,
      { cause: err },
    );
  }
  return JSON.parse(raw) as ForgeArtifact;
}
