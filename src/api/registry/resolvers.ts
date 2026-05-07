import schema from "ponder:schema";
import { byId, queryList } from "../helpers.js";

export const resolvers = {
  Query: {
    registries: (_: any, a: any) => queryList(schema.RegistryEntity, a.where, a.orderBy, a.orderDirection, a.limit, a.offset),

    assetRegistry_AssetCreateds:         (_: any, a: any) => queryList(schema.AssetRegistry_AssetCreated, a.where, a.orderBy, a.orderDirection, a.limit, a.offset),
    assetRegistry_OwnershipTransferreds: (_: any, a: any) => queryList(schema.AssetRegistry_OwnershipTransferred, a.where, a.orderBy, a.orderDirection, a.limit, a.offset),
    assetRegistry_RegistryFeeShareUpdateds: (_: any, a: any) => queryList(schema.AssetRegistry_RegistryFeeShareUpdated, a.where, a.orderBy, a.orderDirection, a.limit, a.offset),
    assetRegistry_RegistryFeeClaimedBatchs: (_: any, a: any) => queryList(schema.AssetRegistry_RegistryFeeClaimedBatch, a.where, a.orderBy, a.orderDirection, a.limit, a.offset),
  },

  Registry: {
    assets: (parent: any, a: any) =>
      queryList(schema.AssetEntity, { ...a.where, registryId: parent.id }, a.orderBy, a.orderDirection, a.limit, a.offset),
  },
};
