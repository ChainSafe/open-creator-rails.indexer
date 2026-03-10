import {
  AssetRegistry,
  AssetContract_AssetCreated,
  AssetContract_CreatorFeeShareUpdated,
  AssetContract_OwnershipTransferred,
  AssetContract_RegistryFeeShareUpdated,
  Asset,
  Asset_SubscriptionAdded,
  Asset_SubscriptionPriceUpdated,
  Asset_SubscriptionRevoked,
  Asset_OwnershipTransferred,
  AssetEntity,
  Subscription,
  AssetIdToAddress,
} from "generated";

// ============================================================================ 
// AssetRegistry event handlers
// ============================================================================
AssetRegistry.AssetCreated.handler(async ({ event, context }) => {
  const entity: AssetContract_AssetCreated = {
    id: `${event.chainId}_${event.block.number}_${event.logIndex}`,
    assetId: event.params.assetId,
    asset: event.params.asset,
    subscriptionPrice: event.params.subscriptionPrice,
    tokenAddress: event.params.tokenAddress,
    owner: event.params.owner,
  };

  context.AssetContract_AssetCreated.set(entity);

  // Maintain high-level AssetEntity and mapping from assetId -> assetAddress
  const assetAddress = event.params.asset.toLowerCase();
  const registryAddress = event.srcAddress.toLowerCase();
  const assetId = event.params.assetId;

  const existingAsset = await context.AssetEntity.get(assetAddress);

  const assetEntity: AssetEntity = existingAsset
    ? {
        ...existingAsset,
        assetId,
        registryAddress,
      }
    : {
        id: assetAddress,
        assetId,
        registryAddress,
        owner: event.params.owner.toLowerCase(),
      };

  context.AssetEntity.set(assetEntity);

  const mapping: AssetIdToAddress = {
    id: assetId,
    assetAddress,
  };

  context.AssetIdToAddress.set(mapping);
});

AssetRegistry.AssetCreated.contractRegister(async ({ event, context }) => {
  const assetAddress = event.params.asset.toLowerCase();
  context.addAsset(assetAddress);
});

AssetRegistry.OwnershipTransferred.handler(async ({ event, context }) => {
  const entity: AssetContract_OwnershipTransferred = {
    id: `${event.chainId}_${event.block.number}_${event.logIndex}`,
    previousOwner: event.params.previousOwner,
    newOwner: event.params.newOwner,
  };

  context.AssetContract_OwnershipTransferred.set(entity);
});

AssetRegistry.CreatorFeeShareUpdated.handler(async ({ event, context }) => {
  const entity: AssetContract_CreatorFeeShareUpdated = {
    id: `${event.chainId}_${event.block.number}_${event.logIndex}`,
    newCreatorFeeShare: event.params.newCreatorFeeShare,
  };

  context.AssetContract_CreatorFeeShareUpdated.set(entity);
});

AssetRegistry.RegistryFeeShareUpdated.handler(async ({ event, context }) => {
  const entity: AssetContract_RegistryFeeShareUpdated = {
    id: `${event.chainId}_${event.block.number}_${event.logIndex}`,
    newRegistryFeeShare: event.params.newRegistryFeeShare,
  };

  context.AssetContract_RegistryFeeShareUpdated.set(entity);
});

// ============================================================================ 
// Asset event handlers
// ============================================================================
Asset.SubscriptionAdded.handler(async ({ event, context }) => {
  const entity: Asset_SubscriptionAdded = {
    id: `${event.chainId}_${event.block.number}_${event.logIndex}`,
    user: event.params.user,
    expiresAt: event.params.expiresAt,
  };

  context.Asset_SubscriptionAdded.set(entity);

  // Maintain Subscription entity per (asset, user)
  const assetAddress = event.srcAddress.toLowerCase();
  const user = event.params.user.toLowerCase();
  const subscriptionId = `${assetAddress}_${user}`;

  const existingSubscription = await context.Subscription.get(subscriptionId);

  const subscription: Subscription = existingSubscription
    ? {
        ...existingSubscription,
        expiresAt: event.params.expiresAt,
        isActive: true,
      }
    : {
        id: subscriptionId,
        asset_id: assetAddress,
        user,
        expiresAt: event.params.expiresAt,
        isActive: true,
      };

  context.Subscription.set(subscription);
});

Asset.SubscriptionRevoked.handler(async ({ event, context }) => {
  const entity: Asset_SubscriptionRevoked = {
    id: `${event.chainId}_${event.block.number}_${event.logIndex}`,
    user: event.params.user,
  };

  context.Asset_SubscriptionRevoked.set(entity);

  const assetAddress = event.srcAddress.toLowerCase();
  const user = event.params.user.toLowerCase();
  const subscriptionId = `${assetAddress}_${user}`;

  const existingSubscription = await context.Subscription.get(subscriptionId);

  if (existingSubscription) {
    const updatedSubscription: Subscription = {
      ...existingSubscription,
      isActive: false,
    };

    context.Subscription.set(updatedSubscription);
  }
});

Asset.SubscriptionPriceUpdated.handler(async ({ event, context }) => {
  const entity: Asset_SubscriptionPriceUpdated = {
    id: `${event.chainId}_${event.block.number}_${event.logIndex}`,
    newSubscriptionPrice: event.params.newSubscriptionPrice,
  };

  context.Asset_SubscriptionPriceUpdated.set(entity);
});

Asset.OwnershipTransferred.handler(async ({ event, context }) => {
  const entity: Asset_OwnershipTransferred = {
    id: `${event.chainId}_${event.block.number}_${event.logIndex}`,
    previousOwner: event.params.previousOwner,
    newOwner: event.params.newOwner,
  };

  context.Asset_OwnershipTransferred.set(entity);

  // Keep AssetEntity.owner in sync with the Asset contract ownership
  const assetAddress = event.srcAddress.toLowerCase();
  const existingAsset = await context.AssetEntity.get(assetAddress);

  if (existingAsset) {
    const updatedAsset: AssetEntity = {
      ...existingAsset,
      owner: event.params.newOwner.toLowerCase(),
    };

    context.AssetEntity.set(updatedAsset);
  }
});
