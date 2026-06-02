import { ponder } from "ponder:registry";
import { and, asc, eq, gt, gte, lte } from "ponder";
import {
  AssetEntity,
  Subscription,
  SubscriberClaimable,
} from "../../ponder.schema";
import { getAssetEntityId, getSubscriberClaimableId } from "../utils";

// ── Pure math ────────────────────────────────────────────────────────────────
// TypeScript port of Asset._claimable() from open-creator-rails (Asset.sol:289).
// Pure over already-fetched inputs so the surrounding helpers can fetch in
// whatever shape suits the call site (single-row event handler vs. bulk
// block-interval refresh).
//
// IMPORTANT: must stay faithful to the contract. If _claimable() changes
// upstream, this has to mirror it.

export type PointerState = {
  claimedAtNonce: bigint;
  claimedAtTimestamp: bigint;
};

export type SubscriptionRow = {
  nonce: bigint;
  startTime: bigint;
  endTime: bigint;
  subscriptionPrice: bigint;
  registryFeeShare: bigint;
};

export type ClaimableResult = {
  creatorFee: bigint;
  registryFee: bigint;
  creator: PointerState;
  registry: PointerState;
};

export function computeClaimable(
  subscriptions: SubscriptionRow[],
  duration: bigint,
  asOfTimestamp: bigint,
  creator: PointerState,
  registry: PointerState,
): ClaimableResult {
  let creatorFee = 0n;
  let registryFee = 0n;
  let cNonce = creator.claimedAtNonce;
  let cAt = creator.claimedAtTimestamp;
  let rNonce = registry.claimedAtNonce;
  let rAt = registry.claimedAtTimestamp;

  for (const sub of subscriptions) {
    // Mirrors the contract's `break`: subsequent (higher-nonce) subscriptions
    // start at the same time or later, so once a nonce starts at/after the
    // asOf horizon the rest contribute nothing.
    if (sub.startTime >= asOfTimestamp) break;

    if (sub.nonce >= cNonce && sub.endTime > cAt) {
      const start = sub.startTime > cAt ? sub.startTime : cAt;
      const end = sub.endTime < asOfTimestamp ? sub.endTime : asOfTimestamp;
      const count = (end - start) / duration;
      if (count > 0n) {
        const fee = count * sub.subscriptionPrice;
        const regPortion = (fee * sub.registryFeeShare) / 100n;
        creatorFee += fee - regPortion;
        cNonce = sub.nonce;
        cAt = start + count * duration;
      }
    }

    if (sub.nonce >= rNonce && sub.endTime > rAt) {
      const start = sub.startTime > rAt ? sub.startTime : rAt;
      const end = sub.endTime < asOfTimestamp ? sub.endTime : asOfTimestamp;
      const count = (end - start) / duration;
      if (count > 0n) {
        const fee = count * sub.subscriptionPrice;
        const regPortion = (fee * sub.registryFeeShare) / 100n;
        registryFee += regPortion;
        rNonce = sub.nonce;
        rAt = start + count * duration;
      }
    }
  }

  return {
    creatorFee,
    registryFee,
    creator: { claimedAtNonce: cNonce, claimedAtTimestamp: cAt },
    registry: { claimedAtNonce: rNonce, claimedAtTimestamp: rAt },
  };
}

// ── Rollup maintenance ───────────────────────────────────────────────────────
//
// The SubscriberClaimable rollup is the single source of truth for the
// `Asset.claimable(...)` GraphQL fields. It is maintained from two directions:
//
//   1. EVENT-DRIVEN (refreshSubscriberClaimable):
//      Every subscription/claim event handler calls into this helper after
//      writing its primary state so the rollup reflects the post-event truth.
//      Pointer overrides let CreatorFeeClaimed / RegistryFeeClaimed bump the
//      relevant side's pointer in one call.
//
//   2. BLOCK-INTERVAL (refreshAllSubscriberClaimable, triggered by the
//      ClaimableRefresh:block handler at the bottom of this file):
//      Catches the "time elapsed without any event firing" case — fees accrue
//      on every period boundary even when nothing happens on-chain.

/**
 * Refresh the rollup row for a single (asset, subscriber). Reads
 * subscriptionDuration from AssetEntity, current pointers from the existing
 * rollup row (or zero if none), all Subscription rows for the pair, runs the
 * pure computeClaimable, and upserts.
 *
 * If the asset is missing (handler fired before AssetCreated indexed) this is
 * a no-op rather than an error — the rollup will be populated on the next
 * subscription event for that asset.
 */
export async function refreshSubscriberClaimable(
  context: any,
  args: {
    chainId: number;
    assetAddress: string;        // lowercased
    subscriber: string;
    blockNumber: bigint;
    blockTimestamp: bigint;
    pointerOverrides?: {
      creator?: PointerState;
      registry?: PointerState;
    };
  },
): Promise<void> {
  const { chainId, blockNumber, blockTimestamp, pointerOverrides } = args;
  const assetAddress = args.assetAddress.toLowerCase();
  const assetEntityId = getAssetEntityId(chainId, assetAddress);
  const rollupId = getSubscriberClaimableId(chainId, assetAddress, args.subscriber);

  const [asset] = await context.db.sql
    .select({ subscriptionDuration: AssetEntity.subscriptionDuration })
    .from(AssetEntity)
    .where(eq(AssetEntity.id, assetEntityId))
    .limit(1);
  if (!asset?.subscriptionDuration) return;
  const duration = BigInt(asset.subscriptionDuration);

  // Existing rollup row gives us the previously-known pointer state. First
  // refresh after SubscriptionAdded won't find a row → defaults to zero,
  // matching the contract's zero-init.
  const [existing] = await context.db.sql
    .select({
      creatorClaimedAtNonce: SubscriberClaimable.creatorClaimedAtNonce,
      creatorClaimedAtTimestamp: SubscriberClaimable.creatorClaimedAtTimestamp,
      registryClaimedAtNonce: SubscriberClaimable.registryClaimedAtNonce,
      registryClaimedAtTimestamp: SubscriberClaimable.registryClaimedAtTimestamp,
    })
    .from(SubscriberClaimable)
    .where(eq(SubscriberClaimable.id, rollupId))
    .limit(1);

  const creator: PointerState = pointerOverrides?.creator ?? {
    claimedAtNonce: BigInt(existing?.creatorClaimedAtNonce ?? 0n),
    claimedAtTimestamp: BigInt(existing?.creatorClaimedAtTimestamp ?? 0n),
  };
  const registry: PointerState = pointerOverrides?.registry ?? {
    claimedAtNonce: BigInt(existing?.registryClaimedAtNonce ?? 0n),
    claimedAtTimestamp: BigInt(existing?.registryClaimedAtTimestamp ?? 0n),
  };

  // Floor the fetch at the lower of the two per-side pointers. Rows below
  // this nonce get skipped by computeClaimable's per-side guards anyway, so
  // there's no behavioral difference — just a smaller result set. Uses the
  // indexed `nonce` column for a range scan.
  const minClaimedNonce = creator.claimedAtNonce < registry.claimedAtNonce
    ? creator.claimedAtNonce
    : registry.claimedAtNonce;

  const subs: SubscriptionRow[] = await context.db.sql
    .select({
      nonce: Subscription.nonce,
      startTime: Subscription.startTime,
      endTime: Subscription.endTime,
      subscriptionPrice: Subscription.subscriptionPrice,
      registryFeeShare: Subscription.registryFeeShare,
    })
    .from(Subscription)
    .where(and(
      eq(Subscription.assetId, assetEntityId),
      eq(Subscription.subscriber, args.subscriber),
      gte(Subscription.nonce, minClaimedNonce),
      // Drop future-dated nonces at the query level. computeClaimable's `break`
      // already discards them, but no point fetching what we'd throw away.
      // Uses the indexed startTime column.
      lte(Subscription.startTime, blockTimestamp),
    ))
    .orderBy(asc(Subscription.nonce));

  const result = computeClaimable(subs, duration, blockTimestamp, creator, registry);

  // Persist the INPUT pointers, not the loop's advanced output.
  //
  // computeClaimable advances cNonce/cAt internally so it can sum fees across
  // multiple nonces in one call — those advanced values are a loop variable,
  // NOT a new claim point. The on-chain pointers (creatorClaimedAtTimestamps,
  // creatorClaimedAtNonces) only move when an actual claim transaction runs,
  // which surfaces here as CreatorFeeClaimed / RegistryFeeClaimed events
  // applying pointerOverrides.
  //
  // Writing result.creator.* back would falsely "advance" the rollup pointer
  // every refresh, so subsequent refreshes against the same asOf would
  // compute count=0 and store fees=0, collapsing accrued claimable to zero.
  await context.db.insert(SubscriberClaimable).values({
    id: rollupId,
    chainId,
    assetEntityId,
    subscriber: args.subscriber,
    creatorClaimedAtNonce: creator.claimedAtNonce,
    creatorClaimedAtTimestamp: creator.claimedAtTimestamp,
    registryClaimedAtNonce: registry.claimedAtNonce,
    registryClaimedAtTimestamp: registry.claimedAtTimestamp,
    creatorFee: result.creatorFee,
    registryFee: result.registryFee,
    refreshedAtBlock: blockNumber,
    refreshedAtTimestamp: blockTimestamp,
  }).onConflictDoUpdate({
    creatorClaimedAtNonce: creator.claimedAtNonce,
    creatorClaimedAtTimestamp: creator.claimedAtTimestamp,
    registryClaimedAtNonce: registry.claimedAtNonce,
    registryClaimedAtTimestamp: registry.claimedAtTimestamp,
    creatorFee: result.creatorFee,
    registryFee: result.registryFee,
    refreshedAtBlock: blockNumber,
    refreshedAtTimestamp: blockTimestamp,
  });
}

/**
 * Delete a rollup row. Used by SubscriptionRemoved (subscriber removed from
 * the asset entirely; future-nonces deleted). Safe to call when no row exists.
 */
export async function deleteSubscriberClaimable(
  context: any,
  chainId: number,
  assetAddress: string,
  subscriber: string,
): Promise<void> {
  const rollupId = getSubscriberClaimableId(chainId, assetAddress, subscriber);
  await context.db.delete(SubscriberClaimable, { id: rollupId }).catch(() => {});
}

/**
 * Block-interval refresh entry point. Iterates every rollup row on the given
 * chain via keyset pagination on the indexed `id` PK so we never load the full
 * rollup table into memory. Each batch is BATCH_SIZE rows; the per-row refresh
 * still does ~3 queries (asset, existing rollup, subs) + 1 upsert, so total
 * work is O(N) but memory stays bounded.
 *
 * If N grows into the hundreds of thousands and the per-row fan-out becomes
 * the bottleneck, the next step is to push the recompute into SQL or batch-
 * fetch (assets, subs) for each page.
 */
const BATCH_SIZE = 500;

export async function refreshAllSubscriberClaimable(
  context: any,
  args: { chainId: number; blockNumber: bigint; blockTimestamp: bigint },
): Promise<void> {
  const { chainId, blockNumber, blockTimestamp } = args;
  const startedAt = Date.now();
  let refreshed = 0;

  let cursor: string | null = null;
  while (true) {
    const where = cursor === null
      ? eq(SubscriberClaimable.chainId, chainId)
      : and(
          eq(SubscriberClaimable.chainId, chainId),
          gt(SubscriberClaimable.id, cursor),
        );

    const page: Array<{ id: string; assetEntityId: string; subscriber: string }> =
      await context.db.sql
        .select({
          id: SubscriberClaimable.id,
          assetEntityId: SubscriberClaimable.assetEntityId,
          subscriber: SubscriberClaimable.subscriber,
        })
        .from(SubscriberClaimable)
        .where(where)
        .orderBy(asc(SubscriberClaimable.id))
        .limit(BATCH_SIZE);

    if (page.length === 0) break;

    for (const row of page) {
      // assetEntityId is `${chainId}_${assetAddress}` — strip the chainId prefix to
      // recover the address for refreshSubscriberClaimable's lowercase input.
      const assetAddress = row.assetEntityId.slice(String(chainId).length + 1);
      await refreshSubscriberClaimable(context, {
        chainId,
        assetAddress,
        subscriber: row.subscriber,
        blockNumber,
        blockTimestamp,
      });
      refreshed += 1;
    }

    if (page.length < BATCH_SIZE) break;
    cursor = page[page.length - 1]!.id;
  }

  // Visibility for the optimisation signal documented in the README:
  // sustained duration > 10s here is the cue to switch to per-page batch
  // fetches inside refreshSubscriberClaimable. Logged on every fire so
  // refresh lag is observable in indexer logs without extra instrumentation.
  const durationMs = Date.now() - startedAt;
  console.info(
    `[ClaimableRefresh] chainId=${chainId} block=${blockNumber} refreshed=${refreshed} duration=${durationMs}ms`,
  );
}

// ── Block-interval refresh trigger ───────────────────────────────────────────
// Registered against the `ClaimableRefresh` block source declared in
// ponder.config.ts. Fires on each chain's configured interval (Sepolia ~24h,
// local every block) and brings every rollup row's fee values up to date with
// the current block timestamp.
//
// Historical backfill optimization: skip refresh ticks whose block timestamp
// trails wall-clock by more than HISTORICAL_BACKFILL_LAG_SEC. The rollup is
// already kept correct by the event-driven path during backfill, and queries
// can't reach the indexer until /ready fires post-backfill — so intermediate
// "as of historical block N" values are never read. Skipping them saves
// O(refresh_ticks × subscribers) work on chains with a long startBlock-to-head
// distance.
const HISTORICAL_BACKFILL_LAG_SEC = 300n; // 5 minutes
ponder.on("ClaimableRefresh:block", async ({ event, context }) => {
  const wallNow = BigInt(Math.floor(Date.now() / 1000));
  if (wallNow - event.block.timestamp > HISTORICAL_BACKFILL_LAG_SEC) return;

  const chainId = context.chain?.id as number;
  await refreshAllSubscriberClaimable(context, {
    chainId,
    blockNumber: event.block.number,
    blockTimestamp: event.block.timestamp,
  });
});
