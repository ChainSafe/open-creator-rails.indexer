import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Address, Hex } from "viem";
import {
  createAsset,
  mintTokens,
  revokeSubscription,
  setSubscriptionPrice,
  subscribe,
  subscriber,
  type CreatedAsset,
  type Subscriber,
} from "./helpers/index.js";
import { setupWorld, type World } from "./setup.js";

const SUB1_PK: Hex =
  "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";

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

interface IndexedClaimable {
  creatorFee: string;
  registryFee: string;
  asOfTimestamp: string;
  asOfBlock: string;
}

interface IndexedSubscription {
  nonce: string;
  startTime: string;
  endTime: string;
  subscriptionPrice: string;
  registryFeeShare: string;
}

// The contract truncates ONCE across the elapsed window (count × price, then
// floor(× share / 100)) rather than per-period. The indexer mirrors this in
// computeClaimable. Reproduce the same math so the test fails loudly if the
// indexer ever switches to per-period truncation, cumulative totals, etc.
function expectedClaimable(
  periods: bigint,
  price: bigint,
  share: bigint,
): { creatorFee: bigint; registryFee: bigint } {
  const fee = periods * price;
  const regPortion = (fee * share) / 100n;
  return { creatorFee: fee - regPortion, registryFee: regPortion };
}

async function queryClaimable(
  world: World,
  asset: Address,
  subHash: Hex,
): Promise<IndexedClaimable> {
  const data = await gql<{
    assets: {
      items: Array<{ claimable: IndexedClaimable }>;
    };
  }>(
    world.graphqlUrl,
    `{
      assets(where: { address: "${asset.toLowerCase()}" }) {
        items {
          claimable(subscriber: "${subHash.toLowerCase()}") {
            creatorFee registryFee asOfTimestamp asOfBlock
          }
        }
      }
    }`,
  );
  const item = data.assets.items[0];
  if (!item) throw new Error(`Asset ${asset} not indexed`);
  return item.claimable;
}

async function queryActiveSubscriptions(
  world: World,
  subHash: Hex,
): Promise<IndexedSubscription[]> {
  const data = await gql<{
    subscriptions: { items: IndexedSubscription[] };
  }>(
    world.graphqlUrl,
    `{
      subscriptions(
        where: { subscriber: "${subHash.toLowerCase()}" }
        orderBy: "nonce" orderDirection: "asc"
      ) {
        items { nonce startTime endTime subscriptionPrice registryFeeShare }
      }
    }`,
  );
  return data.subscriptions.items;
}

describe("claimable rollup", () => {
  let world: World;

  beforeAll(async () => {
    world = await setupWorld();
  });

  afterAll(async () => {
    await world?.teardown();
  });

  async function newScenario(
    id: string,
    opts: { price?: number; duration?: number; count?: number } = {},
  ): Promise<{ asset: CreatedAsset; sub: Subscriber }> {
    const asset = await createAsset(
      world.clients,
      world.base.registryAddress,
      `claimable_${id}`,
      opts.price ?? 100,
      opts.duration ?? 1,
      world.base.tokenAddress,
      world.base.deployer,
    );
    const sub = subscriber(`sub_${id}`, SUB1_PK);
    await mintTokens(
      world.clients,
      world.base.tokenAddress,
      sub.address,
      10_000_000n,
    );
    await subscribe(
      world.clients,
      world.base.registryAddress,
      asset,
      sub,
      opts.count ?? 1000,
    );
    return { asset, sub };
  }

  async function commitAndIndex(): Promise<void> {
    await world.mine();
    await world.waitForIndex();
  }

  it("fidelity: claimable matches floor((elapsed/duration) × price × share / 100) for a standard subscription", async () => {
    // baseSeed deploys the registry with registryFeeShare=80.
    const { asset, sub } = await newScenario("standard", { price: 100 });
    await commitAndIndex();

    const subs = await queryActiveSubscriptions(world, sub.hash);
    expect(subs).toHaveLength(1);
    const nonce0 = subs[0]!;

    const claim = await queryClaimable(world, asset.address, sub.hash);
    const elapsed = BigInt(claim.asOfTimestamp) - BigInt(nonce0.startTime);
    const periods = elapsed / 1n; // duration=1
    const expected = expectedClaimable(periods, 100n, 80n);

    expect(claim.creatorFee).toBe(expected.creatorFee.toString());
    expect(claim.registryFee).toBe(expected.registryFee.toString());
  });

  it("fidelity: dust — a revoked subscription pays full periods + truncated partial-period dust", async () => {
    const { asset, sub } = await newScenario("dust", {
      price: 300,
      duration: 7,
      count: 100,
    });
    // Advance ~1.5 periods (≈11s with anvil_setBlockTimestampInterval=1), then
    // revoke so endTime lands mid-period.
    await world.mine(10);
    await revokeSubscription(world.clients, asset.address, sub);
    await commitAndIndex();

    const subs = await queryActiveSubscriptions(world, sub.hash);
    expect(subs).toHaveLength(1);
    const nonce0 = subs[0]!;

    const start = BigInt(nonce0.startTime);
    const end = BigInt(nonce0.endTime); // = revoke timestamp (truncated, non-aligned)
    const price = BigInt(nonce0.subscriptionPrice);
    const share = BigInt(nonce0.registryFeeShare);
    const duration = 7n;

    const window = end - start;
    const count = window / duration;
    const dustDuration = window - count * duration;

    // Preconditions: the scenario must exercise BOTH a whole period and a
    // genuinely truncating dust remainder, else it silently degrades into the
    // plain fidelity case above.
    expect(count).toBeGreaterThan(0n);
    expect(dustDuration).toBeGreaterThan(0n);
    expect((dustDuration * price) % duration).toBeGreaterThan(0n);

    const dust = (dustDuration * price) / duration; // floor — mirrors the contract
    const fee = count * price + dust;
    const regPortion = (fee * share) / 100n;

    const claim = await queryClaimable(world, asset.address, sub.hash);
    // asOf is past the revoked endTime, so the window clamps to endTime and the
    // dust branch (end === sub.endTime) fires.
    expect(BigInt(claim.asOfTimestamp)).toBeGreaterThanOrEqual(end);
    expect(claim.creatorFee).toBe((fee - regPortion).toString());
    expect(claim.registryFee).toBe(regPortion.toString());
  });

  it("ClaimableRefresh: asOfBlock + values advance when blocks tick without any on-chain events", async () => {
    const { asset, sub } = await newScenario("refresh-tick", { price: 100 });
    await commitAndIndex();
    const first = await queryClaimable(world, asset.address, sub.hash);

    await world.mine();
    await world.waitForIndex();
    const second = await queryClaimable(world, asset.address, sub.hash);

    expect(BigInt(second.asOfBlock)).toBeGreaterThan(BigInt(first.asOfBlock));
    expect(BigInt(second.asOfTimestamp)).toBeGreaterThan(
      BigInt(first.asOfTimestamp),
    );
    
    const subs = await queryActiveSubscriptions(world, sub.hash);
    const nonce0 = subs[0]!;
    const periods = (BigInt(second.asOfTimestamp) - BigInt(nonce0.startTime)) / 1n;
    const expected = expectedClaimable(periods, 100n, 80n);
    expect(second.creatorFee).toBe(expected.creatorFee.toString());
    expect(second.registryFee).toBe(expected.registryFee.toString());
  });

  it("multi-nonce: claimable sums fees per nonce (each truncated once across its window)", async () => {
    const asset = await createAsset(
      world.clients,
      world.base.registryAddress,
      "claimable_multi-nonce",
      100,
      1,
      world.base.tokenAddress,
      world.base.deployer,
    );
    const sub = subscriber("sub_multi-nonce", SUB1_PK);
    await mintTokens(
      world.clients,
      world.base.tokenAddress,
      sub.address,
      10_000_000n,
    );
    // Nonce 0 spans count=5 (5 periods of 1s).
    await subscribe(world.clients, world.base.registryAddress, asset, sub, 5);
    await setSubscriptionPrice(world.clients, asset.address, 200);
    // Let nonce 0 fully expire before renewing so the new subscribe creates
    // nonce 1 (the chain logic extends in-place only when start == endTime).
    await world.mine(10);
    await subscribe(world.clients, world.base.registryAddress, asset, sub, 5);
    await commitAndIndex();

    const subs = await queryActiveSubscriptions(world, sub.hash);
    expect(subs.map((s) => s.nonce)).toEqual(["0", "1"]);
    const n0 = subs[0]!;
    const n1 = subs[1]!;
    const claim = await queryClaimable(world, asset.address, sub.hash);
    const asOf = BigInt(claim.asOfTimestamp);

    // Per-nonce window: bounded above by min(asOf, sub.endTime).
    const n0End = BigInt(n0.endTime) < asOf ? BigInt(n0.endTime) : asOf;
    const n0Periods = (n0End - BigInt(n0.startTime)) / 1n;
    const n0Fees = expectedClaimable(
      n0Periods,
      BigInt(n0.subscriptionPrice),
      BigInt(n0.registryFeeShare),
    );

    const n1End = BigInt(n1.endTime) < asOf ? BigInt(n1.endTime) : asOf;
    const n1StartEffective =
      asOf > BigInt(n1.startTime) ? BigInt(n1.startTime) : asOf;
    const n1Periods =
      n1End > n1StartEffective ? (n1End - n1StartEffective) / 1n : 0n;
    const n1Fees = expectedClaimable(
      n1Periods,
      BigInt(n1.subscriptionPrice),
      BigInt(n1.registryFeeShare),
    );

    expect(claim.creatorFee).toBe((n0Fees.creatorFee + n1Fees.creatorFee).toString());
    expect(claim.registryFee).toBe((n0Fees.registryFee + n1Fees.registryFee).toString());
  });
});
