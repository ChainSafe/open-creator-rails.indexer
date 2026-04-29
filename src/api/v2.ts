import { createYoga, createSchema } from "graphql-yoga";
import { createMiddleware } from "hono/factory";
import { BigIntScalar, JSONScalar, AddressScalar, getMeta } from "./helpers.js";
import * as registry from "./registry/index.js";
import * as asset from "./asset/index.js";
import * as subscription from "./subscription/index.js";

const baseDefs = /* GraphQL */ `
  scalar BigInt
  scalar JSON
  scalar Address

  type PageInfo { hasNextPage: Boolean! hasPreviousPage: Boolean! }
  type Meta { status: JSON }

  type Query { _meta: Meta }
`;

const yoga = createYoga({
  graphqlEndpoint: "*",
  schema: createSchema({
    typeDefs: [baseDefs, registry.typeDefs, asset.typeDefs, subscription.typeDefs],
    resolvers: [
      { BigInt: BigIntScalar, JSON: JSONScalar, Address: AddressScalar, Query: { _meta: () => getMeta() } },
      registry.resolvers,
      asset.resolvers,
      subscription.resolvers,
    ],
  }),
  maskedErrors: process.env.NODE_ENV === "production",
  logging: false,
  graphiql: true,
  parserAndValidationCache: false,
});

export const graphqlV2 = createMiddleware(async (c) => {
  const response = await yoga.handle(c.req.raw);
  return new Response(response.body, { status: 200, headers: new Headers(response.headers) });
});
