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

The indexer exposes two endpoints:

| Endpoint | Description |
|---|---|
| `GET /` | GraphQL playground (browser UI) |
| `POST /graphql` | GraphQL API |
| `GET /sql/*` | Direct SQL queries via Ponder's SQL endpoint |
| `GET /ready` | Health check — returns `200` when live |

### GraphQL

Open the playground at `http://localhost:42069` after starting the indexer.

Ponder generates a singular (fetch by ID) and plural (list) field for each table:

| Singular | Plural | Description |
|---|---|---|
| `assetEntity` | `assetEntitys` | Asset contract state |
| `subscription` | `subscriptions` | Subscription state per asset–subscriber |
| `assetRegistry_AssetCreated` | `assetRegistry_AssetCreateds` | Asset creation events |
| `assetRegistry_RegistryFeeShareUpdated` | `assetRegistry_RegistryFeeShareUpdateds` | Registry fee share updates |
| `assetRegistry_RegistryFeeClaimedBatch` | `assetRegistry_RegistryFeeClaimedBatchs` | Registry fee claim batches |
| `asset_SubscriptionAdded` | `asset_SubscriptionAddeds` | New subscription events |
| `asset_SubscriptionExtended` | `asset_SubscriptionExtendeds` | Subscription extension events |
| `asset_SubscriptionRevoked` | `asset_SubscriptionRevokeds` | Subscription revocation events |
| `asset_SubscriptionCancelled` | `asset_SubscriptionCancelleds` | Subscription cancellation events |
| `asset_SubscriptionPriceUpdated` | `asset_SubscriptionPriceUpdateds` | Price update events |
| `asset_CreatorFeeClaimed` | `asset_CreatorFeeClaimeds` | Creator fee claim events |
| `asset_OwnershipTransferred` | `asset_OwnershipTransferreds` | Asset ownership transfer events |

> **⚠️ Addresses are lowercased.** All address fields are stored in lowercase. Lowercase your address before querying:
> ```ts
> const address = walletAddress.toLowerCase();
> ```

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

**Check active subscriptions for a subscriber:**
```graphql
{
  subscriptions(where: { subscriber: "0x...", isActive: true }) {
    items {
      assetId
      startTime
      endTime
      payer
    }
  }
}
```

**Pagination:**
```graphql
{
  subscriptions(limit: 20, after: "cursor_from_previous_response") {
    items { ... }
    pageInfo {
      hasNextPage
      endCursor
    }
  }
}
```

### SQL

```bash
curl "http://localhost:42069/sql/SELECT%20*%20FROM%20ocr_indexer.subscription%20WHERE%20is_active%20%3D%20true%20LIMIT%2010"
```

Table names are the snake_case equivalents of the schema (e.g. `ocr_indexer.asset_entity`, `ocr_indexer.subscription`).

> **Notes:**
> - All `BigInt` values are returned as strings to avoid JavaScript integer overflow
> - All addresses are lowercase hex strings
> - `blockTimestamp` is a Unix timestamp in seconds

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
- `Asset_SubscriptionAdded`
- `Asset_SubscriptionExtended`
- `Asset_SubscriptionPriceUpdated`
- `Asset_SubscriptionRevoked`
- `Asset_SubscriptionCancelled`
- `Asset_CreatorFeeClaimed`
- `Asset_OwnershipTransferred`
