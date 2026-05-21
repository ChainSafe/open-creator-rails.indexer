import schema from "ponder:schema";
import { byId, queryList, activeSubscriptionConditions, expiringConditions } from "../helpers.js";

export const resolvers = {
  Query: {
    subscriptions: (_: any, a: any) => queryList(schema.Subscription, a.where, a.orderBy, a.orderDirection, a.limit, a.offset),
    activeSubscriptions: (_: any, a: any) => queryList(schema.Subscription, a.where, a.orderBy, a.orderDirection, a.limit, a.offset, activeSubscriptionConditions()),
    expiringSubscriptions: (_: any, a: any) =>
      queryList(
        schema.Subscription,
        a.where,
        a.orderBy ?? "endTime",
        a.orderDirection ?? "asc",
        a.limit,
        a.offset,
        expiringConditions(BigInt(a.within)),
      ),
  },

  Subscription: {
    asset: (parent: any) => byId(schema.AssetEntity, parent.assetId),
    isExpired: (parent: any) => {
      const now = BigInt(Math.floor(Date.now() / 1000));
      return now >= parent.endTime;
    },
    isActive: (parent: any) => {
      const now = BigInt(Math.floor(Date.now() / 1000));
      return !parent.isRevoked && parent.startTime <= now && now < parent.endTime;
    },
  },
};
