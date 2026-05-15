# ocr-indexer

A [Ponder](https://ponder.sh) indexer for the OCR (Open Creator Rails) protocol.

This indexer tracks:

- **AssetRegistry**: deployment and configuration of `Asset` contracts.
- **Asset**: subscription-gated assets and their subscribers.

It exposes convenient entities to answer questions like:

- Which assets exist and who owns them?
- Which assets is a user subscribed to?
- Which users are subscribed to a given asset?

## Prerequisites

- **Node.js** v18+
- **pnpm** v8+
- **Foundry** (for local development) — install via `curl -L https://foundry.paradigm.xyz | bash && foundryup`

## Setup

Clone with submodules (the `open-creator-rails` repo is included as a submodule for ABI generation):

```bash
git clone --recurse-submodules https://github.com/ChainSafe/ocr-indexer.git
cd ocr-indexer
pnpm setup   # installs deps, builds contracts, syncs ABIs
```

If you already cloned without `--recurse-submodules`:

```bash
git submodule update --init --recursive
pnpm setup
```

## Local Development

```bash
pnpm dev:local
```

This starts three things in sequence:
1. **Anvil** — local EVM node
2. **Seed** — deploys registry, test token, and sample assets/subscriptions
3. **Ponder** — starts the indexer pointed at local Anvil (`PONDER_RPC_URL_31337`)

The API will be available at `http://localhost:42069`.

To index against Sepolia instead, set `PONDER_RPC_URL_11155111` in `.env.local` and run:

```bash
pnpm dev
```

## Scripts

| Script | Description |
|---|---|
| `pnpm setup` | Install deps, build contracts, sync ABIs — run once after cloning |
| `pnpm dev` | Start Ponder in dev mode (live reload) |
| `pnpm dev:local` | Start Anvil + seed + Ponder for local development |
| `pnpm start` | Start Ponder in production mode |
| `pnpm contracts:build` | Run `forge build` inside the `open-creator-rails` submodule |
| `pnpm sync` | Extract ABIs from Foundry build output into `config/` |
| `pnpm codegen` | Regenerate Ponder types from schema and config |
| `pnpm typecheck` | TypeScript type check |
| `pnpm lint` | ESLint |

## ABI Sync

ABIs live in `config/` and are generated from the contracts in the `open-creator-rails` submodule. To update after contract changes:

```bash
git submodule update --remote open-creator-rails
pnpm contracts:build
pnpm sync
```

The `abi-sync-check` CI workflow enforces that `config/AssetABI.ts` and `config/AssetRegistryABI.ts` are always in sync with the submodule.

## Environment Variables

| Variable | Chain | Description |
|---|---|---|
| `PONDER_RPC_URL_31337` | Local (Anvil) | Anvil RPC URL. Enables local chain indexing. |
| `PONDER_RPC_URL_11155111` | Sepolia | Sepolia RPC URL. Enables Sepolia indexing. |
| `DATABASE_URL` | — | Postgres connection string. Dev mode uses PGlite (in-process) by default. |

Both RPC URLs can be set simultaneously to index multiple chains at once.

## Docker

```bash
docker compose up --build        # start the full stack
docker compose down              # stop
docker compose down -v           # stop and remove volumes (full reset)
```

Requires `PONDER_RPC_URL_11155111` to be set in your shell or in `.env`.

The stack runs five services:

| Service | Port | Description |
|---|---|---|
| `worker` | 42070 | Ponder indexer — backfills and live-indexes chain data |
| `api` | 42069 | Ponder API server — serves GraphQL/REST from the views schema |
| `postgres` | 5432 | Shared database |
| `prometheus` | 9090 | Scrapes Ponder metrics from worker and API |
| `grafana` | 3000 | Dashboards for sync lag, API latency, and errors |

Grafana is available at `http://localhost:3000` (default credentials: `admin` / `admin`).

## API

The indexer exposes the following endpoints:

| Endpoint | Description |
|---|---|
| `GET /` | Auto-generated GraphQL playground *(deprecated)* |
| `POST /graphql` | Auto-generated GraphQL API (Ponder) *(deprecated — use `/v2/graphql`)* |
| `POST /v2/graphql` | Custom GraphQL API (recommended) |
| `GET /ready` | Health check — returns `200` when live |

### GraphQL v2 (recommended)

The v2 endpoint at `/v2/graphql` is the recommended API. Open the GraphiQL playground at `http://localhost:42069/v2/graphql` after starting the indexer.

**Key differences from the auto-generated endpoint:**
- **Case-insensitive address filters** — pass addresses in any casing; the `Address` scalar normalises them automatically
- **Equality-only filters** — simple `where` clauses with no `_gt`/`_lt`/`_in`/AND/OR operators
- **List queries only** — no single-item-by-id queries

#### Queries

| Query | Description |
|---|---|
| `registryEntitys` | Registry contract state |
| `assetEntitys` | Asset contract state |
| `subscriptions` | Subscription state per asset–subscriber |
| `assetRegistry_AssetCreateds` | Asset creation events |
| `assetRegistry_OwnershipTransferreds` | Registry ownership transfers |
| `assetRegistry_RegistryFeeShareUpdateds` | Registry fee share updates |
| `assetRegistry_RegistryFeeClaimedBatchs` | Registry fee claim batches |
| `asset_SubscriptionAddeds` | New subscription events |
| `asset_SubscriptionExtendeds` | Subscription extension events |
| `asset_SubscriptionRevokeds` | Subscription revocation events |
| `asset_SubscriptionCancelleds` | Subscription cancellation events |
| `asset_SubscriptionPriceUpdateds` | Price update events |
| `asset_CreatorFeeClaimeds` | Creator fee claim events |
| `asset_OwnershipTransferreds` | Asset ownership transfer events |
| `_meta` | Indexer sync status per chain |

**Fetch all assets by owner:**
```graphql
{
  assetEntitys(where: { owner: "0xYourAddress" }) {
    items {
      id
      assetId
      address
      chainId
    }
  }
}
```

**Check subscriptions for a payer:**
```graphql
{
  subscriptions(where: { payer: "0x..." }) {
    items {
      assetId
      subscriber
      startTime
      endTime
    }
  }
}
```

**Check indexer sync status:**
```graphql
{
  _meta {
    status
  }
}
```

**Pagination:**
```graphql
{
  subscriptions(limit: 20, offset: 0) {
    items { ... }
    pageInfo {
      hasNextPage
      hasPreviousPage
    }
    totalCount
  }
}
```

> **Notes:**
> - Address filter fields accept any casing — `"0xAbCd..."` and `"0xabcd..."` both work
> - All `BigInt` values are returned as strings to avoid JavaScript integer overflow
> - `blockTimestamp` is a Unix timestamp in seconds
> - `subscriber` is a `bytes32` identity hash, not an address

---

## Data Model

Defined in `ponder.schema.ts`.

### `AssetEntity`
One row per deployed `Asset` contract.
- `id`: asset contract address (lowercased).
- `assetId`: bytes32 id in the registry.
- `registryAddress`: address of the `AssetRegistry` that created it.
- `owner`: current `Asset` owner (creator or transferee), always lowercased.

### `Subscription`
One row per `(asset, subscriber)` pair representing their **current contiguous active state**.
- `id`: `${assetAddress}_${subscriber}` (both lowercased).
- `assetId`: foreign key to `AssetEntity.id`.
- `user`: subscriber address (lowercased).
- `startTime`: start of the unbroken subscription block (BigInt).
- `endTime`: final expiry timestamp (BigInt).
- `nonce`: latest subscription iteration counter.
- `isActive`: false if revoked.

> When a user tops up an active subscription, the contract sets the new event's `startTime` equal to the old `endTime`. The indexer stitches these together so `Subscription` always reflects the continuous timeline, while the `Asset_SubscriptionAdded` log table tracks each iteration individually via nonces.

### Event log tables
Raw event history for debugging and analytics:
- `AssetRegistry_AssetCreated`
- `AssetRegistry_OwnershipTransferred`
- `AssetRegistry_RegistryFeeShareUpdated`
- `AssetRegistry_RegistryFeeClaimedBatch`
- `AssetRegistry_RegistryFeeClaimed`
- `Asset_SubscriptionAdded`
- `Asset_SubscriptionExtended`
- `Asset_SubscriptionPriceUpdated`
- `Asset_SubscriptionRevoked`
- `Asset_SubscriptionCancelled`
- `Asset_CreatorFeeClaimed`
- `Asset_OwnershipTransferred`

### `SubscriberClaimable`
One row per `(asset, subscriber)`. Denormalised state backing the `Asset.claimable(subscriber)` and `Asset.claimableTotal` GraphQL fields — see [Claimable Amounts](#claimable-amounts) below.

- `id`: `${chainId}_${assetAddress}_${subscriber}`.
- `creatorClaimedAtNonce` / `creatorClaimedAtTimestamp`: mirror the on-chain `creatorClaimedAtNonces[subscriber]` / `creatorClaimedAtTimestamps[subscriber]` pointers.
- `registryClaimedAtNonce` / `registryClaimedAtTimestamp`: same for the registry-side pointers.
- `creatorFee` / `registryFee`: accrued claimable amounts as of the last refresh.
- `refreshedAtBlock` / `refreshedAtTimestamp`: when the row was last brought up to date. Exposed as `asOfBlock` / `asOfTimestamp` in the GraphQL response so consumers can reason about freshness.

---

## Claimable Amounts

The `Asset.claimable(subscriber)` and `Asset.claimableTotal` GraphQL fields surface how much creator-side and registry-side fee is currently claimable on an asset. The math is a faithful TypeScript port of the contract's internal `_claimable()` ([Asset.sol](open-creator-rails/src/Asset.sol#L289)).

### Why a rollup table

Claimable amounts are a function of **`(subscription state, block.timestamp)`**. They grow over time even when no on-chain event fires — every period boundary that crosses adds newly-accrued fees to whichever side hasn't claimed past it.

That property rules out two simpler designs:

| Approach | Why it doesn't work |
|---|---|
| **Resolver-time compute** (math runs per GraphQL query, fetching subscriptions on demand) | Per-asset totals fan out to `O(N_subscribers)` round-trips per query. At 1000+ subscribers with remote-Postgres latency, response times measured in tens of seconds. Doesn't fit the indexer's "DB is the source of truth, queries are cheap" model. |
| **Store `creatorFee` / `registryFee` directly, updated only in event handlers** | Numbers correct only at event boundaries; stale between events. For the 1-second local seed periods the value is wrong on the next block. For monthly Sepolia periods the value drifts for up to 30 days after each period boundary that crosses without an event firing. |

The rollup approach splits the work:

1. **Event-driven** — every subscription/claim event handler upserts the row's pointers and recomputes fees against `event.block.timestamp`. Captures all state changes exactly at the event.
2. **Block-interval** — the `ClaimableRefresh` block source (declared in `ponder.config.ts`) fires a handler every N blocks that recomputes fees for every rollup row against the current block's timestamp. Catches the time-only updates that no event would trigger.

GraphQL reads become O(1) PK lookups (per-subscriber) or one aggregate query (per-asset total).

### Alternative design considered: cumulative totals

A natural-looking simplification is to store **lifetime accruals** instead of per-side pointers:

```
SubscriberClaimable {
  totalCreatorAccrued, totalRegistryAccrued,  // grow as periods elapse
  totalCreatorClaimed, totalRegistryClaimed,  // sum of past claim event amounts
}

claimable = totalAccrued - totalClaimed
```

This makes claim-event handlers trivial — `totalClaimed += event.args.amount`. No subscription fetch, no per-side guards, no pointer arithmetic.

It fails on fidelity due to **integer-division dust**. The contract truncates per claim:

```solidity
uint256 fee         = count * subscription.subscriptionPrice;
uint256 registryFee = (fee * subscription.registryFeeShare) / 100;   // truncated
```

Truncation happens once per claim call, so `sum over claims { floor(claim_periods × price × share / 100) }` is generally **less than** `floor(total_periods × price × share / 100)`.

Concrete example with `price = 10`, `share = 3`, `duration = 1`:

| Claim pattern | Periods per claim | Contract pays per claim | Total paid (10 periods) |
|---|---|---|---|
| 1 claim covering 10 periods | 10 | `floor(10·10·3/100) = 3` | 3 |
| 10 claims of 1 period each | 1 | `floor(1·10·3/100) = 0` | **0** |

Both subscribers accrued the same 10 periods, but the second receives nothing on-chain because each per-period claim rounds to zero.

The cumulative model's `totalAccrued` at 10 periods is `floor(10·10·3/100) = 3` in either pattern. So `claimable = totalAccrued − totalClaimed` would report **3** for the second subscriber, while the contract would pay them **0** on the next claim. The model **over-reports** by the per-claim dust accumulated over the subscription's lifetime — a UI built on it would tell users they can claim funds the contract refuses to release.

The pointer model avoids this because the pointer (`claimedAtTimestamp`) records exactly where the contract's last truncation cut off. `floor((now − pointer) / duration) × price × share / 100` therefore matches what the contract would pay if claimed at this moment.

**When does the dust actually matter?** Drift accumulates whenever `price × share / 100` is comparable to or smaller than `1` token. The current deployments span the spectrum:

- `share = 80, price = 18` (local seed): per-period contribution `(1·18·80)/100 = 14`. No truncation, no drift.
- `share = 30, price = 1` (Sepolia `asset_1`): per-period contribution `(1·1·30)/100 = 0`. High drift risk under frequent claims.
- `share = 30, price = 1_000_000` (Sepolia `asset_2`): per-period contribution `300_000`. Negligible drift.

The bottom line: the cumulative model is conceptually clean and would simplify the claim-event handler, but it can silently diverge from on-chain truth on low-share/low-price assets. The pointer model is more code but preserves contract fidelity for all parameter combinations.

A reasonable follow-up is **storing `totalCreatorClaimed` / `totalRegistryClaimed` as additional columns alongside the pointers**, populated incrementally by the claim event handlers. The pointer stays the source of truth for live claimable; the totals are bookkeeping for owner-facing "lifetime earned / claimed" dashboards. That hybrid avoids the fidelity issue and gives the simpler claim handler for free, but it's deferred until there's a consumer asking for those numbers.

### Refresh cost at scale

The block-interval refresh iterates every `SubscriberClaimable` row on the chain via keyset pagination (500 rows per page). Each row's refresh issues ~4 sequential queries: asset metadata, current pointer state, subscription nonces, upsert.

Approximate wall-clock per refresh fire (assuming ~10ms per round-trip on remote Postgres):

| Subscribers (chain-wide) | Avg nonces per subscriber | Sequential queries | Wall-clock |
|---|---|---|---|
| 100 | 5 | ~400 | ~4 s |
| 1,000 | 5 | ~4,000 | ~40 s |
| 10,000 | 10 | ~40,000 | ~100 s |

This work runs synchronously inside the indexing pipeline — on-chain events queue while the refresh is in flight. At the configured Sepolia interval (`7200` blocks ≈ 24h), even the 10k-subscriber case is a ~2-minute event-processing backlog once per day, which catches up within seconds afterward.

Local development uses `interval: 1` (refresh fires every block). This is only viable because the seed produces a handful of rollup rows; with realistic subscriber counts it would slow Anvil to a crawl.

### When to apply the next optimisation

The current implementation is correctness-first, not throughput-tuned. The fan-out point is in `refreshAllSubscriberClaimable` ([src/handlers/claimable.ts](src/handlers/claimable.ts)): each rollup row triggers its own 4-query refresh.

If subscriber counts grow past ~500 chain-wide and refresh lag becomes operationally visible.

### Staleness semantics

Every GraphQL response includes `asOfBlock` and `asOfTimestamp` fields reflecting when the underlying rollup row was last refreshed. Between refreshes, **on-chain claimable continues to grow** as periods elapse — the indexer's number is a lower bound on what the contract would actually pay out at chain head.

For UI use cases that need exact on-chain numbers (e.g. "Click to claim X tokens"), the consumer should either:
- Display `asOf*` alongside the number so users understand the staleness window, or
- Fall back to an RPC `eth_call` against the contract's claim function with state override at the moment of UI commitment.
