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

## Releases

Releases are automated via [release-please](https://github.com/googleapis/release-please) using [Conventional Commits](https://www.conventionalcommits.org/).

**How it works:**

1. Every push to `master` triggers `.github/workflows/release-please.yml`.
2. The action maintains a rolling "release PR" titled `chore: release X.Y.Z` that accumulates the changelog from `feat:` / `fix:` / `chore:` commits since the last release.
3. Merging that PR creates a tag (`vX.Y.Z`), generates `CHANGELOG.md`, and creates a GitHub Release.

**Commit convention** (drives version bumps + changelog):

| Prefix | Bump (pre-1.0) | Example |
|---|---|---|
| `feat:` / `feat(scope):` | minor | `feat(indexer): index new claimed event fields` |
| `fix:` / `fix(scope):` | patch | `fix(handlers): correct revoke truncation` |
| `chore:` / `docs:` / `refactor:` / `ci:` | no version bump, still in changelog | `chore(deps): bump viem from 2.48.4 to 2.48.8` |
| `feat!:` or `BREAKING CHANGE:` footer | minor while pre-1.0 (would be major post-1.0) | `feat!: rename Asset.claimable → Asset.claimablePerSubscriber` |

> The repo is still at `0.x`. release-please's `bump-minor-pre-major` keeps `feat:` bumping the minor digit (instead of major) until you set `1.0.0` in `.release-please-manifest.json`.

**Releasing = deploying.** `deploy-indexer.yml` triggers on `push: tags: ['v*']`, so merging a release-please PR also deploys to Railway. Treat the release PR as the explicit "ship to prod" button.

**One-time setup — `RELEASE_PLEASE_TOKEN` secret.** Tags created by GitHub Actions using the default `GITHUB_TOKEN` don't cascade to other tag-triggered workflows (GitHub blocks this to prevent loops). Without a PAT, release-please will tag the commit but `deploy-indexer.yml` won't fire — you'd need to manually `workflow_dispatch` the deploy.

To make auto-deploy work end-to-end:

1. Create a fine-grained PAT scoped to this repo with:
   - **Contents**: Read & write
   - **Pull requests**: Read & write
2. Add it to repo secrets as `RELEASE_PLEASE_TOKEN`.

The workflow falls back to `GITHUB_TOKEN` if the secret is unset, so it works either way — the secret only controls whether the deploy auto-triggers.

**Hotfix release.** Land the `fix:` commit on `master` like any other commit. release-please will update its release PR with a patch-bump candidate; merge it to ship.

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

The v2 endpoint at `/v2/graphql` is the recommended API. See [**queries.md**](queries.md) for the full query list, filter semantics, and example payloads.

---

## Data Model

The indexer's schema is defined in [`ponder.schema.ts`](ponder.schema.ts). See [**data-model.md**](data-model.md) for entity-by-entity field definitions and lifecycle notes.

---

## Architecture

For non-obvious design decisions and the rationale behind them, see [**architecture.md**](architecture.md).
