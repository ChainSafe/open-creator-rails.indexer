import schema from "ponder:schema";
import { byId, queryList, activeSubscriptionConditions } from "../helpers.js";

export const resolvers = {
  Query: {
    assets: (_: any, a: any) => queryList(schema.AssetEntity, a.where, a.orderBy, a.orderDirection, a.limit, a.offset),

    asset_SubscriptionAddeds:    (_: any, a: any) => queryList(schema.Asset_SubscriptionAdded, a.where, a.orderBy, a.orderDirection, a.limit, a.offset),
    asset_SubscriptionExtendeds: (_: any, a: any) => queryList(schema.Asset_SubscriptionExtended, a.where, a.orderBy, a.orderDirection, a.limit, a.offset),
    asset_CreatorFeeClaimeds:    (_: any, a: any) => queryList(schema.Asset_CreatorFeeClaimed, a.where, a.orderBy, a.orderDirection, a.limit, a.offset),
    asset_SubscriptionPriceUpdateds: (_: any, a: any) => queryList(schema.Asset_SubscriptionPriceUpdated, a.where, a.orderBy, a.orderDirection, a.limit, a.offset),
    asset_SubscriptionRevokeds:  (_: any, a: any) => queryList(schema.Asset_SubscriptionRevoked, a.where, a.orderBy, a.orderDirection, a.limit, a.offset),
    asset_SubscriptionCancelleds: (_: any, a: any) => queryList(schema.Asset_SubscriptionCancelled, a.where, a.orderBy, a.orderDirection, a.limit, a.offset),
    asset_OwnershipTransferreds: (_: any, a: any) => queryList(schema.Asset_OwnershipTransferred, a.where, a.orderBy, a.orderDirection, a.limit, a.offset),
  },

  Asset: {
    registry:      (parent: any) => byId(schema.RegistryEntity, parent.registryId),
    subscriptions: (parent: any, a: any) =>
      queryList(schema.Subscription, { ...a.where, assetId: parent.id }, a.orderBy, a.orderDirection, a.limit, a.offset),
    activeSubscriptions: (parent: any, a: any) =>
      queryList(schema.Subscription, { ...a.where, assetId: parent.id }, a.orderBy, a.orderDirection, a.limit, a.offset, activeSubscriptionConditions()),
  },
};
