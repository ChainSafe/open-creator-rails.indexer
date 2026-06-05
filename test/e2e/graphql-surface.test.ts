import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Hex } from "viem";
import {
  createAsset,
  dispatchClaimCreatorFee,
  dispatchRevokeSubscription,
  dispatchSubscribe,
  mintTokens,
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

async function rawGql<T = unknown>(
  url: string,
  query: string,
): Promise<GraphQLResponse<T>> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query }),
  });
  return (await res.json()) as GraphQLResponse<T>;
}

async function gql<T>(url: string, query: string): Promise<T> {
  const body = await rawGql<T>(url, query);
  if (body.errors?.length) {
    throw new Error(
      `GraphQL errors: ${body.errors.map((e) => e.message).join("; ")}`,
    );
  }
  if (!body.data) throw new Error("GraphQL response missing data");
  return body.data;
}

describe("GraphQL v2 surface", () => {
  let world: World;
  let asset: CreatedAsset;
  let sub: Subscriber;

  beforeAll(async () => {
    world = await setupWorld();

    // One asset + one subscriber subscribed enough to exercise computed
    // fields. Tests that need additional state create their own scoped
    // identifiers below; the surface assertions only need this baseline.
    asset = await createAsset(
      world.clients,
      world.base.registryAddress,
      "surface",
      100,
      1,
      world.base.tokenAddress,
      world.base.deployer,
    );
    sub = subscriber("surface", SUB1_PK);
    await mintTokens(
      world.clients,
      world.base.tokenAddress,
      sub.address,
      10_000_000n,
    );
    await subscribe(world.clients, world.base.registryAddress, asset, sub, 1000);
    await world.mine();
    await world.waitForIndex();
  });

  afterAll(async () => {
    await world?.teardown();
  });

  it("filter: equality on Address matches the seeded asset (and only that asset)", async () => {
    const data = await gql<{
      assets: { totalCount: number; items: Array<{ address: string }> };
    }>(
      world.graphqlUrl,
      `{
        assets(where: { address: "${asset.address.toLowerCase()}" }) {
          totalCount items { address }
        }
      }`,
    );
    expect(data.assets.totalCount).toBe(1);
    expect(data.assets.items[0]!.address).toBe(asset.address.toLowerCase());
  });

  it("filter: equality on a bytes32 (subscriber) String matches the row", async () => {
    const data = await gql<{
      subscriptions: { totalCount: number; items: Array<{ subscriber: string }> };
    }>(
      world.graphqlUrl,
      `{
        subscriptions(where: { subscriber: "${sub.hash.toLowerCase()}" }) {
          totalCount items { subscriber }
        }
      }`,
    );
    expect(data.subscriptions.totalCount).toBe(1);
    expect(data.subscriptions.items[0]!.subscriber).toBe(sub.hash.toLowerCase());
  });

  it("filter: v2 rejects non-equality operators (_gt, _in, AND/OR) — parse-time errors", async () => {
    // chainId_gt isn't in AssetFilter — GraphQL validation catches it.
    const r1 = await rawGql(
      world.graphqlUrl,
      `{ assets(where: { chainId_gt: 0 }) { totalCount } }`,
    );
    expect(r1.errors?.[0]?.message ?? "").toMatch(/chainId_gt|not defined/i);

    const r2 = await rawGql(
      world.graphqlUrl,
      `{ assets(where: { id_in: ["a", "b"] }) { totalCount } }`,
    );
    expect(r2.errors?.[0]?.message ?? "").toMatch(/id_in|not defined/i);

    // OR/AND aren't defined on v2 filter inputs.
    const r3 = await rawGql(
      world.graphqlUrl,
      `{ assets(where: { OR: [{ chainId: 1 }, { chainId: 2 }] }) { totalCount } }`,
    );
    expect(r3.errors?.[0]?.message ?? "").toMatch(/OR|not defined/i);
  });

  it("Address scalar lowercases mixed-case input before matching", async () => {
    // The asset address contains both upper and lower hex digits depending on
    // EIP-55 checksumming. Querying with a forced mixed-case variant still
    // matches the lowercase-stored row.
    const mixed = asset.address.toUpperCase().replace(/^0X/, "0x");
    const data = await gql<{
      assets: { totalCount: number };
    }>(
      world.graphqlUrl,
      `{ assets(where: { address: "${mixed}" }) { totalCount } }`,
    );
    expect(data.assets.totalCount).toBe(1);
  });

  it("non-Address String fields are case-sensitive (subscriber hash hex)", async () => {
    // bytes32 hex stored lowercase; querying with uppercase digits should miss
    // because the subscriber filter input is plain String (no scalar coercion).
    const upper = sub.hash.toUpperCase().replace(/^0X/, "0x");
    const data = await gql<{ subscriptions: { totalCount: number } }>(
      world.graphqlUrl,
      `{ subscriptions(where: { subscriber: "${upper}" }) { totalCount } }`,
    );
    expect(data.subscriptions.totalCount).toBe(0);
  });

  it("computed fields (Subscription.isActive/isExpired, Asset.claimable/claimableTotal) are queryable", async () => {
    const data = await gql<{
      subscriptions: {
        items: Array<{ isActive: boolean; isExpired: boolean }>;
      };
      assets: {
        items: Array<{
          claimable: { creatorFee: string; registryFee: string };
          claimableTotal: { creatorFee: string; registryFee: string; subscriberCount: number };
        }>;
      };
    }>(
      world.graphqlUrl,
      `{
        subscriptions(where: { subscriber: "${sub.hash.toLowerCase()}" }) {
          items { isActive isExpired }
        }
        assets(where: { address: "${asset.address.toLowerCase()}" }) {
          items {
            claimable(subscriber: "${sub.hash.toLowerCase()}") { creatorFee registryFee }
            claimableTotal { creatorFee registryFee subscriberCount }
          }
        }
      }`,
    );

    // isActive / isExpired resolve to booleans without error. NOTE: the
    // current resolver uses Date.now() (wall-clock) rather than indexed chain
    // time — in tests that mine many empty blocks via anvil_setBlockTimestampInterval(1)
    // the chain timestamp races ahead of wall-clock, so absolute values are
    // not asserted here. Wall-clock vs chain-time is a separate ticket.
    expect(typeof data.subscriptions.items[0]!.isActive).toBe("boolean");
    expect(typeof data.subscriptions.items[0]!.isExpired).toBe("boolean");

    // claimable / claimableTotal use the indexed rollup; their values are
    // deterministic. We only assert presence + non-negative numbers here —
    // exact math is covered by claimable.test.ts.
    expect(BigInt(data.assets.items[0]!.claimable.creatorFee)).toBeGreaterThanOrEqual(0n);
    expect(BigInt(data.assets.items[0]!.claimable.registryFee)).toBeGreaterThanOrEqual(0n);
    expect(data.assets.items[0]!.claimableTotal.subscriberCount).toBeGreaterThanOrEqual(1);
  });

  it("computed fields cannot appear in `where` — v2 filter inputs reject unknown keys", async () => {
    const r1 = await rawGql(
      world.graphqlUrl,
      `{ subscriptions(where: { isActive: true }) { totalCount } }`,
    );
    expect(r1.errors?.[0]?.message ?? "").toMatch(/isActive|not defined/i);

    const r2 = await rawGql(
      world.graphqlUrl,
      `{ assets(where: { claimable: 0 }) { totalCount } }`,
    );
    expect(r2.errors?.[0]?.message ?? "").toMatch(/claimable|not defined/i);
  });

  it("relation resolves to null when the underlying Subscription row was deleted (subscribe+claim+revoke same block)", async () => {
    // Build a fresh (asset, subscriber) so we can drive the whole nonce-0
    // lifecycle in a single block. With anvil_setBlockTimestampInterval(1),
    // ordinary mining advances startTime past block.timestamp — so to keep
    // nonce 0's startTime EQUAL to the revoke block's timestamp (which makes
    // it "future" for _removeSubscription and triggers SubscriptionRemoved),
    // the subscribe + claim + revoke txs must share one block.
    const localAsset = await createAsset(
      world.clients,
      world.base.registryAddress,
      "surface_null_relation",
      100,
      1,
      world.base.tokenAddress,
      world.base.deployer,
    );
    const localSub = subscriber("surface_null_relation_sub", SUB2_PK);
    await mintTokens(
      world.clients,
      world.base.tokenAddress,
      localSub.address,
      10_000_000n,
    );

    await world.mineBatched(async () => {
      const subscribeHash = await dispatchSubscribe(
        world.clients,
        world.base.registryAddress,
        localAsset,
        localSub,
        100,
      );
      const claimHash = await dispatchClaimCreatorFee(
        world.clients,
        localAsset.address,
        localSub,
      );
      const revokeHash = await dispatchRevokeSubscription(
        world.clients,
        localAsset.address,
        localSub,
      );
      return [subscribeHash, claimHash, revokeHash];
    });

    await world.mine();
    await world.waitForIndex();

    // The Subscription row was deleted by SubscriptionRemoved (which fires
    // because nonce 0's startTime == block.timestamp at revoke); the
    // CreatorFeeClaimed event row survives independently.
    const subs = await gql<{
      subscriptions: { totalCount: number };
    }>(
      world.graphqlUrl,
      `{ subscriptions(where: { subscriber: "${localSub.hash.toLowerCase()}" }) {
        totalCount
      } }`,
    );
    expect(subs.subscriptions.totalCount).toBe(0);

    const claims = await gql<{
      asset_CreatorFeeClaimeds: {
        items: Array<{ subscriptionId: string | null; subscription: unknown | null }>;
      };
    }>(
      world.graphqlUrl,
      `{ asset_CreatorFeeClaimeds(where: { subscriber: "${localSub.hash.toLowerCase()}" }) {
        items { subscriptionId subscription { id } }
      } }`,
    );
    expect(claims.asset_CreatorFeeClaimeds.items).toHaveLength(1);
    // The relation MUST resolve to null without erroring, regardless of
    // whether the handler stored subscriptionId before or after the row was
    // deleted within the same block.
    expect(claims.asset_CreatorFeeClaimeds.items[0]!.subscription).toBeNull();
  });

  it("pagination: limit, offset, and totalCount behave per queries.md", async () => {
    // Create three assets distinct from the suite-wide baseline so we can
    // assert deterministic counts without depending on other tests.
    const ids = ["surface_pg_a", "surface_pg_b", "surface_pg_c"];
    for (const id of ids) {
      await createAsset(
        world.clients,
        world.base.registryAddress,
        id,
        100,
        1,
        world.base.tokenAddress,
        world.base.deployer,
      );
    }
    await world.mine();
    await world.waitForIndex();

    // totalCount reflects ALL assets, not just the page.
    const page1 = await gql<{
      assets: {
        totalCount: number;
        items: Array<{ assetId: string }>;
      };
    }>(
      world.graphqlUrl,
      `{ assets(limit: 2, orderBy: "assetId", orderDirection: "asc") {
        totalCount items { assetId }
      } }`,
    );
    expect(page1.assets.items).toHaveLength(2);
    expect(page1.assets.totalCount).toBeGreaterThanOrEqual(4); // 1 baseline + 3 + (other tests' assets)

    const page2 = await gql<{
      assets: { items: Array<{ assetId: string }> };
    }>(
      world.graphqlUrl,
      `{ assets(limit: 2, offset: 2, orderBy: "assetId", orderDirection: "asc") {
        items { assetId }
      } }`,
    );
    expect(page2.assets.items).toHaveLength(2);
    // Disjoint pages.
    const page1Ids = new Set(page1.assets.items.map((a) => a.assetId));
    for (const item of page2.assets.items) {
      expect(page1Ids.has(item.assetId)).toBe(false);
    }
  });
});
