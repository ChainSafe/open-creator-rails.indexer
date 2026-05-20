import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createAsset } from "./seed/scenarios.js";
import { setupWorld, type World } from "./setup.js";

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

describe("e2e smoke", () => {
  let world: World;

  beforeAll(async () => {
    world = await setupWorld();
  });

  afterAll(async () => {
    await world?.teardown();
  });

  it("indexes the base registry deployed in setup", async () => {
    const { registries } = await gql<{
      registries: {
        totalCount: number;
        items: { id: string; chainId: number; address: string }[];
      };
    }>(
      world.graphqlUrl,
      `{ registries { totalCount items { id chainId address } } }`,
    );

    expect(registries.totalCount).toBe(1);
    expect(registries.items[0]!.chainId).toBe(31337);
    expect(registries.items[0]!.address).toBe(
      world.base.registryAddress.toLowerCase(),
    );
  });

  it("indexes an asset created mid-test", async () => {
    const asset = await createAsset(
      world.clients,
      world.base.registryAddress,
      "local_asset_1",
      2,
      1,
      world.base.tokenAddress,
      world.base.deployer,
    );

    await world.mine();
    await world.waitForIndex();

    const { assets } = await gql<{
      assets: {
        totalCount: number;
        items: {
          assetId: string;
          address: string;
          registryAddress: string;
          subscriptionPrice: string;
          subscriptionDuration: string;
        }[];
      };
    }>(
      world.graphqlUrl,
      `{ assets { totalCount items { assetId address registryAddress subscriptionPrice subscriptionDuration } } }`,
    );

    expect(assets.totalCount).toBe(1);
    const indexed = assets.items[0]!;
    // AssetEntity.assetId stores the on-chain bytes32 (keccak of the
    // human-readable label), not the label itself.
    expect(indexed.assetId).toBe(asset.assetIdHash);
    expect(indexed.address).toBe(asset.address.toLowerCase());
    expect(indexed.registryAddress).toBe(world.base.registryAddress.toLowerCase());
    expect(indexed.subscriptionPrice).toBe(String(asset.subscriptionPrice));
    expect(indexed.subscriptionDuration).toBe(String(asset.subscriptionDuration));
  });
});
