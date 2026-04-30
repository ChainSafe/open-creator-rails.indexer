import schema from "ponder:schema";
import { byId, queryList, activeSubscriptionConditions } from "../helpers.js";

export const resolvers = {
  Query: {
    subscriptions: (_: any, a: any) => queryList(schema.Subscription, a.where, a.orderBy, a.orderDirection, a.limit, a.offset),
    activeSubscriptions: (_: any, a: any) => queryList(schema.Subscription, a.where, a.orderBy, a.orderDirection, a.limit, a.offset, activeSubscriptionConditions()),
  },

  Subscription: {
    asset: (parent: any) => byId(schema.AssetEntity, parent.assetId),
    isActive: (parent: any) => {
      const now = BigInt(Math.floor(Date.now() / 1000));
      return !parent.isTerminated && parent.startTime <= now && now < parent.endTime;
    },
  },
};
