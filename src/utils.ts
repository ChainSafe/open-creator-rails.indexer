export const getEventId = (event: any, chainId: number) => {
  return `${chainId}-${event.transaction.hash}-${event.log.logIndex}`;
};

export const getRegistryEntityId = (chainId: number, registryAddress: string) => {
  return `${chainId}_${registryAddress.toLowerCase()}`;
};

export const getAssetEntityId = (chainId: number, assetAddress: string) => {
  return `${chainId}_${assetAddress.toLowerCase()}`;
};

export const getSubscriptionId = (chainId: number, assetAddress: string, subscriber: string, nonce: bigint) => {
  return `${chainId}_${assetAddress.toLowerCase()}_${subscriber}_${nonce}`;
};
