import {
  encodePacked,
  keccak256,
  parseSignature,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { foundry } from "viem/chains";
import { loadArtifact } from "./artifacts.js";
import type { Clients } from "./clients.js";
import type { CreatedAsset } from "./deploy.js";
import type { Subscriber } from "./subscriber.js";

export async function mintTokens(
  clients: Clients,
  token: Address,
  to: Address,
  amount: bigint,
): Promise<void> {
  const { abi } = loadArtifact("TestToken");
  const hash = await clients.walletClient.writeContract({
    address: token,
    abi,
    functionName: "mint",
    args: [to, amount],
    account: clients.walletClient.account!,
    chain: foundry,
  });
  await clients.publicClient.waitForTransactionReceipt({ hash });
}

// Default permit deadline: 30 minutes from "now" per block timestamp.
const DEFAULT_PERMIT_VALIDITY_SECONDS = 1800n;

interface SubscribeOptions {
  // Defaults to the subscriber. Used by tests that need payer ≠ subscriber.
  payer?: Subscriber;
  // Override the permit deadline (epoch seconds). Defaults to now + 30 minutes.
  deadlineSec?: bigint;
}

// Builds + signs an EIP-2612 permit on the asset's payment token, then calls
// AssetRegistry.subscribe. Mirrors the seed-local.sh subscribe.sh flow but
// reproduces the signing in TS instead of shelling into a Forge script.
//
// Dispatches the tx WITHOUT waiting for the receipt — returns the hash so the
// caller can compose it into mineBatched()'s same-block batches. The wait-style
// `subscribe()` wrapper below is the default for regular tests.
export async function dispatchSubscribe(
  clients: Clients,
  registry: Address,
  asset: CreatedAsset,
  sub: Subscriber,
  count: number | bigint,
  options: SubscribeOptions = {},
): Promise<Hex> {
  const payer = options.payer ?? sub;
  const countBig = BigInt(count);

  const assetAbi = loadArtifact("Asset").abi;
  const tokenAbi = loadArtifact("TestToken").abi;
  const registryAbi = loadArtifact("AssetRegistry").abi;

  // Ask the asset for the canonical permit value — matches the contract's
  // arithmetic (price × count, modulo any future overflow guard).
  const value = (await clients.publicClient.readContract({
    address: asset.address,
    abi: assetAbi,
    functionName: "getSubscriptionPrice",
    args: [countBig],
  })) as bigint;

  // Read EIP-5267 domain from the token. Avoids hardcoding name/version, so
  // TestToken changes (or swapping in a different ERC20Permit token later)
  // don't silently invalidate the signature.
  const domainResult = (await clients.publicClient.readContract({
    address: asset.tokenAddress,
    abi: tokenAbi,
    functionName: "eip712Domain",
  })) as readonly [
    Hex,
    string,
    string,
    bigint,
    Address,
    Hex,
    readonly bigint[],
  ];
  const [, name, version, chainId, verifyingContract] = domainResult;

  const nonce = (await clients.publicClient.readContract({
    address: asset.tokenAddress,
    abi: tokenAbi,
    functionName: "nonces",
    args: [payer.address],
  })) as bigint;

  const block = await clients.publicClient.getBlock();
  const deadline =
    options.deadlineSec ?? block.timestamp + DEFAULT_PERMIT_VALIDITY_SECONDS;

  const payerAccount = privateKeyToAccount(payer.pk);
  const sigHex = await payerAccount.signTypedData({
    domain: { name, version, chainId: Number(chainId), verifyingContract },
    types: {
      Permit: [
        { name: "owner", type: "address" },
        { name: "spender", type: "address" },
        { name: "value", type: "uint256" },
        { name: "nonce", type: "uint256" },
        { name: "deadline", type: "uint256" },
      ],
    },
    primaryType: "Permit",
    message: {
      owner: payer.address,
      spender: asset.address,
      value,
      nonce,
      deadline,
    },
  });
  const { v, r, s } = parseSignature(sigHex);
  if (v === undefined) {
    throw new Error("parseSignature returned undefined v");
  }

  return clients.walletClient.writeContract({
    address: registry,
    abi: registryAbi,
    functionName: "subscribe",
    args: [
      asset.assetIdHash,
      sub.hash,
      payer.address,
      asset.address,
      countBig,
      deadline,
      Number(v),
      r,
      s,
    ],
    account: clients.walletClient.account!,
    chain: foundry,
  });
}

export async function subscribe(
  clients: Clients,
  registry: Address,
  asset: CreatedAsset,
  sub: Subscriber,
  count: number | bigint,
  options: SubscribeOptions = {},
): Promise<void> {
  const hash = await dispatchSubscribe(clients, registry, asset, sub, count, options);
  await clients.publicClient.waitForTransactionReceipt({ hash });
}

// EIP-191 personal-sign the (chainId, asset, subscriber) tuple, then call
// Asset.cancelSubscription FROM THE SUBSCRIBER's account. The contract derives
// the subscriber hash from msg.sender (not the signature's recovered signer)
// and asserts signer == msg.sender — so the cancel tx must originate from the
// subscriber's address, and the signature is essentially a possession proof.
export async function cancelSubscription(
  clients: Clients,
  asset: Address,
  sub: Subscriber,
): Promise<void> {
  const chainId = await clients.publicClient.getChainId();
  const digest = keccak256(
    encodePacked(
      ["uint256", "address", "bytes32"],
      [BigInt(chainId), asset, sub.hash],
    ),
  );
  const subAccount = privateKeyToAccount(sub.pk);
  const signature = await subAccount.signMessage({ message: { raw: digest } });

  const { abi } = loadArtifact("Asset");
  const hash = await clients.walletClient.writeContract({
    address: asset,
    abi,
    functionName: "cancelSubscription",
    args: [sub.id, signature],
    account: subAccount,
    chain: foundry,
  });
  await clients.publicClient.waitForTransactionReceipt({ hash });
}

export async function dispatchRevokeSubscription(
  clients: Clients,
  asset: Address,
  sub: Subscriber,
): Promise<Hex> {
  const { abi } = loadArtifact("Asset");
  return clients.walletClient.writeContract({
    address: asset,
    abi,
    functionName: "revokeSubscription",
    args: [sub.hash],
    account: clients.walletClient.account!,
    chain: foundry,
  });
}

export async function revokeSubscription(
  clients: Clients,
  asset: Address,
  sub: Subscriber,
): Promise<void> {
  const hash = await dispatchRevokeSubscription(clients, asset, sub);
  await clients.publicClient.waitForTransactionReceipt({ hash });
}

export async function setSubscriptionPrice(
  clients: Clients,
  asset: Address,
  newPrice: number | bigint,
): Promise<void> {
  const { abi } = loadArtifact("Asset");
  const hash = await clients.walletClient.writeContract({
    address: asset,
    abi,
    functionName: "setSubscriptionPrice",
    args: [BigInt(newPrice)],
    account: clients.walletClient.account!,
    chain: foundry,
  });
  await clients.publicClient.waitForTransactionReceipt({ hash });
}

export async function dispatchClaimCreatorFee(
  clients: Clients,
  asset: Address,
  sub: Subscriber,
): Promise<Hex> {
  const { abi } = loadArtifact("Asset");
  return clients.walletClient.writeContract({
    address: asset,
    abi,
    functionName: "claimCreatorFee",
    args: [sub.hash],
    account: clients.walletClient.account!,
    chain: foundry,
  });
}

export async function claimCreatorFee(
  clients: Clients,
  asset: Address,
  sub: Subscriber,
): Promise<void> {
  const hash = await dispatchClaimCreatorFee(clients, asset, sub);
  await clients.publicClient.waitForTransactionReceipt({ hash });
}

export async function claimRegistryFee(
  clients: Clients,
  registry: Address,
  asset: CreatedAsset,
  sub: Subscriber,
): Promise<void> {
  const { abi } = loadArtifact("AssetRegistry");
  const hash = await clients.walletClient.writeContract({
    address: registry,
    abi,
    functionName: "claimRegistryFee",
    args: [asset.assetIdHash, sub.hash],
    account: clients.walletClient.account!,
    chain: foundry,
  });
  await clients.publicClient.waitForTransactionReceipt({ hash });
}

// Batches a creator-fee claim across multiple subscribers. Emits one
// CreatorFeeClaimed per non-empty claim plus a single CreatorFeeClaimedBatch
// summary event. Zero-claim subscribers are skipped by the contract.
export async function claimCreatorFeeBatch(
  clients: Clients,
  asset: Address,
  subs: readonly Subscriber[],
): Promise<void> {
  const { abi } = loadArtifact("Asset");
  const hash = await clients.walletClient.writeContract({
    address: asset,
    abi,
    functionName: "claimCreatorFee",
    args: [subs.map((s) => s.hash)],
    account: clients.walletClient.account!,
    chain: foundry,
  });
  await clients.publicClient.waitForTransactionReceipt({ hash });
}

// Batches a registry-fee claim through the Registry. Emits one
// RegistryFeeClaimed per non-empty claim (via Asset -> Registry callback) plus
// one RegistryFeeClaimedBatch summary event.
export async function claimRegistryFeeBatch(
  clients: Clients,
  registry: Address,
  asset: CreatedAsset,
  subs: readonly Subscriber[],
): Promise<void> {
  const { abi } = loadArtifact("AssetRegistry");
  const hash = await clients.walletClient.writeContract({
    address: registry,
    abi,
    functionName: "claimRegistryFee",
    args: [asset.assetIdHash, subs.map((s) => s.hash)],
    account: clients.walletClient.account!,
    chain: foundry,
  });
  await clients.publicClient.waitForTransactionReceipt({ hash });
}

export async function updateRegistryFeeShare(
  clients: Clients,
  registry: Address,
  newShare: number | bigint,
): Promise<void> {
  const { abi } = loadArtifact("AssetRegistry");
  const hash = await clients.walletClient.writeContract({
    address: registry,
    abi,
    functionName: "updateRegistryFeeShare",
    args: [BigInt(newShare)],
    account: clients.walletClient.account!,
    chain: foundry,
  });
  await clients.publicClient.waitForTransactionReceipt({ hash });
}

export async function transferAssetOwnership(
  clients: Clients,
  asset: Address,
  newOwner: Address,
): Promise<void> {
  const { abi } = loadArtifact("Asset");
  const hash = await clients.walletClient.writeContract({
    address: asset,
    abi,
    functionName: "transferOwnership",
    args: [newOwner],
    account: clients.walletClient.account!,
    chain: foundry,
  });
  await clients.publicClient.waitForTransactionReceipt({ hash });
}

export async function transferRegistryOwnership(
  clients: Clients,
  registry: Address,
  newOwner: Address,
): Promise<void> {
  const { abi } = loadArtifact("AssetRegistry");
  const hash = await clients.walletClient.writeContract({
    address: registry,
    abi,
    functionName: "transferOwnership",
    args: [newOwner],
    account: clients.walletClient.account!,
    chain: foundry,
  });
  await clients.publicClient.waitForTransactionReceipt({ hash });
}
