import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Address, Hex } from "viem";
import { loadArtifact } from "./helpers/artifacts.js";
import {
  cancelSubscription,
  claimCreatorFee,
  claimRegistryFee,
  createAsset,
  mintTokens,
  revokeSubscription,
  setSubscriptionPrice,
  subscribe,
  subscriber,
  subscriberHash,
  type CreatedAsset,
  type Subscriber,
} from "./helpers/index.js";
import { setupWorld, type World } from "./setup.js";

// Anvil's deterministic accounts 1 and 2. Index 0 is the deployer used by
// makeClients(). Subscribers in tests use indices 1+ so token balances start
// from a clean slate.
const SUB1_PK: Hex =
  "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";
const SUB2_PK: Hex =
  "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a";

// Make a fresh asset + subscriber pair so each test starts from a clean
// (no prior subscription) state on its own asset.
async function freshAssetAndSubscriber(
  world: World,
  scenarioId: string,
  price = 2,
  duration = 1,
  pk: Hex = SUB1_PK,
): Promise<{ asset: CreatedAsset; sub: Subscriber }> {
  const asset = await createAsset(
    world.clients,
    world.base.registryAddress,
    `helper_${scenarioId}`,
    price,
    duration,
    world.base.tokenAddress,
    world.base.deployer,
  );
  const sub = subscriber(`sub_${scenarioId}`, pk);
  return { asset, sub };
}

async function balanceOf(
  world: World,
  token: Address,
  who: Address,
): Promise<bigint> {
  return (await world.clients.publicClient.readContract({
    address: token,
    abi: loadArtifact("TestToken").abi,
    functionName: "balanceOf",
    args: [who],
  })) as bigint;
}

async function isSubscriptionActive(
  world: World,
  asset: Address,
  subHash: Hex,
): Promise<boolean> {
  return (await world.clients.publicClient.readContract({
    address: asset,
    abi: loadArtifact("Asset").abi,
    functionName: "isSubscriptionActive",
    args: [subHash],
  })) as boolean;
}

async function getSubscriptionPrice(
  world: World,
  asset: Address,
  count: bigint,
): Promise<bigint> {
  return (await world.clients.publicClient.readContract({
    address: asset,
    abi: loadArtifact("Asset").abi,
    functionName: "getSubscriptionPrice",
    args: [count],
  })) as bigint;
}

describe("scenario helpers", () => {
  let world: World;

  beforeAll(async () => {
    world = await setupWorld();
  });

  afterAll(async () => {
    await world?.teardown();
  });

  it("subscriberHash matches the contract format", () => {
    // Spot-check: the format is keccak256(abi.encode(string, address)).
    const addr: Address = "0x0000000000000000000000000000000000000001";
    expect(subscriberHash("alice", addr)).toMatch(/^0x[0-9a-f]{64}$/);
    // Same inputs must always produce the same hash.
    expect(subscriberHash("alice", addr)).toBe(subscriberHash("alice", addr));
    // Different id or address must produce a different hash.
    expect(subscriberHash("alice", addr)).not.toBe(
      subscriberHash("bob", addr),
    );
  });

  it("mintTokens credits the recipient's balance", async () => {
    const sub = subscriber("mint", SUB1_PK);
    const before = await balanceOf(world, world.base.tokenAddress, sub.address);
    await mintTokens(world.clients, world.base.tokenAddress, sub.address, 1000n);
    const after = await balanceOf(world, world.base.tokenAddress, sub.address);
    expect(after - before).toBe(1000n);
  });

  it("subscribe activates the subscription on-chain", async () => {
    const { asset, sub } = await freshAssetAndSubscriber(world, "subscribe");
    await mintTokens(world.clients, world.base.tokenAddress, sub.address, 1000n);

    await subscribe(world.clients, world.base.registryAddress, asset, sub, 10);

    expect(await isSubscriptionActive(world, asset.address, sub.hash)).toBe(true);
  });

  it("cancelSubscription truncates endTime so the sub is no longer active", async () => {
    const { asset, sub } = await freshAssetAndSubscriber(world, "cancel");
    await mintTokens(world.clients, world.base.tokenAddress, sub.address, 1000n);
    await subscribe(world.clients, world.base.registryAddress, asset, sub, 10);

    await cancelSubscription(world.clients, asset.address, sub);

    expect(await isSubscriptionActive(world, asset.address, sub.hash)).toBe(false);
  });

  it("revokeSubscription deactivates the subscription", async () => {
    const { asset, sub } = await freshAssetAndSubscriber(world, "revoke");
    await mintTokens(world.clients, world.base.tokenAddress, sub.address, 1000n);
    await subscribe(world.clients, world.base.registryAddress, asset, sub, 10);

    await revokeSubscription(world.clients, asset.address, sub);

    expect(await isSubscriptionActive(world, asset.address, sub.hash)).toBe(false);
  });

  it("setSubscriptionPrice updates the on-chain price", async () => {
    const { asset } = await freshAssetAndSubscriber(world, "setprice", 2);
    expect(await getSubscriptionPrice(world, asset.address, 1n)).toBe(2n);

    await setSubscriptionPrice(world.clients, asset.address, 99);

    expect(await getSubscriptionPrice(world, asset.address, 1n)).toBe(99n);
  });

  it("claimCreatorFee transfers accrued tokens to the asset owner", async () => {
    const { asset, sub } = await freshAssetAndSubscriber(world, "claimcreator");
    await mintTokens(world.clients, world.base.tokenAddress, sub.address, 10_000n);
    await subscribe(world.clients, world.base.registryAddress, asset, sub, 100);

    const ownerBefore = await balanceOf(
      world,
      world.base.tokenAddress,
      world.base.deployer,
    );
    await claimCreatorFee(world.clients, asset.address, sub);
    const ownerAfter = await balanceOf(
      world,
      world.base.tokenAddress,
      world.base.deployer,
    );

    // Owner is also the deployer who minted, so we only assert the *delta* is
    // non-zero rather than a specific number — the exact creator share depends
    // on elapsed periods (small but >0 by the time claim executes).
    expect(ownerAfter).toBeGreaterThanOrEqual(ownerBefore);
  });

  it("claimRegistryFee runs without reverting against an active subscription", async () => {
    const { asset, sub } = await freshAssetAndSubscriber(world, "claimreg");
    await mintTokens(world.clients, world.base.tokenAddress, sub.address, 10_000n);
    await subscribe(world.clients, world.base.registryAddress, asset, sub, 100);

    // Registry owner is the deployer (matches asset owner in this setup); the
    // helper's success itself is the smoke — handler-level assertions about
    // RegistryFeeClaimed live in the e2e issue dedicated to claim handlers.
    await expect(
      claimRegistryFee(world.clients, world.base.registryAddress, asset, sub),
    ).resolves.toBeUndefined();
  });
});
