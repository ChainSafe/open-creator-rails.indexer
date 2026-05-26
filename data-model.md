# Data Model

Defined in [`ponder.schema.ts`](ponder.schema.ts). For the GraphQL surface that exposes these entities, see [queries.md](queries.md).

## State entities

### `RegistryEntity`

One row per `AssetRegistry` contract.

- `id`: `${chainId}_${registryAddress}` (address lowercased).
- `chainId`: chain id.
- `address`: registry contract address (lowercased).
- `owner`: current registry owner — populated on deploy when `OwnershipTransferred` fires from `Ownable(msg.sender)`. Updated by subsequent transfers.
- `registryFeeShare`: percentage (0–100) the registry takes from each claim — populated on deploy when the constructor emits `RegistryFeeShareUpdated(initial)`. Updated by `updateRegistryFeeShare()`.

### `AssetEntity`

One row per deployed `Asset` contract.

- `id`: `${chainId}_${assetAddress}` (address lowercased).
- `chainId`: chain id.
- `assetId`: bytes32 id assigned by the registry.
- `address`: asset contract address (lowercased).
- `registryId` / `registryAddress`: FK to `RegistryEntity.id` and the raw address.
- `owner`: current owner (creator or transferee), lowercased.
- `subscriptionPrice`: current price per subscription period (BigInt). Updated by `SubscriptionPriceUpdated`. Note: per-nonce snapshots are stored on `Subscription` rows.
- `subscriptionDuration`: immutable period length in seconds (BigInt). Subscriptions are whole multiples of this.
- `tokenAddress`: immutable ERC-20 payment token set at deployment.

### `Subscription`

One row per `(asset, subscriber, nonce)` triple. Nonce 0 is created by `SubscriptionAdded`; subsequent nonces by `SubscriptionRenewed` (terms changed). `SubscriptionExtended` updates the latest nonce's `endTime` in place. `SubscriptionRevoked` / `SubscriptionCancelled` truncate `endTime`; revoke also sets `isRevoked=true`. Future nonces deleted on-chain (revoke + cancel) and all-subscriber removals (`SubscriptionRemoved`) drop their rows from the DB.

- `id`: `${chainId}_${assetAddress}_${subscriber}_${nonce}`.
- `chainId`: chain id.
- `assetId`: FK to `AssetEntity.id`.
- `subscriber`: bytes32 subscriber identity hash (`keccak(abi.encode(subscriberId, subscriberAddress))`).
- `payer`: address that paid for this nonce (lowercased).
- `startTime`, `endTime`: window for this nonce (BigInt). `endTime` is the **live** value — updated by `SubscriptionExtended`, truncated by `Revoked` / `Cancelled`.
- `nonce`: on-chain nonce (BigInt). Increments on terms changes.
- `subscriptionPrice`, `registryFeeShare`: captured at subscribe time so each nonce keeps its own pricing snapshot (per-nonce, not per-asset).
- `isRevoked`: true only when the owner explicitly revoked (`SubscriptionRevoked`). Cancels leave `false`.

### `SubscriberClaimable`

One row per `(asset, subscriber)`. Denormalised state backing the `Asset.claimable(subscriber)` and `Asset.claimableTotal` GraphQL fields — see [architecture.md → Claimable Amounts](architecture.md#claimable-amounts) for the architecture and refresh strategy.

- `id`: `${chainId}_${assetAddress}_${subscriber}`.
- `creatorClaimedAtNonce` / `creatorClaimedAtTimestamp`: mirror the on-chain `creatorClaimedAtNonces[subscriber]` / `creatorClaimedAtTimestamps[subscriber]` pointers.
- `registryClaimedAtNonce` / `registryClaimedAtTimestamp`: same for the registry-side pointers.
- `creatorFee` / `registryFee`: accrued claimable amounts as of the last refresh.
- `refreshedAtBlock` / `refreshedAtTimestamp`: when the row was last brought up to date. Exposed as `asOfBlock` / `asOfTimestamp` in the GraphQL response so consumers can reason about freshness.

## Event log tables

Raw event history for debugging and analytics. One row per event, keyed by `${chainId}-${txHash}-${logIndex}`.

- `AssetRegistry_AssetCreated`
- `AssetRegistry_OwnershipTransferred`
- `AssetRegistry_RegistryFeeShareUpdated`
- `AssetRegistry_RegistryFeeClaimedBatch`
- `AssetRegistry_RegistryFeeClaimed`
- `Asset_SubscriptionAdded`
- `Asset_SubscriptionRenewed`
- `Asset_SubscriptionExtended`
- `Asset_SubscriptionPriceUpdated`
- `Asset_SubscriptionRevoked`
- `Asset_SubscriptionCancelled`
- `Asset_SubscriptionRemoved`
- `Asset_CreatorFeeClaimed`
- `Asset_OwnershipTransferred`
