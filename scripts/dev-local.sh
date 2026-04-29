#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
SUBMODULE_DIR="$ROOT_DIR/open-creator-rails"

# Start Anvil in the background
echo "Starting Anvil..."
anvil &
ANVIL_PID=$!

# Seed local environment from the submodule (seed-local.sh polls until anvil is ready)
echo "Seeding local environment..."
cd "$SUBMODULE_DIR"
bash scripts/seed-local.sh

# Copy updated deployment addresses into the indexer's config
echo "Syncing deployment addresses..."
cp packages/config/src/deployments/registries_31337.json "$ROOT_DIR/config/deployments/registries_31337.json"
cp packages/config/src/deployments/token_addresses.json "$ROOT_DIR/config/deployments/token_addresses.json"

# Let Anvil settle the last seeded block before Ponder reads it
sleep 1

# Wipe Ponder's database so it re-indexes from block 0 against the fresh Anvil
rm -rf "$ROOT_DIR/.ponder/pglite"

# Start Ponder
echo "Starting Ponder indexer..."
cd "$ROOT_DIR"
PONDER_RPC_URL_31337=http://127.0.0.1:8545 pnpm dev &
PONDER_PID=$!

# Shut down cleanly on Ctrl+C
trap "kill $ANVIL_PID $PONDER_PID 2>/dev/null; exit 0" INT TERM
wait $PONDER_PID
