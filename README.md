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

### RPC transport (HTTP and WebSocket)

Ponder accepts both HTTP(S) and WebSocket RPC URLs in `PONDER_RPC_URL_<chainId>`.

- HTTP: `https://...` or `http://...`
- WebSocket: `wss://...` or `ws://...`

Examples:

```dotenv
# Local Anvil
PONDER_RPC_URL_31337=ws://127.0.0.1:8545

# Hosted Sepolia
PONDER_RPC_URL_11155111=wss://eth-sepolia.g.alchemy.com/v2/<KEY>
# or
# PONDER_RPC_URL_11155111=wss://sepolia.infura.io/ws/v3/<KEY>
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
| `PONDER_RPC_URL_31337` | Local (Anvil) | Local RPC URL (`ws://127.0.0.1:8545` or `http://127.0.0.1:8545`). |
| `PONDER_RPC_URL_11155111` | Sepolia | Sepolia RPC URL (`wss://...` or `https://...`). |
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
- `Asset_SubscriptionAdded`
- `Asset_SubscriptionExtended`
- `Asset_SubscriptionPriceUpdated`
- `Asset_SubscriptionRevoked`
- `Asset_SubscriptionCancelled`
- `Asset_CreatorFeeClaimed`
- `Asset_OwnershipTransferred`
