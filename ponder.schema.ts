import { onchainTable, index, relations } from "ponder";

// --- Entities (Mutable State) ---

// RegistryEntity is bootstrapped from the OwnershipTransferred event emitted by
// OpenZeppelin's Ownable constructor (Ownable(msg.sender)) when the registry is
// deployed. AssetRegistry has no dedicated "RegistryCreated" event, so this is
// the earliest signal we have that a registry exists on-chain.
//
// Consequence: `owner` is populated on deploy, but `registryFeeShare` remains
// null until updateRegistryFeeShare() is called — the constructor sets the
// initial fee share without emitting RegistryFeeShareUpdated.
export const RegistryEntity = onchainTable("registry_entity", (t) => ({
  id: t.text().primaryKey(),             // Composite: `${chainId}_${registryAddress}`
  chainId: t.integer().notNull(),
  address: t.text().notNull(),
  owner: t.text(),                       // null until OwnershipTransferred is seen
  registryFeeShare: t.bigint(),          // null until RegistryFeeShareUpdated is seen
}), (table) => ({
  chainIdIdx: index().on(table.chainId),
  ownerIdx: index().on(table.owner),
}));

export const AssetEntity = onchainTable("asset_entity", (t) => ({
  id: t.text().primaryKey(),              // Composite: `${chainId}_${assetAddress}`
  chainId: t.integer().notNull(),
  assetId: t.text().notNull(),            // Registry asset ID
  address: t.text().notNull(),
  registryId: t.text().notNull(),         // FK → RegistryEntity.id: `${chainId}_${registryAddress}`
  registryAddress: t.text().notNull(),
  owner: t.text().notNull(),
  subscriptionPrice: t.bigint().notNull(), // Current price per second; updated by SubscriptionPriceUpdated
  tokenAddress: t.text().notNull(),        // Immutable ERC-20 payment token set at deployment
}), (table) => ({
  chainIdIdx: index().on(table.chainId),
  ownerIdx: index().on(table.owner),
  registryIdIdx: index().on(table.registryId),
  registryAddressIdx: index().on(table.registryAddress),
  assetIdIdx: index().on(table.assetId),
}));

// One row per asset–subscriber–nonce. The contract issues a new nonce whenever
// terms change mid-subscription (price, payer, fee share); each nonce is an
// independent row. SubscriptionExtended updates the latest nonce's endTime.
// Revoke/cancel marks all non-terminated rows isTerminated=true.
export const Subscription = onchainTable("subscription", (t) => ({
  id: t.text().primaryKey(),       // Composite: `${AssetEntity.id}_${subscriber}_${nonce}`
  chainId: t.integer().notNull(),
  assetId: t.text().notNull(),     // Links to AssetEntity.id
  subscriber: t.text().notNull(),  // bytes32 subscriber identity hash
  payer: t.text().notNull(),       // address that paid for this nonce
  startTime: t.bigint().notNull(), // subscription start for this nonce
  endTime: t.bigint().notNull(),   // current expiry (updated by SubscriptionExtended)
  nonce: t.bigint().notNull(),     // on-chain nonce (increments when terms change)
  isTerminated: t.boolean().notNull(), // true when revoked or cancelled
}), (table) => ({
  chainIdIdx: index().on(table.chainId),
  assetIdIdx: index().on(table.assetId),
  subscriberIdx: index().on(table.subscriber),
  payerIdx: index().on(table.payer),
  nonceIdx: index().on(table.nonce),
  startTimeIdx: index().on(table.startTime),
  endTimeIdx: index().on(table.endTime),
}));

// --- Relations ---

export const registryEntityRelations = relations(RegistryEntity, ({ many }) => ({
  assets: many(AssetEntity),
}));

export const assetEntityRelations = relations(AssetEntity, ({ one, many }) => ({
  registry: one(RegistryEntity, {
    fields: [AssetEntity.registryId],
    references: [RegistryEntity.id],
  }),
  subscriptions: many(Subscription),
}));

export const subscriptionRelations = relations(Subscription, ({ one }) => ({
  asset: one(AssetEntity, {
    fields: [Subscription.assetId],
    references: [AssetEntity.id],
  }),
}));

// --- Events (Immutable History) ---
// Note: Ponder doesn't enforce "History" tables but they are useful for analytics

export const AssetRegistry_AssetCreated = onchainTable("asset_registry_asset_created", (t) => ({
  id: t.text().primaryKey(),       // Composite: `${chainId}-${event.transaction.hash}-${event.log.logIndex}`
  chainId: t.integer().notNull(),
  assetId: t.text().notNull(),
  asset: t.text().notNull(),
  subscriptionPrice: t.bigint().notNull(),
  tokenAddress: t.text().notNull(),
  owner: t.text().notNull(),
  registryAddress: t.text().notNull(),
  blockNumber: t.bigint().notNull(),
  blockTimestamp: t.bigint().notNull(),
}), (table) => ({
  chainIdIdx: index().on(table.chainId),
  assetIdx: index().on(table.asset),
  registryAddressIdx: index().on(table.registryAddress),
}));

export const AssetRegistry_OwnershipTransferred = onchainTable("asset_registry_ownership_transferred", (t) => ({
  id: t.text().primaryKey(),        // Composite: `${chainId}-${event.transaction.hash}-${event.log.logIndex}`
  chainId: t.integer().notNull(),
  previousOwner: t.text().notNull(),
  newOwner: t.text().notNull(),
  registryAddress: t.text().notNull(),
  blockNumber: t.bigint().notNull(),
  blockTimestamp: t.bigint().notNull(),
}), (table) => ({
  chainIdIdx: index().on(table.chainId),
  previousOwnerIdx: index().on(table.previousOwner),
  newOwnerIdx: index().on(table.newOwner),
  registryAddressIdx: index().on(table.registryAddress),
}));

export const AssetRegistry_RegistryFeeShareUpdated = onchainTable("asset_registry_registry_fee_share_updated", (t) => ({
  id: t.text().primaryKey(),       // Composite: `${chainId}-${event.transaction.hash}-${event.log.logIndex}`
  chainId: t.integer().notNull(),
  newRegistryFeeShare: t.bigint().notNull(),
  registryAddress: t.text().notNull(),
  blockNumber: t.bigint().notNull(),
  blockTimestamp: t.bigint().notNull(),
}), (table) => ({
  chainIdIdx: index().on(table.chainId),
  registryAddressIdx: index().on(table.registryAddress),
}));

export const AssetRegistry_RegistryFeeClaimedBatch = onchainTable("asset_registry_registry_fee_claimed_batch", (t) => ({
  id: t.text().primaryKey(),    // Composite: `${chainId}-${event.transaction.hash}-${event.log.logIndex}`
  chainId: t.integer().notNull(),
  assetId: t.text().notNull(),
  totalAmount: t.bigint().notNull(),
  registryAddress: t.text().notNull(),
  blockNumber: t.bigint().notNull(),
  blockTimestamp: t.bigint().notNull(),
}), (table) => ({
  chainIdIdx: index().on(table.chainId),
  assetIdIdx: index().on(table.assetId),
  registryAddressIdx: index().on(table.registryAddress),
}));

export const Asset_SubscriptionAdded = onchainTable("asset_subscription_added", (t) => ({
  id: t.text().primaryKey(),   // Composite: `${chainId}-${event.transaction.hash}-${event.log.logIndex}`
  chainId: t.integer().notNull(),
  subscriber: t.text().notNull(),
  payer: t.text().notNull(),
  startTime: t.bigint().notNull(),
  endTime: t.bigint().notNull(),
  nonce: t.bigint().notNull(),
  assetAddress: t.text().notNull(),
  blockNumber: t.bigint().notNull(),
  blockTimestamp: t.bigint().notNull(),
}), (table) => ({
  chainIdIdx: index().on(table.chainId),
  subscriberIdx: index().on(table.subscriber),
  payerIdx: index().on(table.payer),
  assetAddressIdx: index().on(table.assetAddress),
}));

export const Asset_SubscriptionExtended = onchainTable("asset_subscription_extended", (t) => ({
  id: t.text().primaryKey(),  // Composite: `${chainId}-${event.transaction.hash}-${event.log.logIndex}`
  chainId: t.integer().notNull(),
  subscriber: t.text().notNull(),
  endTime: t.bigint().notNull(),
  assetAddress: t.text().notNull(),
  blockNumber: t.bigint().notNull(),
  blockTimestamp: t.bigint().notNull(),
}), (table) => ({
  chainIdIdx: index().on(table.chainId),
  subscriberIdx: index().on(table.subscriber),
  assetAddressIdx: index().on(table.assetAddress),
}));

export const Asset_CreatorFeeClaimed = onchainTable("asset_creator_fee_claimed", (t) => ({
  id: t.text().primaryKey(),   // Composite: `${chainId}-${event.transaction.hash}-${event.log.logIndex}`
  chainId: t.integer().notNull(),
  subscriber: t.text().notNull(),
  amount: t.bigint().notNull(),
  assetAddress: t.text().notNull(),
  blockNumber: t.bigint().notNull(),
  blockTimestamp: t.bigint().notNull(),
}), (table) => ({
  chainIdIdx: index().on(table.chainId),
  subscriberIdx: index().on(table.subscriber),
  assetAddressIdx: index().on(table.assetAddress),
}));

export const Asset_SubscriptionPriceUpdated = onchainTable("asset_subscription_price_updated", (t) => ({
  id: t.text().primaryKey(),   // Composite: `${chainId}-${event.transaction.hash}-${event.log.logIndex}`
  chainId: t.integer().notNull(),
  newSubscriptionPrice: t.bigint().notNull(),
  assetAddress: t.text().notNull(),
  blockNumber: t.bigint().notNull(),
  blockTimestamp: t.bigint().notNull(),
}), (table) => ({
  chainIdIdx: index().on(table.chainId),
  assetAddressIdx: index().on(table.assetAddress),
}));

export const Asset_SubscriptionRevoked = onchainTable("asset_subscription_revoked", (t) => ({
  id: t.text().primaryKey(),  // Composite: `${chainId}-${event.transaction.hash}-${event.log.logIndex}`
  chainId: t.integer().notNull(),
  subscriber: t.text().notNull(),
  assetAddress: t.text().notNull(),
  blockNumber: t.bigint().notNull(),
  blockTimestamp: t.bigint().notNull(),
}), (table) => ({
  chainIdIdx: index().on(table.chainId),
  subscriberIdx: index().on(table.subscriber),
  assetAddressIdx: index().on(table.assetAddress),
}));

export const Asset_SubscriptionCancelled = onchainTable("asset_subscription_cancelled", (t) => ({
  id: t.text().primaryKey(),   // Composite: `${chainId}-${event.transaction.hash}-${event.log.logIndex}`
  chainId: t.integer().notNull(),
  subscriber: t.text().notNull(),
  assetAddress: t.text().notNull(),
  blockNumber: t.bigint().notNull(),
  blockTimestamp: t.bigint().notNull(),
}), (table) => ({
  chainIdIdx: index().on(table.chainId),
  subscriberIdx: index().on(table.subscriber),
  assetAddressIdx: index().on(table.assetAddress),
}));

export const Asset_OwnershipTransferred = onchainTable("asset_ownership_transferred", (t) => ({
  id: t.text().primaryKey(),  // Composite: `${chainId}-${event.transaction.hash}-${event.log.logIndex}`
  chainId: t.integer().notNull(),
  previousOwner: t.text().notNull(),
  newOwner: t.text().notNull(),
  assetAddress: t.text().notNull(),
  blockNumber: t.bigint().notNull(),
  blockTimestamp: t.bigint().notNull(),
}), (table) => ({
  chainIdIdx: index().on(table.chainId),
  previousOwnerIdx: index().on(table.previousOwner),
  newOwnerIdx: index().on(table.newOwner),
  assetAddressIdx: index().on(table.assetAddress),
}));
