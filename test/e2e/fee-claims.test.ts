import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Hex } from "viem";
import {
  claimCreatorFee,
  claimRegistryFee,
  claimRegistryFeeBatch,
  createAsset,
  mintTokens,
  setSubscriptionPrice,
  subscribe,
  subscriber,
  type CreatedAsset,
  type Subscriber,
} from "./helpers/index.js";
import { setupWorld, type World } from "./setup.js";

const SUB1_PK: Hex =
  "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";
const SUB2_PK: Hex =
  "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a";

interface GraphQLResponse<T> {
  data?: T;
  errors?: { message: string }[];
}

async function gql<T>(url: string, query: string): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query }),
  });
  if (!res.ok) {
    throw new Error(`GraphQL request failed: ${res.status} ${res.statusText}`);
  }
  const body = (await res.json()) as GraphQLResponse<T>;
  if (body.errors?.length) {
    throw new Error(
      `GraphQL errors: ${body.errors.map((e) => e.message).join("; ")}`,
    );
  }
  if (!body.data) {
    throw new Error("GraphQL response missing data");
  }
  return body.data;
}

interface IndexedCreatorFeeClaim {
  id: string;
  subscriber: string;
  amount: string;
  claimedAtTimestamp: string;
  claimedAtNonce: string;
  subscriptionId: string | null;
}

interface IndexedRegistryFeeClaim {
  id: string;
  assetId: string;
  subscriber: string;
  amount: string;
  claimedAtTimestamp: string;
  claimedAtNonce: string;
  subscriptionId: string | null;
}

interface IndexedRegistryFeeClaimBatch {
  id: string;
  assetId: string;
  totalAmount: string;
}

function subscriptionId(
  chainId: number,
  assetAddress: string,
  subscriberHash: string,
  nonce: bigint | number,
): string {
  return `${chainId}_${assetAddress.toLowerCase()}_${subscriberHash.toLowerCase()}_${BigInt(nonce).toString()}`;
}

describe("fee claims", () => {
  let world: World;

  beforeAll(async () => {
    world = await setupWorld();
  });

  afterAll(async () => {
    await world?.teardown();
  });

  async function newScenario(
    id: string,
    opts: { price?: number; duration?: number; subPk?: Hex } = {},
  ): Promise<{ asset: CreatedAsset; sub: Subscriber }> {
    const asset = await createAsset(
      world.clients,
      world.base.registryAddress,
      `fee_${id}`,
      opts.price ?? 100,
      opts.duration ?? 1,
      world.base.tokenAddress,
      world.base.deployer,
    );
    const sub = subscriber(`sub_${id}`, opts.subPk ?? SUB1_PK);
    await mintTokens(
      world.clients,
      world.base.tokenAddress,
      sub.address,
      1_000_000n,
    );
    return { asset, sub };
  }

  async function commitAndIndex(): Promise<void> {
    await world.mine();
    await world.waitForIndex();
  }

  async function queryCreatorClaims(
    subHash: Hex,
  ): Promise<IndexedCreatorFeeClaim[]> {
    const data = await gql<{
      asset_CreatorFeeClaimeds: { items: IndexedCreatorFeeClaim[] };
    }>(
      world.graphqlUrl,
      `{
        asset_CreatorFeeClaimeds(
          where: { subscriber: "${subHash.toLowerCase()}" }
          orderBy: "blockNumber" orderDirection: "asc"
        ) {
          items { id subscriber amount claimedAtTimestamp claimedAtNonce subscriptionId }
        }
      }`,
    );
    return data.asset_CreatorFeeClaimeds.items;
  }

  async function queryRegistryClaims(
    subHash: Hex,
  ): Promise<IndexedRegistryFeeClaim[]> {
    const data = await gql<{
      assetRegistry_RegistryFeeClaimeds: { items: IndexedRegistryFeeClaim[] };
    }>(
      world.graphqlUrl,
      `{
        assetRegistry_RegistryFeeClaimeds(
          where: { subscriber: "${subHash.toLowerCase()}" }
          orderBy: "blockNumber" orderDirection: "asc"
        ) {
          items { id assetId subscriber amount claimedAtTimestamp claimedAtNonce subscriptionId }
        }
      }`,
    );
    return data.assetRegistry_RegistryFeeClaimeds.items;
  }

  async function queryRegistryBatches(
    assetIdHash: Hex,
  ): Promise<IndexedRegistryFeeClaimBatch[]> {
    const data = await gql<{
      assetRegistry_RegistryFeeClaimedBatchs: {
        items: IndexedRegistryFeeClaimBatch[];
      };
    }>(
      world.graphqlUrl,
      `{
        assetRegistry_RegistryFeeClaimedBatchs(
          where: { assetId: "${assetIdHash.toLowerCase()}" }
          orderBy: "blockNumber" orderDirection: "asc"
        ) {
          items { id assetId totalAmount }
        }
      }`,
    );
    return data.assetRegistry_RegistryFeeClaimedBatchs.items;
  }

  it("Asset:CreatorFeeClaimed records event + FK resolves to active subscription", async () => {
    const { asset, sub } = await newScenario("creator-single", { price: 100 });
    await subscribe(world.clients, world.base.registryAddress, asset, sub, 100);
    // Mine a few blocks so creator fee accrues (1 period = 1s with duration=1).
    await world.mine(5);
    await claimCreatorFee(world.clients, asset.address, sub);
    await commitAndIndex();

    const claims = await queryCreatorClaims(sub.hash);
    expect(claims).toHaveLength(1);
    expect(BigInt(claims[0]!.amount)).toBeGreaterThan(0n);
    expect(claims[0]!.claimedAtNonce).toBe("0");
    expect(claims[0]!.subscriptionId).toBe(
      subscriptionId(31337, asset.address, sub.hash, 0n),
    );
  });

  it("AssetRegistry:RegistryFeeClaimed records event + subscriptionId FK", async () => {
    const { asset, sub } = await newScenario("registry-single", { price: 100 });
    await subscribe(world.clients, world.base.registryAddress, asset, sub, 100);
    await world.mine(5);
    await claimRegistryFee(world.clients, world.base.registryAddress, asset, sub);
    await commitAndIndex();

    const claims = await queryRegistryClaims(sub.hash);
    expect(claims).toHaveLength(1);
    expect(claims[0]!.assetId).toBe(asset.assetIdHash);
    expect(BigInt(claims[0]!.amount)).toBeGreaterThan(0n);
    expect(claims[0]!.claimedAtNonce).toBe("0");
    expect(claims[0]!.subscriptionId).toBe(
      subscriptionId(31337, asset.address, sub.hash, 0n),
    );
  });

  it("AssetRegistry:RegistryFeeClaimedBatch records totalAmount + fans out single events per subscriber", async () => {
    const asset = await createAsset(
      world.clients,
      world.base.registryAddress,
      "fee_batch",
      100,
      1,
      world.base.tokenAddress,
      world.base.deployer,
    );
    const a = subscriber("batch_a", SUB1_PK);
    const b = subscriber("batch_b", SUB2_PK);
    await mintTokens(world.clients, world.base.tokenAddress, a.address, 1_000_000n);
    await mintTokens(world.clients, world.base.tokenAddress, b.address, 1_000_000n);

    await subscribe(world.clients, world.base.registryAddress, asset, a, 100);
    await subscribe(world.clients, world.base.registryAddress, asset, b, 100);
    await world.mine(5);
    await claimRegistryFeeBatch(world.clients, world.base.registryAddress, asset, [
      a,
      b,
    ]);
    await commitAndIndex();

    const batches = await queryRegistryBatches(asset.assetIdHash);
    expect(batches).toHaveLength(1);
    const total = BigInt(batches[0]!.totalAmount);
    expect(total).toBeGreaterThan(0n);

    // Per-subscriber single events fan out via Asset -> Registry callback.
    const aClaims = await queryRegistryClaims(a.hash);
    const bClaims = await queryRegistryClaims(b.hash);
    expect(aClaims).toHaveLength(1);
    expect(bClaims).toHaveLength(1);
    expect(BigInt(aClaims[0]!.amount) + BigInt(bClaims[0]!.amount)).toBe(total);
  });

  it("claim across a SubscriptionRenewed boundary advances claimedAtNonce to the new nonce", async () => {
    const { asset, sub } = await newScenario("nonce-boundary", { price: 100 });
    // Subscribe at price=100 (nonce 0 active until startTime + count).
    await subscribe(world.clients, world.base.registryAddress, asset, sub, 2);
    // Change price + let nonce 0 expire so the next subscribe truly RENEWS
    // (nonce++) instead of extending in place.
    await setSubscriptionPrice(world.clients, asset.address, 200);
    await world.mine(5);
    // Renewal — nonce 1.
    await subscribe(world.clients, world.base.registryAddress, asset, sub, 2);
    // Let nonce 1 also accrue.
    await world.mine(5);

    await claimCreatorFee(world.clients, asset.address, sub);
    await commitAndIndex();

    const claims = await queryCreatorClaims(sub.hash);
    expect(claims).toHaveLength(1);
    // The contract processes nonce 0 + nonce 1 in a single _claimable call and
    // sets claimedAtNonce to the highest nonce it advanced through.
    expect(claims[0]!.claimedAtNonce).toBe("1");
    expect(claims[0]!.subscriptionId).toBe(
      subscriptionId(31337, asset.address, sub.hash, 1n),
    );
  });

  it("claiming twice in quick succession produces two event rows; rollup stays consistent", async () => {
    const { asset, sub } = await newScenario("idempotency", { price: 100 });
    await subscribe(world.clients, world.base.registryAddress, asset, sub, 100);
    await world.mine(5);
    await claimCreatorFee(world.clients, asset.address, sub);
    // The contract emits CreatorFeeClaimed unconditionally — even when
    // claimable is 0 — so a back-to-back claim still inserts a second event
    // row. anvil_setBlockTimestampInterval(1) advances the chain by 1s
    // between txs, so a single period accrues between the two claims; the
    // second claim's amount is therefore strictly less than the first
    // (which covered the prior 5 mined blocks).
    await claimCreatorFee(world.clients, asset.address, sub);
    await commitAndIndex();

    const claims = await queryCreatorClaims(sub.hash);
    expect(claims).toHaveLength(2);
    const first = BigInt(claims[0]!.amount);
    const second = BigInt(claims[1]!.amount);
    expect(first).toBeGreaterThan(0n);
    expect(second).toBeLessThan(first);
    // claimedAtNonce should stay the same — no renewal happened.
    expect(claims[0]!.claimedAtNonce).toBe("0");
    expect(claims[1]!.claimedAtNonce).toBe("0");
  });
});
