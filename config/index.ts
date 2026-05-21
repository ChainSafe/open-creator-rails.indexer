// --- AUTO-GENERATED ABI EXPORTS (do not edit) ---
export * from './AssetABI';
export * from './AssetRegistryABI';
// --- END AUTO-GENERATED ABI EXPORTS ---

import sepoliaDeployments from './deployments/registries_11155111.json';
import baseSepoliaDeployments from './deployments/registries_84532.json';
import localDeployments from './deployments/registries_31337.json';
import tokenAddresses from './deployments/token_addresses.json';

export { sepoliaDeployments, baseSepoliaDeployments, localDeployments, tokenAddresses };

// Returns the AssetRegistry addresses Ponder should track for `chainId`.
// `PONDER_${chainId}_REGISTRIES` (JSON array of addresses) takes precedence
// over the on-disk deployments JSON when set — the e2e test harness uses this
// to point Ponder at a registry it just deployed without mutating tracked files.
export function registryAddressesForChain(
  chainId: number,
  deployments: ReadonlyArray<{ address: string }>,
): `0x${string}`[] {
  const envVar = process.env[`PONDER_${chainId}_REGISTRIES`];
  const addresses = envVar
    ? (JSON.parse(envVar) as string[])
    : deployments.map((d) => d.address);
  return addresses.map((a) => a as `0x${string}`);
}

export const sepoliaRegistryAddresses = registryAddressesForChain(11155111, sepoliaDeployments);
export const baseSepoliaRegistryAddresses = registryAddressesForChain(84532, baseSepoliaDeployments);
export const localRegistryAddresses = registryAddressesForChain(31337, localDeployments);
