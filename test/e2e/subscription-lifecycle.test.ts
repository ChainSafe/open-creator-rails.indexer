import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Hex } from "viem";
import {
  cancelSubscription,
  createAsset,
  dispatchRevokeSubscription,
  dispatchSubscribe,
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

interface IndexedSubscription {
  id: string;
  nonce: string;
  startTime: string;
  endTime: string;
  isRevoked: boolean;
  subscriptionPrice: string;
}

describe("subscription lifecycle", () => {
  let world: World;

  beforeAll(async () => {
    world = await setupWorld();
  });

  afterAll(async () => {
    await world?.teardown();
  });

  // Build a fresh asset + subscriber per test so prior on-chain state from
  // earlier `it` blocks (subscriber-keyed) doesn't interfere with assertions.
  async function newScenario(
    id: string,
    opts: { price?: number; duration?: number } = {},
  ): Promise<{ asset: CreatedAsset; sub: Subscriber }> {
    const asset = await createAsset(
      world.clients,
      world.base.registryAddress,
      `lifecycle_${id}`,
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
      1_000_000n,
    );
    return { asset, sub };
  }

  async function commitAndIndex(): Promise<void> {
    await world.mine();
    await world.waitForIndex();
  }

  async function querySubs(subHash: Hex): Promise<{
    totalCount: number;
    items: IndexedSubscription[];
  }> {
    const data = await gql<{
      subscriptions: {
        totalCount: number;
        items: IndexedSubscription[];
      };
    }>(
      world.graphqlUrl,
      `{
        subscriptions(
          where: { subscriber: "${subHash.toLowerCase()}" }
          orderBy: "nonce" orderDirection: "asc"
        ) {
          totalCount
          items { id nonce startTime endTime isRevoked subscriptionPrice }
        }
      }`,
    );
    return data.subscriptions;
  }

  it("SubscriptionAdded creates a Subscription row at nonce 0", async () => {
    const { asset, sub } = await newScenario("added");
    await subscribe(world.clients, world.base.registryAddress, asset, sub, 5);
    await commitAndIndex();

    const subs = await querySubs(sub.hash);
    expect(subs.totalCount).toBe(1);
    expect(subs.items[0]!.nonce).toBe("0");
    expect(subs.items[0]!.isRevoked).toBe(false);
    expect(subs.items[0]!.subscriptionPrice).toBe("100");
  });

  it("SubscriptionExtended advances endTime in place at the same nonce", async () => {
    const { asset, sub } = await newScenario("extended");
    // First subscribe creates nonce 0. Second subscribe with same terms while
    // the first is still active extends nonce 0's endTime (no new nonce).
    await subscribe(world.clients, world.base.registryAddress, asset, sub, 5);
    await subscribe(world.clients, world.base.registryAddress, asset, sub, 5);
    await commitAndIndex();

    const subs = await querySubs(sub.hash);
    expect(subs.totalCount).toBe(1);
    expect(subs.items[0]!.nonce).toBe("0");
    
    expect(BigInt(subs.items[0]!.endTime)).toBeGreaterThan(
      BigInt(subs.items[0]!.startTime) + 5n,
    );
  });

  it("SubscriptionRenewed inserts a new row at the incremented nonce after a price change", async () => {
    const { asset, sub } = await newScenario("renewed");
    await subscribe(world.clients, world.base.registryAddress, asset, sub, 5);
    // Change price — next subscribe will chain a new nonce (terms differ).
    await setSubscriptionPrice(world.clients, asset.address, 300);
    await subscribe(world.clients, world.base.registryAddress, asset, sub, 5);
    await commitAndIndex();

    const subs = await querySubs(sub.hash);
    expect(subs.totalCount).toBe(2);
    expect(subs.items.map((s) => s.nonce)).toEqual(["0", "1"]);
    expect(subs.items[0]!.subscriptionPrice).toBe("100");
    expect(subs.items[1]!.subscriptionPrice).toBe("300");
    // Nonce 1's startTime must equal nonce 0's endTime (chained).
    expect(subs.items[1]!.startTime).toBe(subs.items[0]!.endTime);
  });

  it("SubscriptionRevoked truncates endTime and sets isRevoked=true", async () => {
    const { asset, sub } = await newScenario("revoked");
    await subscribe(world.clients, world.base.registryAddress, asset, sub, 100);
    await revokeSubscription(world.clients, asset.address, sub);
    await commitAndIndex();

    const subs = await querySubs(sub.hash);
    expect(subs.totalCount).toBe(1);
    expect(subs.items[0]!.isRevoked).toBe(true);
    // endTime should have been truncated below the original (count=100, dur=1
    // would put it ~100s out without revoke).
    expect(BigInt(subs.items[0]!.endTime)).toBeLessThan(
      BigInt(subs.items[0]!.startTime) + 100n,
    );
  });

  it("SubscriptionCancelled truncates endTime but leaves isRevoked=false", async () => {
    const { asset, sub } = await newScenario("cancelled");
    await subscribe(world.clients, world.base.registryAddress, asset, sub, 100);
    await cancelSubscription(world.clients, asset.address, sub);
    await commitAndIndex();

    const subs = await querySubs(sub.hash);
    expect(subs.totalCount).toBe(1);
    expect(subs.items[0]!.isRevoked).toBe(false);
    expect(BigInt(subs.items[0]!.endTime)).toBeLessThan(
      BigInt(subs.items[0]!.startTime) + 100n,
    );
  });

  it("Revoke with a chained future nonce deletes the future nonce row", async () => {
    const { asset, sub } = await newScenario("revoke-future");
    await subscribe(world.clients, world.base.registryAddress, asset, sub, 100);
    await setSubscriptionPrice(world.clients, asset.address, 200);
    // Nonce 1 chains into the future of nonce 0's endTime.
    await subscribe(world.clients, world.base.registryAddress, asset, sub, 100);
    await revokeSubscription(world.clients, asset.address, sub);
    await commitAndIndex();

    const subs = await querySubs(sub.hash);
    expect(subs.totalCount).toBe(1);
    expect(subs.items[0]!.nonce).toBe("0");
    expect(subs.items[0]!.isRevoked).toBe(true);
  });

  it("Cancel with a chained future nonce deletes the future nonce row", async () => {
    const { asset, sub } = await newScenario("cancel-future");
    await subscribe(world.clients, world.base.registryAddress, asset, sub, 100);
    await setSubscriptionPrice(world.clients, asset.address, 200);
    await subscribe(world.clients, world.base.registryAddress, asset, sub, 100);
    await cancelSubscription(world.clients, asset.address, sub);
    await commitAndIndex();

    const subs = await querySubs(sub.hash);
    expect(subs.totalCount).toBe(1);
    expect(subs.items[0]!.nonce).toBe("0");
    expect(subs.items[0]!.isRevoked).toBe(false);
  });

  it("SubscriptionRemoved fires (and deletes all rows) when subscribe + revoke land in the same block", async () => {
    const { asset, sub } = await newScenario("removed");

    await world.mineBatched(async () => {
      const subscribeHash = await dispatchSubscribe(
        world.clients,
        world.base.registryAddress,
        asset,
        sub,
        5,
      );
      const revokeHash = await dispatchRevokeSubscription(
        world.clients,
        asset.address,
        sub,
      );
      return [subscribeHash, revokeHash];
    });

    await commitAndIndex();

    const subs = await querySubs(sub.hash);
    expect(subs.totalCount).toBe(0);
  });

  it("Re-subscribe after cancel chains a new nonce (subscribers set retained)", async () => {
    const { asset, sub } = await newScenario("resubscribe-after-cancel");
    await subscribe(world.clients, world.base.registryAddress, asset, sub, 100);
    await cancelSubscription(world.clients, asset.address, sub);
    // Cancel of a single active nonce only truncates endTime — it does NOT
    // remove the subscriber from `subscribers` (that branch fires only when
    // deleted == length). So the re-subscribe goes through the chain logic
    // and creates a new nonce, leaving the cancelled row in place.
    await subscribe(world.clients, world.base.registryAddress, asset, sub, 100);
    await commitAndIndex();

    const subs = await querySubs(sub.hash);
    expect(subs.totalCount).toBe(2);
    expect(subs.items.map((s) => s.nonce)).toEqual(["0", "1"]);
    expect(subs.items[0]!.isRevoked).toBe(false);
  });

  it("Active + future cancel then re-subscribe restores nonce 1 (compound scenario)", async () => {
    const { asset, sub } = await newScenario("active-future-resubscribe");
    await subscribe(world.clients, world.base.registryAddress, asset, sub, 100);
    await setSubscriptionPrice(world.clients, asset.address, 200);
    // Nonce 1 future.
    await subscribe(world.clients, world.base.registryAddress, asset, sub, 100);
    // Cancel: nonce 1 deleted, nonce 0 truncated (still in DB, isRevoked=false).
    await cancelSubscription(world.clients, asset.address, sub);
    // Re-subscribe: contract chains a new nonce because terms differ from the
    // truncated nonce 0; new row inserted at nonce 1.
    await subscribe(world.clients, world.base.registryAddress, asset, sub, 100);
    await commitAndIndex();

    const subs = await querySubs(sub.hash);
    expect(subs.totalCount).toBe(2);
    expect(subs.items.map((s) => s.nonce)).toEqual(["0", "1"]);
    expect(subs.items[0]!.isRevoked).toBe(false);
    expect(subs.items[1]!.subscriptionPrice).toBe("200");
  });
});
