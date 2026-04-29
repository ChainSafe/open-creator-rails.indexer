export const typeDefs = /* GraphQL */ `
  type Subscription {
    id: String! chainId: Int! assetId: String! subscriber: String! payer: String!
    startTime: BigInt! endTime: BigInt! nonce: BigInt! isActive: Boolean!
    asset: AssetEntity
  }
  
  type SubscriptionPage { items: [Subscription!]! pageInfo: PageInfo! totalCount: Int! }
  
  input SubscriptionFilter {
    id: String  chainId: Int  assetId: String  subscriber: String  payer: Address
  }

  extend type Query {
    subscriptions(where: SubscriptionFilter, orderBy: String, orderDirection: String, limit: Int, offset: Int): SubscriptionPage!
  }
`;
