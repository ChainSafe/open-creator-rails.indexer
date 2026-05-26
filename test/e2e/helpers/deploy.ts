import {
  keccak256,
  parseEventLogs,
  toHex,
  type Address,
  type Hex,
} from "viem";
import { foundry } from "viem/chains";
import { loadArtifact, type ContractName } from "./artifacts.js";
import type { Clients } from "./clients.js";

// Base infra deployed once per test world. Tests build on this — create assets,
// subscriptions, etc. — as needed for their scenario.
export interface BaseDeployments {
  tokenAddress: Address;
  registryAddress: Address;
  registryFeeShare: number;
  deployer: Address;
}

export interface CreatedAsset {
  address: Address;
  assetId: string;
  assetIdHash: Hex;
  subscriptionPrice: number;
  subscriptionDuration: number;
  tokenAddress: Address;
  owner: Address;
}

async function deployContract(
  clients: Clients,
  artifactName: ContractName,
  args: readonly unknown[] = [],
): Promise<Address> {
  const { abi, bytecode } = loadArtifact(artifactName);
  const hash = await clients.walletClient.deployContract({
    abi,
    bytecode,
    args: args as never,
    account: clients.walletClient.account!,
    chain: foundry,
  });
  const receipt = await clients.publicClient.waitForTransactionReceipt({
    hash,
  });
  if (!receipt.contractAddress) {
    throw new Error(`Deploy of ${artifactName} did not return an address`);
  }
  return receipt.contractAddress;
}

// Deploys the shared infra (TestToken + AssetRegistry) every test world needs.
// Asset/subscription creation is left to individual tests so they can shape
// scenarios without paying for setup they don't use.
export async function baseSeed(
  clients: Clients,
  registryFeeShare = 80,
): Promise<BaseDeployments> {
  const tokenAddress = await deployContract(clients, "TestToken");
  const registryAddress = await deployContract(clients, "AssetRegistry", [
    BigInt(registryFeeShare),
  ]);
  return {
    tokenAddress,
    registryAddress,
    registryFeeShare,
    deployer: clients.deployer,
  };
}

export async function createAsset(
  clients: Clients,
  registry: Address,
  assetId: string,
  subscriptionPrice: number,
  subscriptionDuration: number,
  tokenAddress: Address,
  owner: Address,
): Promise<CreatedAsset> {
  const { abi } = loadArtifact("AssetRegistry");
  const assetIdHash = keccak256(toHex(assetId));

  const hash = await clients.walletClient.writeContract({
    address: registry,
    abi,
    functionName: "createAsset",
    args: [
      assetIdHash,
      BigInt(subscriptionPrice),
      BigInt(subscriptionDuration),
      tokenAddress,
      owner,
    ],
    account: clients.walletClient.account!,
    chain: foundry,
  });
  const receipt = await clients.publicClient.waitForTransactionReceipt({
    hash,
  });

  const [created] = parseEventLogs({
    abi,
    eventName: "AssetCreated",
    logs: receipt.logs,
  });
  if (!created) {
    throw new Error(`AssetCreated event not found in receipt for ${assetId}`);
  }
  // `abi` is the wide Abi type (artifact loader returns Abi for any contract),
  // so parseEventLogs cannot statically resolve AssetCreated's arg shape. The
  // ABI we passed in is AssetRegistry's; AssetCreated has an `asset` arg.
  const { asset } = created.args as unknown as { asset: Address };

  return {
    address: asset,
    assetId,
    assetIdHash,
    subscriptionPrice,
    subscriptionDuration,
    tokenAddress,
    owner,
  };
}
