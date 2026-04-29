import schema from "ponder:schema";
import { byId, queryList } from "../helpers.js";

export const resolvers = {
  Query: {
    subscriptions: (_: any, a: any) => queryList(schema.Subscription, a.where, a.orderBy, a.orderDirection, a.limit, a.offset),
  },

  Subscription: {
    asset: (parent: any) => byId(schema.AssetEntity, parent.assetId),
  },
};
