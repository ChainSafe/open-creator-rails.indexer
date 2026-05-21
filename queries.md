# GraphQL Queries

The v2 endpoint at `/v2/graphql` is the indexer's recommended API. Open the GraphiQL playground at `http://localhost:42069/v2/graphql` after starting the indexer.

This document is generated from the typeDefs in [`src/api/`](src/api/). For underlying schema entity shapes, see [data-model.md](data-model.md).

## Contents

- [Scalars and base types](#scalars-and-base-types)
- [Pagination shape](#pagination-shape)
- [Filter semantics](#filter-semantics)
- [State queries](#state-queries)
  - [`registries`](#registries)
  - [`assets`](#assets)
  - [`subscriptions`](#subscriptions)
  - [`activeSubscriptions`](#activesubscriptions)
  - [`Asset.expiringSubscriptions`](#assetexpiringsubscriptions)
- [Event log queries](#event-log-queries)
  - Registry-side: [`assetRegistry_AssetCreateds`](#assetregistry_assetcreateds) · [`assetRegistry_OwnershipTransferreds`](#assetregistry_ownershiptransferreds) · [`assetRegistry_RegistryFeeShareUpdateds`](#assetregistry_registryfeeshareupdateds) · [`assetRegistry_RegistryFeeClaimedBatchs`](#assetregistry_registryfeeclaimedbatchs) · [`assetRegistry_RegistryFeeClaimeds`](#assetregistry_registryfeeclaimeds)
  - Asset-side: [`asset_SubscriptionAddeds`](#asset_subscriptionaddeds) · [`asset_SubscriptionExtendeds`](#asset_subscriptionextendeds) · [`asset_SubscriptionRevokeds`](#asset_subscriptionrevokeds) · [`asset_SubscriptionCancelleds`](#asset_subscriptioncancelleds) · [`asset_SubscriptionPriceUpdateds`](#asset_subscriptionpriceupdateds) · [`asset_CreatorFeeClaimeds`](#asset_creatorfeeclaimeds) · [`asset_OwnershipTransferreds`](#asset_ownershiptransferreds)
- [Meta query](#meta-query)
- [Examples](#examples)
- [Staleness of claimable fields](#staleness-of-claimable-fields)
- [Notes](#notes)

## Scalars and base types

```graphql
scalar BigInt   # serialised as a string in responses to avoid JS integer overflow
scalar JSON     # untyped pass-through; only used by Meta.status
scalar Address  # lowercased on input; filters are case-insensitive

type PageInfo { hasNextPage: Boolean! hasPreviousPage: Boolean! }
type Meta     { status: JSON }
```

## Pagination shape

Every list query returns a `*Page` wrapper:

```graphql
type SomePage {
  items: [Some!]!
  pageInfo: PageInfo!
  totalCount: Int!
}
```

All list queries accept the same four pagination/ordering args:

| Arg | Type | Default | Notes |
|---|---|---|---|
| `where` | `<Entity>Filter` | `null` | Equality-only — see [Filter semantics](#filter-semantics) |
| `orderBy` | `String` | none | Any stored field name. Computed fields (`isActive`, `isExpired`, `claimable`, etc.) cannot be ordered on |
| `orderDirection` | `String` | `asc` | `asc` or `desc` |
| `limit` | `Int` | `50` | Capped at `1000` |
| `offset` | `Int` | `0` | Offset pagination; use `pageInfo.hasNextPage` to detect more |

## Filter semantics

The `where` argument on every list query accepts an `<Entity>Filter` input. Field semantics:

- **Equality only.** No `_gt` / `_lt` / `_in` / `_contains` operators.
- **AND across fields.** Multiple fields in one `where` block AND together. There's no top-level `OR` / `AND` / `NOT`.
- **Address fields are case-insensitive.** The `Address` scalar lowercases input automatically — pass `"0xAbCd..."` or `"0xabcd..."` interchangeably.
- **`String` fields are case-sensitive.** `id`, `subscriber`, `assetId` etc. — bytes32 hashes and composite ids should be supplied lowercased.
- **`BigInt` fields take string-or-int input.** `claimedAtNonce: "0"` or `claimedAtNonce: 0` both work; the scalar coerces.

If you need richer filtering, fall back to the auto-generated `/graphql` endpoint (deprecated but still wired up) which supports operator suffixes.

---

## State queries

### `registries`

```graphql
registries(where: RegistryFilter, orderBy: String, orderDirection: String, limit: Int, offset: Int): RegistryPage!
```

One row per `AssetRegistry` contract.

**Returns** (`type Registry`):

| Field | Type | Notes |
|---|---|---|
| `id` | `String!` | `${chainId}_${address}` |
| `chainId` | `Int!` | |
| `address` | `String!` | Lowercased registry contract address |
| `owner` | `String` | Null until the constructor's `OwnershipTransferred` event is indexed |
| `registryFeeShare` | `BigInt` | Null until `RegistryFeeShareUpdated` is indexed (constructor doesn't emit) |
| `assets(...)` | `AssetPage` | Relation — accepts `AssetFilter` + pagination args |

**Filter** (`input RegistryFilter`): `id`, `chainId`, `address`, `owner`.

---

### `assets`

```graphql
assets(where: AssetFilter, orderBy: String, orderDirection: String, limit: Int, offset: Int): AssetPage!
```

One row per deployed `Asset` contract.

**Returns** (`type Asset`):

| Field | Type | Notes |
|---|---|---|
| `id` | `String!` | `${chainId}_${address}` |
| `chainId` | `Int!` | |
| `assetId` | `String!` | bytes32 id assigned by the registry |
| `address` | `String!` | Lowercased asset contract address |
| `registryId` | `String!` | FK → `Registry.id` |
| `registryAddress` | `String!` | |
| `owner` | `String!` | Current owner, lowercased |
| `subscriptionPrice` | `BigInt!` | Current per-period price (live; per-nonce snapshots live on `Subscription`) |
| `subscriptionDuration` | `BigInt!` | Immutable period length in seconds |
| `tokenAddress` | `String!` | Immutable ERC-20 payment token |
| `registry` | `Registry` | Relation |
| `subscriptions(...)` | `SubscriptionPage` | All subscription rows for this asset (per-nonce). Accepts `SubscriptionFilter` + pagination |
| `activeSubscriptions(...)` | `SubscriptionPage` | Same shape, filtered to active (`startTime ≤ now < endTime`, not revoked) |
| `expiringSubscriptions(within: BigInt!, ...)` | `SubscriptionPage` | Active rows whose `endTime` falls in `(now, now + within]`. Defaults to `orderBy: "endTime"`, `orderDirection: "asc"` |
| `claimable(subscriber: String!)` | `ClaimableAmount!` | Per-subscriber claimable fees as of the indexer's latest indexed block |
| `claimableTotal` | `ClaimableTotal!` | Aggregate claimable across all subscribers on this asset |

**`ClaimableAmount`**: `creatorFee: BigInt!`, `registryFee: BigInt!`, `asOfTimestamp: BigInt!`, `asOfBlock: BigInt!`.

**`ClaimableTotal`**: same as `ClaimableAmount` plus `subscriberCount: Int!`.

**Filter** (`input AssetFilter`): `id`, `chainId`, `assetId`, `address`, `registryId`, `registryAddress`, `owner`.

---

### `subscriptions`

```graphql
subscriptions(where: SubscriptionFilter, orderBy: String, orderDirection: String, limit: Int, offset: Int): SubscriptionPage!
```

One row per `(asset, subscriber, nonce)`. Includes expired and revoked subscriptions; use `activeSubscriptions` for the active subset.

**Returns** (`type Subscription`):

| Field | Type | Notes |
|---|---|---|
| `id` | `String!` | `${chainId}_${assetAddress}_${subscriber}_${nonce}` |
| `chainId` | `Int!` | |
| `assetId` | `String!` | FK → `Asset.id` (composite key, not bytes32) |
| `subscriber` | `String!` | bytes32 identity hash — `keccak(abi.encode(subscriberId, subscriberAddress))` |
| `payer` | `String!` | Address that paid for this nonce, lowercased |
| `startTime` | `BigInt!` | Start of this nonce's window |
| `endTime` | `BigInt!` | Live end-time — updated by `SubscriptionExtended`, truncated by `Revoked`/`Cancelled` |
| `nonce` | `BigInt!` | On-chain nonce |
| `subscriptionPrice` | `BigInt!` | Per-period price at subscribe time |
| `registryFeeShare` | `BigInt!` | Registry fee share at subscribe time |
| `isRevoked` | `Boolean!` | True only on explicit revoke; cancellations leave this `false` |
| `isExpired` | `Boolean!` | Computed: `endTime ≤ now`. Cannot be used in `where`/`orderBy` |
| `isActive` | `Boolean!` | Computed: `startTime ≤ now < endTime && !isRevoked`. Cannot be used in `where`/`orderBy` |
| `asset` | `Asset` | Relation |

**Filter** (`input SubscriptionFilter`): `id`, `chainId`, `assetId`, `subscriber`, `payer`.

---

### `activeSubscriptions`

```graphql
activeSubscriptions(where: SubscriptionFilter, orderBy: String, orderDirection: String, limit: Int, offset: Int): SubscriptionPage!
```

Same return shape as `subscriptions`, with an additional server-side filter: only rows where `startTime ≤ now < endTime && !isRevoked`. Use this for "who is currently subscribed" dashboards.

The `now` reference is the API server's wall clock, not the latest indexed block.

---

### `Asset.expiringSubscriptions`

```graphql
type Asset {
  expiringSubscriptions(
    within: BigInt!
    where: SubscriptionFilter
    orderBy: String
    orderDirection: String
    limit: Int
    offset: Int
  ): SubscriptionPage
}
```

Only exposed as a field on `Asset` (not on root `Query`). Returns the subset of `activeSubscriptions` whose `endTime` falls in the half-open window `(now, now + within]` — i.e. active rows that will expire within `within` seconds.

`within` is required and is in seconds. Defaults to `orderBy: "endTime"`, `orderDirection: "asc"` when not supplied, so callers (e.g. an off-chain renewal scheduler) get the next-to-expire cohort first.

The `now` reference is the API server's wall clock, not the latest indexed block — same caveat as `activeSubscriptions`.

---

## Event log queries

Every event-log row is keyed by `id: ${chainId}-${txHash}-${logIndex}`. All event types share `id`, `chainId`, `blockNumber`, `blockTimestamp` — those aren't repeated below.

### Registry-side events

#### `assetRegistry_AssetCreateds`

```graphql
assetRegistry_AssetCreateds(where: AssetRegistry_AssetCreatedFilter, ...): AssetRegistry_AssetCreatedPage!
```

Type-specific fields: `assetId`, `asset`, `subscriptionPrice`, `subscriptionDuration`, `tokenAddress`, `owner`, `registryAddress`.

**Filter**: `id`, `chainId`, `assetId`, `asset` (`Address`), `owner` (`Address`), `registryAddress` (`Address`).

#### `assetRegistry_OwnershipTransferreds`

Type-specific fields: `previousOwner`, `newOwner`, `registryAddress`.

**Filter**: `id`, `chainId`, `previousOwner` (`Address`), `newOwner` (`Address`), `registryAddress` (`Address`).

#### `assetRegistry_RegistryFeeShareUpdateds`

Type-specific fields: `newRegistryFeeShare`, `registryAddress`.

**Filter**: `id`, `chainId`, `newRegistryFeeShare` (`BigInt`), `registryAddress` (`Address`).

#### `assetRegistry_RegistryFeeClaimedBatchs`

Aggregate batch-claim event emitted by the array-arg `claimRegistryFee(bytes32, bytes32[])` path. Use [`assetRegistry_RegistryFeeClaimeds`](#assetregistry_registryfeeclaimeds) for per-subscriber detail.

Type-specific fields: `assetId`, `totalAmount`, `registryAddress`.

**Filter**: `id`, `chainId`, `assetId`, `registryAddress` (`Address`).

#### `assetRegistry_RegistryFeeClaimeds`

Per-subscriber registry fee claim event. Emitted by both single-subscriber `claimRegistryFee(bytes32, bytes32)` and the loop body inside the batch path (once per non-zero claim).

Type-specific fields:

| Field | Type | Notes |
|---|---|---|
| `assetId` | `String!` | bytes32 |
| `assetEntityId` | `String` | FK → `Asset.id`; null if the asset wasn't indexed when the event arrived |
| `subscriber` | `String!` | bytes32 identity hash |
| `amount` | `BigInt!` | Tokens transferred to the registry owner |
| `claimedAtTimestamp` | `BigInt!` | Period-aligned end of the claimed window |
| `claimedAtNonce` | `BigInt!` | Nonce the contract advanced its pointer to |
| `subscriptionId` | `String` | FK → `Subscription.id`; null if the nonce row was deleted (e.g. future-nonce revoke) |
| `registryAddress` | `String!` | |
| `asset` | `Asset` | Relation (via `assetEntityId`) |
| `subscription` | `Subscription` | Relation (via `subscriptionId`) |

**Filter**: `id`, `chainId`, `assetId`, `assetEntityId`, `subscriber`, `registryAddress` (`Address`), `claimedAtNonce` (`BigInt`), `subscriptionId`.

---

### Asset-side events

#### `asset_SubscriptionAddeds`

Fires on a subscriber's first subscription to an asset (nonce 0).

Type-specific fields: `subscriber`, `payer`, `startTime`, `endTime`, `nonce`, `assetAddress`.

**Filter**: `id`, `chainId`, `subscriber`, `payer` (`Address`), `assetAddress` (`Address`).

#### `asset_SubscriptionExtendeds`

Same-terms top-up that extended the latest active nonce in place.

Type-specific fields: `subscriber`, `endTime`, `assetAddress`.

**Filter**: `id`, `chainId`, `subscriber`, `assetAddress` (`Address`).

#### `asset_SubscriptionRevokeds`

Asset owner explicitly revoked a subscriber. The Subscription row stays with `isRevoked=true` and truncated `endTime`.

Type-specific fields: `subscriber`, `assetAddress`.

**Filter**: `id`, `chainId`, `subscriber`, `assetAddress` (`Address`).

#### `asset_SubscriptionCancelleds`

Subscriber cancelled their own subscription. Like revoke, the Subscription row stays with truncated `endTime` but `isRevoked` remains `false`.

Type-specific fields: `subscriber`, `assetAddress`.

**Filter**: `id`, `chainId`, `subscriber`, `assetAddress` (`Address`).

#### `asset_SubscriptionPriceUpdateds`

Owner changed the asset's subscription price. Doesn't affect existing Subscription rows — their `subscriptionPrice` is captured at subscribe time.

Type-specific fields: `newSubscriptionPrice`, `assetAddress`.

**Filter**: `id`, `chainId`, `assetAddress` (`Address`).

#### `asset_CreatorFeeClaimeds`

Per-subscriber creator fee claim event. Emitted by both `claimCreatorFee(bytes32)` and the loop body inside `claimCreatorFee(bytes32[])`.

Type-specific fields:

| Field | Type | Notes |
|---|---|---|
| `subscriber` | `String!` | bytes32 identity hash |
| `amount` | `BigInt!` | Tokens transferred to the asset owner |
| `claimedAtTimestamp` | `BigInt!` | Period-aligned end of the claimed window |
| `claimedAtNonce` | `BigInt!` | Nonce the contract advanced its pointer to |
| `subscriptionId` | `String` | FK → `Subscription.id`; null if the nonce row was deleted |
| `assetAddress` | `String!` | |
| `subscription` | `Subscription` | Relation (via `subscriptionId`) |

**Filter**: `id`, `chainId`, `subscriber`, `assetAddress` (`Address`), `claimedAtNonce` (`BigInt`), `subscriptionId`.

#### `asset_OwnershipTransferreds`

Type-specific fields: `previousOwner`, `newOwner`, `assetAddress`.

**Filter**: `id`, `chainId`, `previousOwner` (`Address`), `newOwner` (`Address`), `assetAddress` (`Address`).

---

## Meta query

```graphql
_meta: Meta
```

```graphql
type Meta { status: JSON }
```

`status` is a JSON object keyed by chain name, with the indexer's latest checkpoint per chain. Useful for staleness checks before trusting derived values like `claimable.asOf*`.

```graphql
{
  _meta {
    status
  }
}
```

Response:

```json
{
  "data": {
    "_meta": {
      "status": {
        "sepolia": { "id": 11155111, "block": { "number": 10299988, "timestamp": 1718200000 } },
        "local":   { "id": 31337,    "block": { "number": 46,       "timestamp": 1778828776 } }
      }
    }
  }
}
```

---

## Examples

### Fetch all assets owned by an address, including current claimable totals

```graphql
{
  assets(where: { owner: "0xYourAddress" }) {
    items {
      id
      assetId
      address
      chainId
      claimableTotal {
        creatorFee
        registryFee
        subscriberCount
        asOfBlock
      }
    }
  }
}
```

### Claimable for a specific subscriber on an asset

```graphql
{
  assets(where: { assetId: "local_asset_9" }) {
    items {
      claimable(subscriber: "0xSUB1_HASH") {
        creatorFee
        registryFee
        asOfBlock
        asOfTimestamp
      }
    }
  }
}
```

### All currently-active subscriptions paid for by a wallet

```graphql
{
  activeSubscriptions(where: { payer: "0x..." }) {
    items {
      assetId
      subscriber
      startTime
      endTime
      isActive
    }
    totalCount
  }
}
```

### Subscriptions on an asset that expire in the next 24 hours

Useful as the work queue for an off-chain renewal scheduler.

```graphql
{
  assets(where: { assetId: "local_asset_9" }) {
    items {
      expiringSubscriptions(within: "86400", limit: 100) {
        items {
          subscriber
          payer
          endTime
          subscriptionPrice
        }
        pageInfo { hasNextPage }
        totalCount
      }
    }
  }
}
```

### Walk the per-claim history for an asset, linking each claim back to its subscription nonce

```graphql
{
  asset_CreatorFeeClaimeds(where: { assetAddress: "0xAssetAddr" }, orderBy: "blockNumber", orderDirection: "desc") {
    items {
      blockNumber
      subscriber
      amount
      claimedAtNonce
      subscription {
        id
        startTime
        endTime
        nonce
      }
    }
  }
}
```

### Page through subscriptions 20 at a time

```graphql
{
  subscriptions(limit: 20, offset: 0, orderBy: "startTime", orderDirection: "desc") {
    items {
      id
      subscriber
      startTime
      endTime
    }
    pageInfo { hasNextPage hasPreviousPage }
    totalCount
  }
}
```

### Check indexer freshness before trusting claimable values

```graphql
{
  _meta { status }
  assets(where: { assetId: "local_asset_8" }) {
    items {
      claimableTotal { creatorFee asOfBlock asOfTimestamp }
    }
  }
}
```

Compare `_meta.status.<chain>.block.number` with `claimableTotal.asOfBlock` to see how stale the rollup is.

---

## Staleness of claimable fields

The `Asset.claimable(subscriber)` and `Asset.claimableTotal` responses include `asOfBlock` and `asOfTimestamp` fields reflecting **when the underlying rollup row was last refreshed**.

Two staleness sources to be aware of:

1. **Indexer lag vs chain head.** Between the latest indexed block and the actual chain head, on-chain claimable may have advanced past the indexed number. Compare against `_meta.status.<chain>.block.number` to see how far behind the indexer is.
2. **Refresh interval drift.** Even within the indexed range, claimable accrues on every period boundary. The rollup is brought up to date by a periodic background refresh (Sepolia: every ~24h; local: every block). Between refreshes, the stored `creatorFee` / `registryFee` is a **lower bound** on what the contract would pay at chain head.

For UI use cases that need exact on-chain numbers (e.g. a "Click to claim X tokens" confirmation), either:

- Display the `asOf*` block + timestamp alongside the number so users understand the staleness window, or
- Fall back to an RPC `eth_call` against the contract's `claimCreatorFee` / `claimRegistryFee` with `from: owner` at the moment of UI commitment.

The indexed numbers are designed for **dashboards and analytics**, not the moment-of-truth in a claim transaction.

For the design rationale behind this rollup + refresh model — including alternatives considered and why they were rejected — see [architecture.md → Claimable Amounts](architecture.md#claimable-amounts).

## Notes

- Address filter fields accept any casing — `"0xAbCd..."` and `"0xabcd..."` both work.
- All `BigInt` values are returned as **strings** to avoid JavaScript integer overflow. Cast on the client (`BigInt(value)` in JS, `int(value)` after stripping quotes elsewhere).
- `blockTimestamp` is a Unix timestamp in **seconds**, not milliseconds.
- `subscriber` is a `bytes32` identity hash (`keccak(abi.encode(subscriberId, subscriberAddress))`), not a wallet address. Use `payer` if you want to filter by the address that funded the subscription.
- Relation fields (`asset`, `subscription`, `registry`) are nullable — the FK might be unresolved if the related entity hasn't been indexed yet or was deleted. Check for `null` on the client.
- `isActive` / `isExpired` on `Subscription` and `claimable` / `claimableTotal` on `Asset` are computed at query time and can't be used in `where` clauses or `orderBy`. Filter on stored fields and post-filter client-side if you need to combine.
