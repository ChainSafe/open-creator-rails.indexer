import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  createAsset,
  setSubscriptionPrice,
  transferAssetOwnership,
  transferRegistryOwnership,
  updateRegistryFeeShare,
} from "./helpers/index.js";
import { setupWorld, type World } from "./setup.js";

// Anvil account index 1 — used as the "new owner" for ownership-transfer tests.
const NEW_OWNER: Address = privateKeyToAccount(
  "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
).address;

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

interface IndexedRegistry {
  address: string;
  owner: string | null;
  registryFeeShare: string | null;
}

interface IndexedAsset {
  address: string;
  owner: string;
  subscriptionPrice: string;
}

describe("entity metadata", () => {
  let world: World;

  beforeAll(async () => {
    world = await setupWorld();
  });

  afterAll(async () => {
    await world?.teardown();
  });

  async function commitAndIndex(): Promise<void> {
    await world.mine();
    await world.waitForIndex();
  }

  async function queryRegistry(): Promise<IndexedRegistry> {
    const data = await gql<{
      registries: { items: IndexedRegistry[] };
    }>(
      world.graphqlUrl,
      `{
        registries(where: { address: "${world.base.registryAddress.toLowerCase()}" }) {
          items { address owner registryFeeShare }
        }
      }`,
    );
    if (!data.registries.items[0]) {
      throw new Error("registry not indexed yet");
    }
    return data.registries.items[0];
  }

  async function queryAsset(address: Address): Promise<IndexedAsset> {
    const data = await gql<{
      assets: { items: IndexedAsset[] };
    }>(
      world.graphqlUrl,
      `{
        assets(where: { address: "${address.toLowerCase()}" }) {
          items { address owner subscriptionPrice }
        }
      }`,
    );
    if (!data.assets.items[0]) {
      throw new Error(`asset ${address} not indexed`);
    }
    return data.assets.items[0];
  }

  it("RegistryFeeShareUpdated reflects the latest fee share", async () => {
    const before = await queryRegistry();
    expect(before.registryFeeShare).toBe(String(world.base.registryFeeShare));

    await updateRegistryFeeShare(world.clients, world.base.registryAddress, 50);
    await commitAndIndex();

    const after = await queryRegistry();
    expect(after.registryFeeShare).toBe("50");
  });

  it("SubscriptionPriceUpdated updates AssetEntity.subscriptionPrice", async () => {
    const asset = await createAsset(
      world.clients,
      world.base.registryAddress,
      "metadata_price",
      2,
      1,
      world.base.tokenAddress,
      world.base.deployer,
    );
    await setSubscriptionPrice(world.clients, asset.address, 99);
    await commitAndIndex();

    const indexed = await queryAsset(asset.address);
    expect(indexed.subscriptionPrice).toBe("99");
  });

  it("Asset:OwnershipTransferred updates AssetEntity.owner", async () => {
    const asset = await createAsset(
      world.clients,
      world.base.registryAddress,
      "metadata_asset_owner",
      2,
      1,
      world.base.tokenAddress,
      world.base.deployer,
    );

    await transferAssetOwnership(world.clients, asset.address, NEW_OWNER);
    await commitAndIndex();

    const indexed = await queryAsset(asset.address);
    expect(indexed.owner).toBe(NEW_OWNER.toLowerCase());
  });

  it("AssetRegistry:OwnershipTransferred updates RegistryEntity.owner", async () => {
    // Run last in this file: transferring registry ownership revokes deployer's
    // permission to call owner-only registry functions for the rest of the run.
    const before = await queryRegistry();
    expect(before.owner).toBe(world.base.deployer.toLowerCase());

    await transferRegistryOwnership(
      world.clients,
      world.base.registryAddress,
      NEW_OWNER,
    );
    await commitAndIndex();

    const after = await queryRegistry();
    expect(after.owner).toBe(NEW_OWNER.toLowerCase());
  });
});
