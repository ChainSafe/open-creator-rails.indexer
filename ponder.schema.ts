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
  subscriptionPrice: t.bigint().notNull(),    // Current price per subscription period; updated by SubscriptionPriceUpdated
  subscriptionDuration: t.bigint().notNull(), // Immutable period length in seconds; subscriptions are whole multiples
  tokenAddress: t.text().notNull(),           // Immutable ERC-20 payment token set at deployment
}), (table) => ({
  chainIdIdx: index().on(table.chainId),
  ownerIdx: index().on(table.owner),
  registryIdIdx: index().on(table.registryId),
  registryAddressIdx: index().on(table.registryAddress),
  assetIdIdx: index().on(table.assetId),
}));

// One row per asset–subscriber–nonce. Nonce 0 created by SubscriptionAdded;
// subsequent nonces by SubscriptionRenewed (terms changed). SubscriptionExtended
// updates the latest nonce's endTime in-place.
// Revoke truncates endTime and sets isRevoked=true; cancel only truncates endTime.
// Future nonces and all-future-deleted subscribers (SubscriptionRemoved) are
// removed from the DB entirely.
export const Subscription = onchainTable("subscription", (t) => ({
  id: t.text().primaryKey(),       // Composite: `${AssetEntity.id}_${subscriber}_${nonce}`
  chainId: t.integer().notNull(),
  assetId: t.text().notNull(),     // Links to AssetEntity.id
  subscriber: t.text().notNull(),  // bytes32 subscriber identity hash
  payer: t.text().notNull(),       // address that paid for this nonce
  startTime: t.bigint().notNull(), // subscription start for this nonce
  endTime: t.bigint().notNull(),   // current expiry (updated by SubscriptionExtended; truncated on revoke/cancel)
  nonce: t.bigint().notNull(),              // on-chain nonce (increments when terms change)
  subscriptionPrice: t.bigint().notNull(), // price per subscription period at time of subscription
  registryFeeShare: t.bigint().notNull(),  // registry fee share at time of subscription
  isRevoked: t.boolean().notNull(),        // true only when owner explicitly revoked (SubscriptionRevoked)
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

export const subscriptionRelations = relations(Subscription, ({ one, many }) => ({
  asset: one(AssetEntity, {
    fields: [Subscription.assetId],
    references: [AssetEntity.id],
  }),
  creatorFeeClaims: many(Asset_CreatorFeeClaimed),
  registryFeeClaims: many(AssetRegistry_RegistryFeeClaimed),
}));

// --- Events (Immutable History) ---
// Note: Ponder doesn't enforce "History" tables but they are useful for analytics

export const AssetRegistry_AssetCreated = onchainTable("asset_registry_asset_created", (t) => ({
  id: t.text().primaryKey(),       // Composite: `${chainId}-${event.transaction.hash}-${event.log.logIndex}`
  chainId: t.integer().notNull(),
  assetId: t.text().notNull(),
  asset: t.text().notNull(),
  subscriptionPrice: t.bigint().notNull(),
  subscriptionDuration: t.bigint().notNull(),
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
  subscriptionPrice: t.bigint().notNull(),
  registryFeeShare: t.bigint().notNull(),
  assetAddress: t.text().notNull(),
  blockNumber: t.bigint().notNull(),
  blockTimestamp: t.bigint().notNull(),
}), (table) => ({
  chainIdIdx: index().on(table.chainId),
  subscriberIdx: index().on(table.subscriber),
  payerIdx: index().on(table.payer),
  assetAddressIdx: index().on(table.assetAddress),
}));

export const Asset_SubscriptionRenewed = onchainTable("asset_subscription_renewed", (t) => ({
  id: t.text().primaryKey(),   // Composite: `${chainId}-${event.transaction.hash}-${event.log.logIndex}`
  chainId: t.integer().notNull(),
  subscriber: t.text().notNull(),
  payer: t.text().notNull(),
  startTime: t.bigint().notNull(),
  endTime: t.bigint().notNull(),
  nonce: t.bigint().notNull(),
  subscriptionPrice: t.bigint().notNull(),
  registryFeeShare: t.bigint().notNull(),
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
  id: t.text().primaryKey(),       // Composite: `${chainId}-${event.transaction.hash}-${event.log.logIndex}`
  chainId: t.integer().notNull(),
  subscriber: t.text().notNull(),
  amount: t.bigint().notNull(),
  claimedAtTimestamp: t.bigint().notNull(), // Subscription block timestamp at claim, indexed on-chain
  claimedAtNonce: t.bigint().notNull(),     // Subscription nonce the claim applies to
  subscriptionId: t.text(),                 // FK → Subscription.id; null if matching subscription row was deleted
  assetAddress: t.text().notNull(),
  blockNumber: t.bigint().notNull(),
  blockTimestamp: t.bigint().notNull(),
}), (table) => ({
  chainIdIdx: index().on(table.chainId),
  subscriberIdx: index().on(table.subscriber),
  assetAddressIdx: index().on(table.assetAddress),
  claimedAtNonceIdx: index().on(table.claimedAtNonce),
  subscriptionIdIdx: index().on(table.subscriptionId),
}));

// Per-claim event from the Registry contract. Distinct from
// AssetRegistry_RegistryFeeClaimedBatch (aggregated summary across subscribers).
export const AssetRegistry_RegistryFeeClaimed = onchainTable("asset_registry_registry_fee_claimed", (t) => ({
  id: t.text().primaryKey(),                // Composite: `${chainId}-${event.transaction.hash}-${event.log.logIndex}`
  chainId: t.integer().notNull(),
  assetId: t.text().notNull(),              // bytes32 asset id from the event topic
  assetEntityId: t.text(),                  // FK → AssetEntity.id (`${chainId}_${assetAddress}`); null if AssetEntity row missing
  subscriber: t.text().notNull(),
  amount: t.bigint().notNull(),
  claimedAtTimestamp: t.bigint().notNull(),
  claimedAtNonce: t.bigint().notNull(),
  subscriptionId: t.text(),                 // FK → Subscription.id; null if matching subscription row was deleted
  registryAddress: t.text().notNull(),
  blockNumber: t.bigint().notNull(),
  blockTimestamp: t.bigint().notNull(),
}), (table) => ({
  chainIdIdx: index().on(table.chainId),
  assetIdIdx: index().on(table.assetId),
  assetEntityIdIdx: index().on(table.assetEntityId),
  subscriberIdx: index().on(table.subscriber),
  subscriptionIdIdx: index().on(table.subscriptionId),
  registryAddressIdx: index().on(table.registryAddress),
  claimedAtNonceIdx: index().on(table.claimedAtNonce),
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
  nonce: t.bigint().notNull(),
  endTime: t.bigint().notNull(),
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
  nonce: t.bigint().notNull(),
  endTime: t.bigint().notNull(),
  assetAddress: t.text().notNull(),
  blockNumber: t.bigint().notNull(),
  blockTimestamp: t.bigint().notNull(),
}), (table) => ({
  chainIdIdx: index().on(table.chainId),
  subscriberIdx: index().on(table.subscriber),
  assetAddressIdx: index().on(table.assetAddress),
}));

export const Asset_SubscriptionRemoved = onchainTable("asset_subscription_removed", (t) => ({
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

// Claim-event relations live at the bottom because they reference event
// tables declared after the mutable-state relations block.
export const assetCreatorFeeClaimedRelations = relations(Asset_CreatorFeeClaimed, ({ one }) => ({
  subscription: one(Subscription, {
    fields: [Asset_CreatorFeeClaimed.subscriptionId],
    references: [Subscription.id],
  }),
}));

export const assetRegistryRegistryFeeClaimedRelations = relations(AssetRegistry_RegistryFeeClaimed, ({ one }) => ({
  asset: one(AssetEntity, {
    fields: [AssetRegistry_RegistryFeeClaimed.assetEntityId],
    references: [AssetEntity.id],
  }),
  subscription: one(Subscription, {
    fields: [AssetRegistry_RegistryFeeClaimed.subscriptionId],
    references: [Subscription.id],
  }),
}));
