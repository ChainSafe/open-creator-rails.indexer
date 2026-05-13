import { ponder } from "ponder:registry";
import { and, eq } from "ponder";
import {
  RegistryEntity,
  AssetEntity,
  Subscription,
  AssetRegistry_AssetCreated,
  AssetRegistry_OwnershipTransferred,
  AssetRegistry_RegistryFeeShareUpdated,
  AssetRegistry_RegistryFeeClaimedBatch,
  AssetRegistry_RegistryFeeClaimed,
} from "../../ponder.schema";
import { getEventId, getAssetEntityId, getRegistryEntityId, getSubscriptionId } from "../utils";

ponder.on("AssetRegistry:AssetCreated", async ({ event, context }) => {
  const chainId = context.chain?.id as number;
  const assetAddress = event.args.asset.toLowerCase();
  const owner = event.args.owner.toLowerCase();
  const tokenAddress = event.args.tokenAddress.toLowerCase();
  const registryAddress = event.log.address.toLowerCase();
  const registryId = getRegistryEntityId(chainId, registryAddress);
  const assetEntityId = getAssetEntityId(chainId, assetAddress);

  // 1. Create the persistent Asset Entity
  await context.db.insert(AssetEntity).values({
    id: assetEntityId,
    chainId: chainId,
    assetId: event.args.assetId,
    address: assetAddress,
    registryId: registryId,
    registryAddress: registryAddress,
    owner: owner,
    subscriptionPrice: event.args.subscriptionPrice,
    subscriptionDuration: event.args.subscriptionDuration,
    tokenAddress: tokenAddress,
  });

  // 2. Log immutable history
  await context.db.insert(AssetRegistry_AssetCreated).values({
    id: getEventId(event, chainId),
    chainId: chainId,
    assetId: event.args.assetId,
    asset: assetAddress,
    subscriptionPrice: event.args.subscriptionPrice,
    subscriptionDuration: event.args.subscriptionDuration,
    tokenAddress: tokenAddress,
    owner: owner,
    registryAddress: registryAddress,
    blockNumber: event.block.number,
    blockTimestamp: event.block.timestamp,
  });
});

ponder.on("AssetRegistry:OwnershipTransferred", async ({ event, context }) => {
  const chainId = context.chain?.id as number;
  const registryAddress = event.log.address.toLowerCase();
  const newOwner = event.args.newOwner.toLowerCase();

  // 1. Upsert Registry Entity — create on first transfer, update owner on subsequent
  await context.db.insert(RegistryEntity).values({
    id: getRegistryEntityId(chainId, registryAddress),
    chainId,
    address: registryAddress,
    owner: newOwner,
    registryFeeShare: null,
  }).onConflictDoUpdate({ owner: newOwner });

  // 2. Log History
  await context.db.insert(AssetRegistry_OwnershipTransferred).values({
    id: getEventId(event, chainId),
    chainId: chainId,
    previousOwner: event.args.previousOwner.toLowerCase(),
    newOwner: newOwner,
    registryAddress: registryAddress,
    blockNumber: event.block.number,
    blockTimestamp: event.block.timestamp,
  });
});

ponder.on("AssetRegistry:RegistryFeeShareUpdated", async ({ event, context }) => {
  const chainId = context.chain?.id as number;
  const registryAddress = event.log.address.toLowerCase();
  const newRegistryFeeShare = event.args.newRegistryFeeShare;

  // 1. Upsert Registry Entity — create if not yet seen, update feeShare
  await context.db.insert(RegistryEntity).values({
    id: getRegistryEntityId(chainId, registryAddress),
    chainId,
    address: registryAddress,
    owner: null,
    registryFeeShare: newRegistryFeeShare,
  }).onConflictDoUpdate({ registryFeeShare: newRegistryFeeShare });

  // 2. Log History
  await context.db.insert(AssetRegistry_RegistryFeeShareUpdated).values({
    id: getEventId(event, chainId),
    chainId: chainId,
    newRegistryFeeShare: newRegistryFeeShare,
    registryAddress: registryAddress,
    blockNumber: event.block.number,
    blockTimestamp: event.block.timestamp,
  });
});

ponder.on("AssetRegistry:RegistryFeeClaimedBatch", async ({ event, context }) => {
  const chainId = context.chain?.id as number;
  await context.db.insert(AssetRegistry_RegistryFeeClaimedBatch).values({
    id: getEventId(event, chainId),
    chainId: chainId,
    assetId: event.args.assetId,
    totalAmount: event.args.totalAmount,
    registryAddress: event.log.address.toLowerCase(),
    blockNumber: event.block.number,
    blockTimestamp: event.block.timestamp,
  });
});

ponder.on("AssetRegistry:RegistryFeeClaimed", async ({ event, context }) => {
  const chainId = context.chain?.id as number;
  const assetId = event.args.assetId;
  const subscriber = event.args.subscriber;
  const claimedAtNonce = event.args.claimedAtNonce;

  // The event indexes by assetId (bytes32), but the AssetEntity primary key is
  // chain-scoped on address. Resolve the address by joining through AssetEntity.
  const assetRows = await context.db.sql
    .select({ id: AssetEntity.id, address: AssetEntity.address })
    .from(AssetEntity)
    .where(and(eq(AssetEntity.chainId, chainId), eq(AssetEntity.assetId, assetId)))
    .limit(1);
  const assetRow = assetRows[0];

  // Subscription rows can be hard-deleted on future-nonce revoke / SubscriptionRemoved.
  // FK is best-effort: persist the claim either way, leave subscriptionId null when no row.
  let linkedSubscriptionId: string | null = null;
  if (assetRow) {
    const candidateId = getSubscriptionId(chainId, assetRow.address, subscriber, claimedAtNonce);
    const subscriptionRows = await context.db.sql
      .select({ id: Subscription.id })
      .from(Subscription)
      .where(eq(Subscription.id, candidateId))
      .limit(1);
    if (subscriptionRows.length > 0) {
      linkedSubscriptionId = candidateId;
    }
  }

  await context.db.insert(AssetRegistry_RegistryFeeClaimed).values({
    id: getEventId(event, chainId),
    chainId: chainId,
    assetId: assetId,
    assetEntityId: assetRow?.id ?? null,
    subscriber: subscriber,
    amount: event.args.amount,
    claimedAtTimestamp: event.args.claimedAtTimestamp,
    claimedAtNonce: claimedAtNonce,
    subscriptionId: linkedSubscriptionId,
    registryAddress: event.log.address.toLowerCase(),
    blockNumber: event.block.number,
    blockTimestamp: event.block.timestamp,
  });
});
