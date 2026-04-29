export const typeDefs = /* GraphQL */ `
  type AssetEntity {
    id: String! chainId: Int! assetId: String! address: String!
    registryId: String! registryAddress: String! owner: String!
    subscriptionPrice: BigInt! tokenAddress: String!
    registry: RegistryEntity
    subscriptions(where: SubscriptionFilter, orderBy: String, orderDirection: String, limit: Int, offset: Int): SubscriptionPage
  }
  type AssetEntityPage { items: [AssetEntity!]! pageInfo: PageInfo! totalCount: Int! }
  input AssetEntityFilter {
    id: String  chainId: Int  assetId: String  address: Address
    registryId: String  registryAddress: Address  owner: Address
  }

  type Asset_SubscriptionAdded {
    id: String! chainId: Int! subscriber: String! payer: String!
    startTime: BigInt! endTime: BigInt! nonce: BigInt!
    assetAddress: Address! blockNumber: BigInt! blockTimestamp: BigInt!
  }
  type Asset_SubscriptionAddedPage { items: [Asset_SubscriptionAdded!]! pageInfo: PageInfo! totalCount: Int! }
  input Asset_SubscriptionAddedFilter {
    id: String  chainId: Int  subscriber: String  payer: Address  assetAddress: Address
  }

  type Asset_SubscriptionExtended {
    id: String! chainId: Int! subscriber: String! endTime: BigInt!
    assetAddress: Address! blockNumber: BigInt! blockTimestamp: BigInt!
  }
  type Asset_SubscriptionExtendedPage { items: [Asset_SubscriptionExtended!]! pageInfo: PageInfo! totalCount: Int! }
  input Asset_SubscriptionExtendedFilter {
    id: String  chainId: Int  subscriber: String  assetAddress: Address
  }

  type Asset_CreatorFeeClaimed {
    id: String! chainId: Int! subscriber: String! amount: BigInt!
    assetAddress: Address! blockNumber: BigInt! blockTimestamp: BigInt!
  }
  type Asset_CreatorFeeClaimedPage { items: [Asset_CreatorFeeClaimed!]! pageInfo: PageInfo! totalCount: Int! }
  input Asset_CreatorFeeClaimedFilter {
    id: String  chainId: Int  subscriber: String  assetAddress: Address
  }

  type Asset_SubscriptionPriceUpdated {
    id: String! chainId: Int! newSubscriptionPrice: BigInt!
    assetAddress: Address! blockNumber: BigInt! blockTimestamp: BigInt!
  }
  type Asset_SubscriptionPriceUpdatedPage { items: [Asset_SubscriptionPriceUpdated!]! pageInfo: PageInfo! totalCount: Int! }
  input Asset_SubscriptionPriceUpdatedFilter {
    id: String  chainId: Int  assetAddress: Address
  }

  type Asset_SubscriptionRevoked {
    id: String! chainId: Int! subscriber: String!
    assetAddress: Address! blockNumber: BigInt! blockTimestamp: BigInt!
  }
  type Asset_SubscriptionRevokedPage { items: [Asset_SubscriptionRevoked!]! pageInfo: PageInfo! totalCount: Int! }
  input Asset_SubscriptionRevokedFilter {
    id: String  chainId: Int  subscriber: String  assetAddress: Address
  }

  type Asset_SubscriptionCancelled {
    id: String! chainId: Int! subscriber: String!
    assetAddress: Address! blockNumber: BigInt! blockTimestamp: BigInt!
  }
  type Asset_SubscriptionCancelledPage { items: [Asset_SubscriptionCancelled!]! pageInfo: PageInfo! totalCount: Int! }
  input Asset_SubscriptionCancelledFilter {
    id: String  chainId: Int  subscriber: String  assetAddress: Address
  }

  type Asset_OwnershipTransferred {
    id: String! chainId: Int! previousOwner: String! newOwner: String!
    assetAddress: Address! blockNumber: BigInt! blockTimestamp: BigInt!
  }
  type Asset_OwnershipTransferredPage { items: [Asset_OwnershipTransferred!]! pageInfo: PageInfo! totalCount: Int! }
  input Asset_OwnershipTransferredFilter {
    id: String  chainId: Int  previousOwner: Address  newOwner: Address  assetAddress: Address
  }

  extend type Query {
    assetEntitys(where: AssetEntityFilter, orderBy: String, orderDirection: String, limit: Int, offset: Int): AssetEntityPage!

    asset_SubscriptionAddeds(where: Asset_SubscriptionAddedFilter, orderBy: String, orderDirection: String, limit: Int, offset: Int): Asset_SubscriptionAddedPage!

    asset_SubscriptionExtendeds(where: Asset_SubscriptionExtendedFilter, orderBy: String, orderDirection: String, limit: Int, offset: Int): Asset_SubscriptionExtendedPage!

    asset_CreatorFeeClaimeds(where: Asset_CreatorFeeClaimedFilter, orderBy: String, orderDirection: String, limit: Int, offset: Int): Asset_CreatorFeeClaimedPage!

    asset_SubscriptionPriceUpdateds(where: Asset_SubscriptionPriceUpdatedFilter, orderBy: String, orderDirection: String, limit: Int, offset: Int): Asset_SubscriptionPriceUpdatedPage!

    asset_SubscriptionRevokeds(where: Asset_SubscriptionRevokedFilter, orderBy: String, orderDirection: String, limit: Int, offset: Int): Asset_SubscriptionRevokedPage!

    asset_SubscriptionCancelleds(where: Asset_SubscriptionCancelledFilter, orderBy: String, orderDirection: String, limit: Int, offset: Int): Asset_SubscriptionCancelledPage!

    asset_OwnershipTransferreds(where: Asset_OwnershipTransferredFilter, orderBy: String, orderDirection: String, limit: Int, offset: Int): Asset_OwnershipTransferredPage!
  }
`;
