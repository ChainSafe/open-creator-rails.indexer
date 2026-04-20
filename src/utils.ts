export const getEventId = (event: any, chainId: number) => {
  return `${chainId}-${event.transaction.hash}-${event.log.logIndex}`;
};

export const getRegistryEntityId = (chainId: number, registryAddress: string) => {
  return `${chainId}_${registryAddress.toLowerCase()}`;
};

export const getAssetEntityId = (chainId: number, assetAddress: string) => {
  return `${chainId}_${assetAddress}`;
};

export const getSubscriptionId = (chainId: number, assetAddress: string, subscriber: string) => {
  return `${chainId}_${assetAddress}_${subscriber}`;
};
