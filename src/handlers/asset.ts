import { ponder } from "ponder:registry";
import { eq, and, desc, gt } from "ponder";
import {
  AssetEntity,
  Subscription,
  Asset_SubscriptionAdded,
  Asset_SubscriptionExtended,
  Asset_CreatorFeeClaimed,
  Asset_SubscriptionRevoked,
  Asset_SubscriptionCancelled,
  Asset_SubscriptionPriceUpdated,
  Asset_OwnershipTransferred,
} from "../../ponder.schema";
import { getEventId, getAssetEntityId, getSubscriptionId } from "../utils";

ponder.on("Asset:SubscriptionAdded", async ({ event, context }) => {
  const chainId = context.chain?.id as number;
  const assetAddress = event.log.address.toLowerCase();
  const subscriber = event.args.subscriber;
  const payer = event.args.payer.toLowerCase();
  const assetEntityId = getAssetEntityId(chainId, assetAddress);

  // 1. Insert per-nonce Subscription row (idempotent on re-index)
  await context.db.insert(Subscription).values({
    id: getSubscriptionId(chainId, assetAddress, subscriber, event.args.nonce),
    chainId: chainId,
    assetId: assetEntityId,
    subscriber: subscriber,
    payer: payer,
    startTime: event.args.startTime,
    endTime: event.args.endTime,
    nonce: event.args.nonce,
    isTerminated: false,
  }).onConflictDoNothing();

  // 2. Log History
  await context.db.insert(Asset_SubscriptionAdded).values({
    id: getEventId(event, chainId),
    chainId: chainId,
    subscriber: subscriber,
    payer: payer,
    startTime: event.args.startTime,
    endTime: event.args.endTime,
    nonce: event.args.nonce,
    assetAddress: assetAddress,
    blockNumber: event.block.number,
    blockTimestamp: event.block.timestamp,
  });
});

ponder.on("Asset:SubscriptionExtended", async ({ event, context }) => {
  const chainId = context.chain?.id as number;
  const assetAddress = event.log.address.toLowerCase();
  const subscriber = event.args.subscriber;
  const assetEntityId = getAssetEntityId(chainId, assetAddress);

  // SubscriptionExtended has no nonce in the event — find the highest active nonce row
  const rows = await context.db.sql
    .select({ id: Subscription.id })
    .from(Subscription)
    .where(and(
      eq(Subscription.assetId, assetEntityId),
      eq(Subscription.subscriber, subscriber),
      eq(Subscription.isTerminated, false),
    ))
    .orderBy(desc(Subscription.nonce))
    .limit(1);

  // 1. Update State: extend the end time of the latest active nonce
  if (rows.length > 0) {
    await context.db.update(Subscription, { id: rows[0]!.id }).set({
      endTime: event.args.endTime,
    });
  }

  // 2. Log History
  await context.db.insert(Asset_SubscriptionExtended).values({
    id: getEventId(event, chainId),
    chainId: chainId,
    subscriber: subscriber,
    endTime: event.args.endTime,
    assetAddress: assetAddress,
    blockNumber: event.block.number,
    blockTimestamp: event.block.timestamp,
  });
});

ponder.on("Asset:CreatorFeeClaimed", async ({ event, context }) => {
  const chainId = context.chain?.id as number;
  await context.db.insert(Asset_CreatorFeeClaimed).values({
    id: getEventId(event, chainId),
    chainId: chainId,
    subscriber: event.args.subscriber,
    amount: event.args.amount,
    assetAddress: event.log.address.toLowerCase(),
    blockNumber: event.block.number,
    blockTimestamp: event.block.timestamp,
  });
});

ponder.on("Asset:SubscriptionRevoked", async ({ event, context }) => {
  const chainId = context.chain?.id as number;
  const assetAddress = event.log.address.toLowerCase();
  const subscriber = event.args.subscriber;
  const assetEntityId = getAssetEntityId(chainId, assetAddress);

  // 1. Update State: terminate ALL non-terminated nonces for this subscriber
  // Mirrors contract: active nonces are truncated, future nonces are removed
  const rows = await context.db.sql
    .select({ id: Subscription.id })
    .from(Subscription)
    .where(and(
      eq(Subscription.assetId, assetEntityId),
      eq(Subscription.subscriber, subscriber),
      eq(Subscription.isTerminated, false),
      gt(Subscription.endTime, event.block.timestamp),
    ));

  for (const row of rows) {
    await context.db.update(Subscription, { id: row.id }).set({
      isTerminated: true,
      endTime: event.block.timestamp,
    });
  }

  // 2. Log History
  await context.db.insert(Asset_SubscriptionRevoked).values({
    id: getEventId(event, chainId),
    chainId: chainId,
    subscriber: subscriber,
    assetAddress: assetAddress,
    blockNumber: event.block.number,
    blockTimestamp: event.block.timestamp,
  });
});

ponder.on("Asset:SubscriptionCancelled", async ({ event, context }) => {
  const chainId = context.chain?.id as number;
  const assetAddress = event.log.address.toLowerCase();
  const subscriber = event.args.subscriber;
  const assetEntityId = getAssetEntityId(chainId, assetAddress);

  // 1. Update State: terminate ALL non-terminated nonces for this subscriber
  const rows = await context.db.sql
    .select({ id: Subscription.id })
    .from(Subscription)
    .where(and(
      eq(Subscription.assetId, assetEntityId),
      eq(Subscription.subscriber, subscriber),
      eq(Subscription.isTerminated, false),
      gt(Subscription.endTime, event.block.timestamp),
    ));

  for (const row of rows) {
    await context.db.update(Subscription, { id: row.id }).set({
      isTerminated: true,
      endTime: event.block.timestamp,
    });
  }

  // 2. Log History
  await context.db.insert(Asset_SubscriptionCancelled).values({
    id: getEventId(event, chainId),
    chainId: chainId,
    subscriber: subscriber,
    assetAddress: assetAddress,
    blockNumber: event.block.number,
    blockTimestamp: event.block.timestamp,
  });
});

ponder.on("Asset:SubscriptionPriceUpdated", async ({ event, context }) => {
  const chainId = context.chain?.id as number;
  const assetAddress = event.log.address.toLowerCase();
  const newSubscriptionPrice = event.args.newSubscriptionPrice;

  // 1. Update mutable Asset Entity
  await context.db.update(AssetEntity, { id: getAssetEntityId(chainId, assetAddress) }).set({
    subscriptionPrice: newSubscriptionPrice,
  });

  // 2. Log History
  await context.db.insert(Asset_SubscriptionPriceUpdated).values({
    id: getEventId(event, chainId),
    chainId: chainId,
    newSubscriptionPrice: newSubscriptionPrice,
    assetAddress: assetAddress,
    blockNumber: event.block.number,
    blockTimestamp: event.block.timestamp,
  });
});

ponder.on("Asset:OwnershipTransferred", async ({ event, context }) => {
  const chainId = context.chain?.id as number;
  const assetAddress = event.log.address.toLowerCase();
  const newOwner = event.args.newOwner.toLowerCase();

  // 1. Update the mutable Asset Entity (if exists)
  try {
    await context.db.update(AssetEntity, { id: getAssetEntityId(chainId, assetAddress) }).set({
      owner: newOwner,
    });
  } catch (e: any) {
    // If the AssetEntity doesn't exist (e.g., event emitted in constructor before registry created it), skip update.
    // The AssetCreated event will set the correct initial state.
    if (!e.message?.includes('No existing record found')) {
      throw e;
    }
  }

  // 2. Log History
  await context.db.insert(Asset_OwnershipTransferred).values({
    id: getEventId(event, chainId),
    chainId: chainId,
    previousOwner: event.args.previousOwner.toLowerCase(),
    newOwner: newOwner,
    assetAddress: assetAddress,
    blockNumber: event.block.number,
    blockTimestamp: event.block.timestamp,
  });
});
