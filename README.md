# ocr-indexer

A [Ponder](https://ponder.sh) indexer for the OCR (Open Creator Rails) protocol. Indexes `AssetRegistry` and `Asset` contract events and exposes them over a REST/GraphQL API.

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
docker compose up --build        # start Postgres + worker + API
docker compose down              # stop
docker compose down -v           # stop and remove volumes (full reset)
```

Requires `PONDER_RPC_URL_11155111` to be set in your shell or in `.env`.

## Data Model

Defined in `ponder.schema.ts`.

### `AssetEntity`
One row per deployed `Asset` contract.

### `Subscription`
One row per `(asset, subscriber)` pair representing their **current contiguous active state**.

- `startTime`: start of the unbroken subscription block
- `endTime`: final expiry timestamp
- `nonce`: latest subscription iteration counter
- `isActive`: false if revoked

> When a user tops up an active subscription, the contract sets the new event's `startTime` equal to the old `endTime`. The indexer stitches these together so `Subscription` always reflects the continuous timeline, while the `Asset_SubscriptionAdded` log table tracks each iteration individually.

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

> **⚠️ Addresses are lowercased.** All address fields are stored in lowercase. Lowercase your address before querying:
> ```ts
> const address = walletAddress.toLowerCase();
> ```
