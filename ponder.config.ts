import { getAbiItem  } from "viem";
import { createConfig, factory } from "ponder";

import { 
  AssetABI, 
  AssetRegistryABI,
  sepoliaDeployments,
  localDeployments
} from "./config";

// Extract the event strictly
const AssetCreatedEvent = getAbiItem({ 
  abi: AssetRegistryABI, 
  name: "AssetCreated" 
});

const sepoliaRegistryAddresses = sepoliaDeployments.map((d: any) => d.address as `0x${string}`);
const localRegistryAddresses = localDeployments.map((d: any) => d.address as `0x${string}`);

export default createConfig({
  chains: {
    ...(process.env.PONDER_RPC_URL_11155111 ? {
      sepolia: {
        id: 11155111,
        rpc: process.env.PONDER_RPC_URL_11155111,
      }
    } : {}),
    ...(process.env.PONDER_RPC_URL_31337 ? {
      local: {
        id: 31337,
        rpc: process.env.PONDER_RPC_URL_31337,
      }
    } : {}),
  },
  contracts: {
    AssetRegistry: {
      abi: AssetRegistryABI,
      chain: {
        ...(process.env.PONDER_RPC_URL_11155111 ? {
          sepolia: {
            address: sepoliaRegistryAddresses,
            startBlock: 10299077
          }
        } : {}),
        ...(process.env.PONDER_RPC_URL_31337 ? {
          local: {
            address: localRegistryAddresses,
            startBlock: 0
          }
        } : {}),
      }
    },
    Asset: {
      abi: AssetABI,
      chain: {
        ...(process.env.PONDER_RPC_URL_11155111 ? {
          sepolia: {
            address: factory({
              address: sepoliaRegistryAddresses,
              event: AssetCreatedEvent,
              parameter: "asset",
            }),
            startBlock: 10299077
          }
        } : {}),
        ...(process.env.PONDER_RPC_URL_31337 ? {
          local: {
            address: factory({
              address: localRegistryAddresses,
              event: AssetCreatedEvent,
              parameter: "asset",
            }),
            startBlock: 0
          }
        } : {}),
      }
    }
  },
  blocks: {
    // Periodic refresh of the SubscriberClaimable rollup. Catches the "time
    // has passed but no event fired" case — fees accrue at every period
    // boundary even without on-chain activity. Event handlers keep the rollup
    // accurate for state changes; this fills the time-only gaps.
    //
    // Interval is per-chain: Sepolia = 7200 blocks (~24h at 12s blocks); local
    // = 1 (every block). Local fires often because Anvil produces blocks only
    // when txs are sent, so the seed naturally triggers refreshes.
    ClaimableRefresh: {
      chain: {
        ...(process.env.PONDER_RPC_URL_11155111 ? {
          sepolia: { startBlock: 10299077, interval: 7200 },
        } : {}),
        ...(process.env.PONDER_RPC_URL_31337 ? {
          local: { startBlock: 0, interval: 1 },
        } : {}),
      },
    },
  },
});