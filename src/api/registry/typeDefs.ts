export const typeDefs = /* GraphQL */ `
  type RegistryEntity {
    id: String! chainId: Int! address: String! owner: String registryFeeShare: BigInt
    assets(where: AssetEntityFilter, orderBy: String, orderDirection: String, limit: Int, offset: Int): AssetEntityPage
  }
  type RegistryEntityPage { items: [RegistryEntity!]! pageInfo: PageInfo! totalCount: Int! }
  input RegistryEntityFilter {
    id: String  chainId: Int  address: Address  owner: Address
  }

  type AssetRegistry_AssetCreated {
    id: String! chainId: Int! assetId: String! asset: String!
    subscriptionPrice: BigInt! tokenAddress: String! owner: String!
    registryAddress: String! blockNumber: BigInt! blockTimestamp: BigInt!
  }
  type AssetRegistry_AssetCreatedPage { items: [AssetRegistry_AssetCreated!]! pageInfo: PageInfo! totalCount: Int! }
  input AssetRegistry_AssetCreatedFilter {
    id: String  chainId: Int  assetId: String  asset: Address  owner: Address  registryAddress: Address
  }

  type AssetRegistry_OwnershipTransferred {
    id: String! chainId: Int! previousOwner: String! newOwner: String!
    registryAddress: String! blockNumber: BigInt! blockTimestamp: BigInt!
  }
  type AssetRegistry_OwnershipTransferredPage { items: [AssetRegistry_OwnershipTransferred!]! pageInfo: PageInfo! totalCount: Int! }
  input AssetRegistry_OwnershipTransferredFilter {
    id: String  chainId: Int  previousOwner: Address  newOwner: Address  registryAddress: Address
  }

  type AssetRegistry_RegistryFeeShareUpdated {
    id: String! chainId: Int! newRegistryFeeShare: BigInt!
    registryAddress: String! blockNumber: BigInt! blockTimestamp: BigInt!
  }
  type AssetRegistry_RegistryFeeShareUpdatedPage { items: [AssetRegistry_RegistryFeeShareUpdated!]! pageInfo: PageInfo! totalCount: Int! }
  input AssetRegistry_RegistryFeeShareUpdatedFilter {
    id: String  chainId: Int  newRegistryFeeShare: BigInt  registryAddress: Address
  }

  type AssetRegistry_RegistryFeeClaimedBatch {
    id: String! chainId: Int! assetId: String! totalAmount: BigInt!
    registryAddress: String! blockNumber: BigInt! blockTimestamp: BigInt!
  }
  type AssetRegistry_RegistryFeeClaimedBatchPage { items: [AssetRegistry_RegistryFeeClaimedBatch!]! pageInfo: PageInfo! totalCount: Int! }
  input AssetRegistry_RegistryFeeClaimedBatchFilter {
    id: String  chainId: Int  assetId: String  registryAddress: Address
  }

  extend type Query {
    registryEntitys(where: RegistryEntityFilter, orderBy: String, orderDirection: String, limit: Int, offset: Int): RegistryEntityPage!

    assetRegistry_AssetCreateds(where: AssetRegistry_AssetCreatedFilter, orderBy: String, orderDirection: String, limit: Int, offset: Int): AssetRegistry_AssetCreatedPage!

    assetRegistry_OwnershipTransferreds(where: AssetRegistry_OwnershipTransferredFilter, orderBy: String, orderDirection: String, limit: Int, offset: Int): AssetRegistry_OwnershipTransferredPage!

    assetRegistry_RegistryFeeShareUpdateds(where: AssetRegistry_RegistryFeeShareUpdatedFilter, orderBy: String, orderDirection: String, limit: Int, offset: Int): AssetRegistry_RegistryFeeShareUpdatedPage!

    assetRegistry_RegistryFeeClaimedBatchs(where: AssetRegistry_RegistryFeeClaimedBatchFilter, orderBy: String, orderDirection: String, limit: Int, offset: Int): AssetRegistry_RegistryFeeClaimedBatchPage!
  }
`;
