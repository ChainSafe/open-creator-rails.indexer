import { ponder } from "ponder:registry";
import { eq, and, desc, gt, lte } from "ponder";
import {
  AssetEntity,
  Subscription,
  Asset_SubscriptionAdded,
  Asset_SubscriptionRenewed,
  Asset_SubscriptionExtended,
  Asset_CreatorFeeClaimed,
  Asset_SubscriptionRevoked,
  Asset_SubscriptionCancelled,
  Asset_SubscriptionRemoved,
  Asset_SubscriptionPriceUpdated,
  Asset_OwnershipTransferred,
} from "../../ponder.schema";
import { getEventId, getAssetEntityId, getSubscriptionId } from "../utils";
import { refreshSubscriberClaimable, deleteSubscriberClaimable } from "./claimable";

ponder.on("Asset:SubscriptionAdded", async ({ event, context }) => {
  const chainId = context.chain?.id as number;
  const assetAddress = event.log.address.toLowerCase();
  const subscriber = event.args.subscriber;
  const payer = event.args.payer.toLowerCase();
  const assetEntityId = getAssetEntityId(chainId, assetAddress);

  // SubscriptionAdded is only emitted for brand-new subscribers — nonce is always 0
  await context.db.insert(Subscription).values({
    id: getSubscriptionId(chainId, assetAddress, subscriber, 0n),
    chainId: chainId,
    assetId: assetEntityId,
    subscriber: subscriber,
    payer: payer,
    startTime: event.args.startTime,
    endTime: event.args.endTime,
    nonce: 0n,
    subscriptionPrice: event.args.subscriptionPrice,
    registryFeeShare: event.args.registryFeeShare,
    isRevoked: false,
  }).onConflictDoNothing();

  await context.db.insert(Asset_SubscriptionAdded).values({
    id: getEventId(event, chainId),
    chainId: chainId,
    subscriber: subscriber,
    payer: payer,
    startTime: event.args.startTime,
    endTime: event.args.endTime,
    subscriptionPrice: event.args.subscriptionPrice,
    registryFeeShare: event.args.registryFeeShare,
    assetAddress: assetAddress,
    blockNumber: event.block.number,
    blockTimestamp: event.block.timestamp,
  });

  await refreshSubscriberClaimable(context, {
    chainId,
    assetAddress,
    subscriber,
    blockNumber: event.block.number,
    blockTimestamp: event.block.timestamp,
  });
});

ponder.on("Asset:SubscriptionRenewed", async ({ event, context }) => {
  const chainId = context.chain?.id as number;
  const assetAddress = event.log.address.toLowerCase();
  const subscriber = event.args.subscriber;
  const payer = event.args.payer.toLowerCase();
  const assetEntityId = getAssetEntityId(chainId, assetAddress);

  // SubscriptionRenewed is emitted when terms change and a new nonce is created
  await context.db.insert(Subscription).values({
    id: getSubscriptionId(chainId, assetAddress, subscriber, event.args.nonce),
    chainId: chainId,
    assetId: assetEntityId,
    subscriber: subscriber,
    payer: payer,
    startTime: event.args.startTime,
    endTime: event.args.endTime,
    nonce: event.args.nonce,
    subscriptionPrice: event.args.subscriptionPrice,
    registryFeeShare: event.args.registryFeeShare,
    isRevoked: false,
  }).onConflictDoNothing();

  await context.db.insert(Asset_SubscriptionRenewed).values({
    id: getEventId(event, chainId),
    chainId: chainId,
    subscriber: subscriber,
    payer: payer,
    startTime: event.args.startTime,
    endTime: event.args.endTime,
    nonce: event.args.nonce,
    subscriptionPrice: event.args.subscriptionPrice,
    registryFeeShare: event.args.registryFeeShare,
    assetAddress: assetAddress,
    blockNumber: event.block.number,
    blockTimestamp: event.block.timestamp,
  });

  await refreshSubscriberClaimable(context, {
    chainId,
    assetAddress,
    subscriber,
    blockNumber: event.block.number,
    blockTimestamp: event.block.timestamp,
  });
});

ponder.on("Asset:SubscriptionExtended", async ({ event, context }) => {
  const chainId = context.chain?.id as number;
  const assetAddress = event.log.address.toLowerCase();
  const subscriber = event.args.subscriber;
  const assetEntityId = getAssetEntityId(chainId, assetAddress);

  // SubscriptionExtended has no nonce in the event — find the highest active nonce row.
  // Gate to active only: startTime <= now < endTime, consistent with contract semantics.
  const now = event.block.timestamp;
  const rows = await context.db.sql
    .select({ id: Subscription.id })
    .from(Subscription)
    .where(and(
      eq(Subscription.assetId, assetEntityId),
      eq(Subscription.subscriber, subscriber),
      eq(Subscription.isRevoked, false),
    ))
    .orderBy(desc(Subscription.nonce))
    .limit(1);

  if (rows.length > 0) {
    await context.db.update(Subscription, { id: rows[0]!.id }).set({
      endTime: event.args.endTime,
    });
  }

  await context.db.insert(Asset_SubscriptionExtended).values({
    id: getEventId(event, chainId),
    chainId: chainId,
    subscriber: subscriber,
    endTime: event.args.endTime,
    assetAddress: assetAddress,
    blockNumber: event.block.number,
    blockTimestamp: event.block.timestamp,
  });

  await refreshSubscriberClaimable(context, {
    chainId,
    assetAddress,
    subscriber,
    blockNumber: event.block.number,
    blockTimestamp: event.block.timestamp,
  });
});

ponder.on("Asset:CreatorFeeClaimed", async ({ event, context }) => {
  const chainId = context.chain?.id as number;
  const assetAddress = event.log.address.toLowerCase();
  const subscriber = event.args.subscriber;
  const claimedAtNonce = event.args.claimedAtNonce;

  // FK is best-effort: rows can be hard-deleted on revoke of future nonces
  // or SubscriptionRemoved, in which case we keep the claim row but leave
  // subscriptionId null instead of failing the insert.
  const subscriptionId = getSubscriptionId(chainId, assetAddress, subscriber, claimedAtNonce);
  const subscriptionRows = await context.db.sql
    .select({ id: Subscription.id })
    .from(Subscription)
    .where(eq(Subscription.id, subscriptionId))
    .limit(1);
  const linkedSubscriptionId = subscriptionRows.length > 0 ? subscriptionId : null;

  await context.db.insert(Asset_CreatorFeeClaimed).values({
    id: getEventId(event, chainId),
    chainId: chainId,
    subscriber: subscriber,
    amount: event.args.amount,
    claimedAtTimestamp: event.args.claimedAtTimestamp,
    claimedAtNonce: claimedAtNonce,
    subscriptionId: linkedSubscriptionId,
    assetAddress: assetAddress,
    blockNumber: event.block.number,
    blockTimestamp: event.block.timestamp,
  });

  // Bump creator pointer to the event's values and let computeClaimable derive
  // the post-claim creatorFee — which will be 0 because the contract just paid
  // out everything claimable up to event.args.claimedAtTimestamp. Registry
  // pointer is left as-is (the existing rollup row's value).
  await refreshSubscriberClaimable(context, {
    chainId,
    assetAddress,
    subscriber,
    blockNumber: event.block.number,
    blockTimestamp: event.block.timestamp,
    pointerOverrides: {
      creator: {
        claimedAtNonce: event.args.claimedAtNonce,
        claimedAtTimestamp: event.args.claimedAtTimestamp,
      },
    },
  });
});

ponder.on("Asset:SubscriptionRevoked", async ({ event, context }) => {
  const chainId = context.chain?.id as number;
  const assetAddress = event.log.address.toLowerCase();
  const subscriber = event.args.subscriber;
  const revokedNonce = event.args.nonce;
  const assetEntityId = getAssetEntityId(chainId, assetAddress);

  // The event tells us exactly which nonce was truncated. Update it + delete any higher future nonces.
  const revokedId = getSubscriptionId(chainId, assetAddress, subscriber, revokedNonce);
  await context.db.update(Subscription, { id: revokedId }).set({
    isRevoked: true,
    endTime: event.args.endTime,
  }).catch(() => {});

  // Delete future nonces that were removed on-chain (nonce > revokedNonce)
  const futureRows = await context.db.sql
    .select({ id: Subscription.id })
    .from(Subscription)
    .where(and(
      eq(Subscription.assetId, assetEntityId),
      eq(Subscription.subscriber, subscriber),
      gt(Subscription.nonce, revokedNonce),
    ));

  for (const row of futureRows) {
    await context.db.delete(Subscription, { id: row.id });
  }

  await context.db.insert(Asset_SubscriptionRevoked).values({
    id: getEventId(event, chainId),
    chainId: chainId,
    subscriber: subscriber,
    nonce: revokedNonce,
    endTime: event.args.endTime,
    assetAddress: assetAddress,
    blockNumber: event.block.number,
    blockTimestamp: event.block.timestamp,
  });

  await refreshSubscriberClaimable(context, {
    chainId,
    assetAddress,
    subscriber,
    blockNumber: event.block.number,
    blockTimestamp: event.block.timestamp,
  });
});

ponder.on("Asset:SubscriptionCancelled", async ({ event, context }) => {
  const chainId = context.chain?.id as number;
  const assetAddress = event.log.address.toLowerCase();
  const subscriber = event.args.subscriber;
  const cancelledNonce = event.args.nonce;
  const assetEntityId = getAssetEntityId(chainId, assetAddress);

  // Truncate the active nonce's endTime (no isRevoked flag for cancellations)
  const cancelledId = getSubscriptionId(chainId, assetAddress, subscriber, cancelledNonce);
  await context.db.update(Subscription, { id: cancelledId }).set({
    endTime: event.args.endTime,
  }).catch(() => {});

  // Delete future nonces that were removed on-chain (nonce > cancelledNonce)
  const futureRows = await context.db.sql
    .select({ id: Subscription.id })
    .from(Subscription)
    .where(and(
      eq(Subscription.assetId, assetEntityId),
      eq(Subscription.subscriber, subscriber),
      gt(Subscription.nonce, cancelledNonce),
    ));

  for (const row of futureRows) {
    await context.db.delete(Subscription, { id: row.id });
  }

  await context.db.insert(Asset_SubscriptionCancelled).values({
    id: getEventId(event, chainId),
    chainId: chainId,
    subscriber: subscriber,
    nonce: cancelledNonce,
    endTime: event.args.endTime,
    assetAddress: assetAddress,
    blockNumber: event.block.number,
    blockTimestamp: event.block.timestamp,
  });

  await refreshSubscriberClaimable(context, {
    chainId,
    assetAddress,
    subscriber,
    blockNumber: event.block.number,
    blockTimestamp: event.block.timestamp,
  });
});

ponder.on("Asset:SubscriptionRemoved", async ({ event, context }) => {
  const chainId = context.chain?.id as number;
  const assetAddress = event.log.address.toLowerCase();
  const subscriber = event.args.subscriber;
  const assetEntityId = getAssetEntityId(chainId, assetAddress);

  // All subscriptions were future-only and deleted on-chain — remove all remaining rows
  const rows = await context.db.sql
    .select({ id: Subscription.id })
    .from(Subscription)
    .where(and(
      eq(Subscription.assetId, assetEntityId),
      eq(Subscription.subscriber, subscriber),
    ));

  for (const row of rows) {
    await context.db.delete(Subscription, { id: row.id });
  }

  await context.db.insert(Asset_SubscriptionRemoved).values({
    id: getEventId(event, chainId),
    chainId: chainId,
    subscriber: subscriber,
    assetAddress: assetAddress,
    blockNumber: event.block.number,
    blockTimestamp: event.block.timestamp,
  });

  // All subscription rows for this (asset, subscriber) were deleted above;
  // drop the rollup row too so claimable correctly reports 0.
  await deleteSubscriberClaimable(context, chainId, assetAddress, subscriber);
});

ponder.on("Asset:SubscriptionPriceUpdated", async ({ event, context }) => {
  const chainId = context.chain?.id as number;
  const assetAddress = event.log.address.toLowerCase();
  const newSubscriptionPrice = event.args.newSubscriptionPrice;

  await context.db.update(AssetEntity, { id: getAssetEntityId(chainId, assetAddress) }).set({
    subscriptionPrice: newSubscriptionPrice,
  });

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

  try {
    await context.db.update(AssetEntity, { id: getAssetEntityId(chainId, assetAddress) }).set({
      owner: newOwner,
    });
  } catch (e: any) {
    if (!e.message?.includes('No existing record found')) {
      throw e;
    }
  }

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
