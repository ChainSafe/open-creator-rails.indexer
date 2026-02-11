import {
  AssetContract,
  AssetContract_AssetCreated,
  AssetContract_AssetRemoved,
  AssetContract_OwnershipTransferred,
  Asset,
  Asset_SubscriptionAdded,
  Asset_SubscriptionRevoked,
  Asset_OwnershipTransferred,
} from "generated";

// Handlers for AssetContract events
AssetContract.AssetCreated.handler(async ({ event, context }) => {
  const entity: AssetContract_AssetCreated = {
    id: `${event.chainId}_${event.block.number}_${event.logIndex}`,
    assetId: event.params.assetId,
    asset: event.params.asset,
  };

  context.AssetContract_AssetCreated.set(entity);
});

AssetContract.AssetRemoved.handler(async ({ event, context }) => {
  const entity: AssetContract_AssetRemoved = {
    id: `${event.chainId}_${event.block.number}_${event.logIndex}`,
    assetId: event.params.assetId,
  };

  context.AssetContract_AssetRemoved.set(entity);
});

AssetContract.OwnershipTransferred.handler(async ({ event, context }) => {
  const entity: AssetContract_OwnershipTransferred = {
    id: `${event.chainId}_${event.block.number}_${event.logIndex}`,
    previousOwner: event.params.previousOwner,
    newOwner: event.params.newOwner,
  };

  context.AssetContract_OwnershipTransferred.set(entity);
});

// Handlers for Asset events
Asset.SubscriptionAdded.handler(async ({ event, context }) => {
  const entity: Asset_SubscriptionAdded = {
    id: `${event.chainId}_${event.block.number}_${event.logIndex}`,
    user: event.params.user,
    expiresAt: event.params.expiresAt,
  };

  context.Asset_SubscriptionAdded.set(entity);
});

Asset.SubscriptionRevoked.handler(async ({ event, context }) => {
  const entity: Asset_SubscriptionRevoked = {
    id: `${event.chainId}_${event.block.number}_${event.logIndex}`,
    user: event.params.user,
  };

  context.Asset_SubscriptionRevoked.set(entity);
});

Asset.OwnershipTransferred.handler(async ({ event, context }) => {
  const entity: Asset_OwnershipTransferred = {
    id: `${event.chainId}_${event.block.number}_${event.logIndex}`,
    previousOwner: event.params.previousOwner,
    newOwner: event.params.newOwner,
  };

  context.Asset_OwnershipTransferred.set(entity);
});
