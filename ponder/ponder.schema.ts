import { onchainTable } from "ponder";

// --- Entities (Mutable State) ---

export const AssetEntity = onchainTable("asset_entity", (t) => ({
  id: t.text().primaryKey(),    // Asset Contract Address
  assetId: t.text().notNull(),  // Registry ID
  registryAddress: t.text().notNull(),
  owner: t.text().notNull(),
}));

export const Subscription = onchainTable("subscription", (t) => ({
  id: t.text().primaryKey(),    // Composite: `${asset}_${user}`
  assetId: t.text().notNull(),  // Links to AssetEntity.id
  user: t.text().notNull(),
  expiresAt: t.bigint().notNull(),
  isActive: t.boolean().notNull(),
}));

// --- Events (Immutable History) ---
// Note: Ponder doesn't enforce "History" tables but they are useful for analytics

export const AssetRegistry_AssetCreated = onchainTable("asset_registry_asset_created", (t) => ({
  id: t.text().primaryKey(),
  assetId: t.text().notNull(),
  asset: t.text().notNull(),
  subscriptionPrice: t.bigint().notNull(),
  tokenAddress: t.text().notNull(),
  owner: t.text().notNull(),
  blockNumber: t.bigint().notNull(),
  blockTimestamp: t.bigint().notNull(),
}));

export const AssetRegistry_OwnershipTransferred = onchainTable("asset_registry_ownership_transferred", (t) => ({
  id: t.text().primaryKey(),
  previousOwner: t.text().notNull(),
  newOwner: t.text().notNull(),
  blockNumber: t.bigint().notNull(),
  blockTimestamp: t.bigint().notNull(),
}));

export const AssetRegistry_CreatorFeeShareUpdated = onchainTable("asset_registry_creator_fee_share_updated", (t) => ({
  id: t.text().primaryKey(),
  newCreatorFeeShare: t.bigint().notNull(),
  blockNumber: t.bigint().notNull(),
  blockTimestamp: t.bigint().notNull(),
}));

export const AssetRegistry_RegistryFeeShareUpdated = onchainTable("asset_registry_registry_fee_share_updated", (t) => ({
  id: t.text().primaryKey(),
  newRegistryFeeShare: t.bigint().notNull(),
  blockNumber: t.bigint().notNull(),
  blockTimestamp: t.bigint().notNull(),
}));

export const Asset_SubscriptionAdded = onchainTable("asset_subscription_added", (t) => ({
  id: t.text().primaryKey(),
  user: t.text().notNull(),
  expiresAt: t.bigint().notNull(),
  assetAddress: t.text().notNull(), // Added context column not in Envio event but useful 
  blockNumber: t.bigint().notNull(),
  blockTimestamp: t.bigint().notNull(),
}));

export const Asset_SubscriptionPriceUpdated = onchainTable("asset_subscription_price_updated", (t) => ({
  id: t.text().primaryKey(),
  newSubscriptionPrice: t.bigint().notNull(),
  assetAddress: t.text().notNull(),
  blockNumber: t.bigint().notNull(),
  blockTimestamp: t.bigint().notNull(),
}));

export const Asset_SubscriptionRevoked = onchainTable("asset_subscription_revoked", (t) => ({
  id: t.text().primaryKey(),
  user: t.text().notNull(),
  assetAddress: t.text().notNull(),
  blockNumber: t.bigint().notNull(),
  blockTimestamp: t.bigint().notNull(),
}));

export const Asset_OwnershipTransferred = onchainTable("asset_ownership_transferred", (t) => ({
  id: t.text().primaryKey(),
  previousOwner: t.text().notNull(),
  newOwner: t.text().notNull(),
  assetAddress: t.text().notNull(),
  blockNumber: t.bigint().notNull(),
  blockTimestamp: t.bigint().notNull(),
}));
