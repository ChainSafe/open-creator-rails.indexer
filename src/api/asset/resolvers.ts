import { db } from "ponder:api";
import schema from "ponder:schema";
import { eq, sql } from "ponder";
import { byId, queryList, activeSubscriptionConditions, expiringConditions } from "../helpers.js";
import { getAssetEntityId, getSubscriberClaimableId } from "../../utils";

// Claimable resolvers read from the SubscriberClaimable rollup maintained by
// src/handlers/claimable.ts. They are pure DB lookups — no math happens here.
// `asOf*` reflects the rollup row's last refresh (most recent event or
// block-interval refresh, whichever is more recent).
const claimableForSubscriber = async (chainId: number, assetAddress: string, subscriber: string) => {
  const id = getSubscriberClaimableId(chainId, assetAddress, subscriber);
  const [row] = await (db as any)
    .select({
      creatorFee: schema.SubscriberClaimable.creatorFee,
      registryFee: schema.SubscriberClaimable.registryFee,
      refreshedAtTimestamp: schema.SubscriberClaimable.refreshedAtTimestamp,
      refreshedAtBlock: schema.SubscriberClaimable.refreshedAtBlock,
    })
    .from(schema.SubscriberClaimable)
    .where(eq(schema.SubscriberClaimable.id, id))
    .limit(1);

  if (!row) return { creatorFee: 0n, registryFee: 0n, asOfTimestamp: 0n, asOfBlock: 0n };
  return {
    creatorFee: BigInt(row.creatorFee),
    registryFee: BigInt(row.registryFee),
    asOfTimestamp: BigInt(row.refreshedAtTimestamp),
    asOfBlock: BigInt(row.refreshedAtBlock),
  };
};

const claimableForAsset = async (chainId: number, assetAddress: string) => {
  const assetEntityId = getAssetEntityId(chainId, assetAddress);
  // Single aggregate query: SUM the fees, COUNT the rows, MIN the refreshedAt
  // (most-stale row in the aggregate — the honest staleness floor).
  const [agg] = await (db as any)
    .select({
      creatorFee: sql<string>`COALESCE(SUM(${schema.SubscriberClaimable.creatorFee}), 0)`,
      registryFee: sql<string>`COALESCE(SUM(${schema.SubscriberClaimable.registryFee}), 0)`,
      subscriberCount: sql<string>`COUNT(*)`,
      asOfTimestamp: sql<string>`COALESCE(MIN(${schema.SubscriberClaimable.refreshedAtTimestamp}), 0)`,
      asOfBlock: sql<string>`COALESCE(MIN(${schema.SubscriberClaimable.refreshedAtBlock}), 0)`,
    })
    .from(schema.SubscriberClaimable)
    .where(eq(schema.SubscriberClaimable.assetEntityId, assetEntityId));

  return {
    creatorFee: BigInt(agg?.creatorFee ?? 0),
    registryFee: BigInt(agg?.registryFee ?? 0),
    asOfTimestamp: BigInt(agg?.asOfTimestamp ?? 0),
    asOfBlock: BigInt(agg?.asOfBlock ?? 0),
    subscriberCount: Number(agg?.subscriberCount ?? 0),
  };
};

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
    expiringSubscriptions: (parent: any, a: any) =>
      queryList(
        schema.Subscription,
        { ...a.where, assetId: parent.id },
        a.orderBy ?? "endTime",
        a.orderDirection ?? "asc",
        a.limit,
        a.offset,
        expiringConditions(BigInt(a.within)),
      ),
    claimable:      (parent: any, a: any) => claimableForSubscriber(parent.chainId, parent.address, a.subscriber),
    claimableTotal: (parent: any) => claimableForAsset(parent.chainId, parent.address),
  },

  Asset_CreatorFeeClaimed: {
    subscription: (parent: any) => parent.subscriptionId ? byId(schema.Subscription, parent.subscriptionId) : null,
  },
};
