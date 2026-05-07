#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
INDEXER_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
RAILS_DIR="$INDEXER_ROOT/open-creator-rails"

export RPC_URL="http://127.0.0.1:8545"
export PRIVATE_KEY="0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"

DEPLOYER_ADDR="0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"
SUB1_PK="0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d"
SUB2_PK="0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a"
SUB1_ADDR="0x70997970C51812dc3A010C7d01b50e0d17dc79C8"
SUB2_ADDR="0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC"
SUB1_HASH=$(cast keccak "$SUB1_ADDR")
SUB2_HASH=$(cast keccak "$SUB2_ADDR")

cd "$RAILS_DIR"

# ── Base deployment ────────────────────────────────────────────────────────────

echo "Waiting for Anvil..."
while ! cast chain-id --rpc-url $RPC_URL > /dev/null 2>&1; do sleep 1; done
echo "Anvil is up!"

# Clear stale deployment JSON from previous runs so entries don't accumulate
echo '[]' > packages/config/src/deployments/registries_31337.json
echo '{}' > packages/config/src/deployments/token_addresses.json

echo "1. Deploying Test Token..."
./scripts/deployTestToken.sh

echo "2. Deploying Registry (80% Creator / 20% Registry)..."
./scripts/deployRegistry.sh 80 20

TOKEN_ADDR=$(jq -r '.["31337"]' packages/config/src/deployments/token_addresses.json)
REGISTRY_ADDR=$(jq -r '.[0].address' packages/config/src/deployments/registries_31337.json)

echo "3. Creating Assets..."
for i in {1..8}; do
  price=$((i * 2))
  ./scripts/createAsset.sh 0 "local_asset_$i" $price $TOKEN_ADDR $DEPLOYER_ADDR > /dev/null
  echo "  local_asset_$i (price: $price tokens/sec)"
done

echo "4. Minting tokens to subscribers..."
./scripts/mintTestToken.sh $SUB1_ADDR 50000000000000000000000 > /dev/null
./scripts/mintTestToken.sh $SUB2_ADDR 50000000000000000000000 > /dev/null

# Helper to look up deployed asset address by human-readable ID
asset_addr() {
  local id_hash
  id_hash=$(cast keccak "$1")
  jq -r --arg h "$id_hash" 'first(.[0].assets[] | select(.assetIdHash == $h) | .address)' \
    packages/config/src/deployments/registries_31337.json
}

# ── Scenario: Active subscriptions ────────────────────────────────────────────
echo ""
echo "=== Scenario: Active Subscriptions ==="

echo "  Sub1 -> asset_1 (1h)"
./scripts/subscribe.sh 0 "local_asset_1" $SUB1_ADDR 3600 $SUB1_PK > /dev/null
echo "  Sub2 -> asset_1 (2h)"
./scripts/subscribe.sh 0 "local_asset_1" $SUB2_ADDR 7200 $SUB2_PK > /dev/null
echo "  Sub1 top-up -> asset_1 (+1h, same terms -> SubscriptionExtended)"
./scripts/subscribe.sh 0 "local_asset_1" $SUB1_ADDR 3600 $SUB1_PK > /dev/null

# ── Scenario: Revoked subscription ────────────────────────────────────────────
echo ""
echo "=== Scenario: Revoke ==="

echo "  Sub1 -> asset_2 (1h)"
./scripts/subscribe.sh 0 "local_asset_2" $SUB1_ADDR 3600 $SUB1_PK > /dev/null
ASSET2_ADDR=$(asset_addr "local_asset_2")
cast send $ASSET2_ADDR "revokeSubscription(bytes32)" $SUB1_HASH \
  --rpc-url $RPC_URL --private-key $PRIVATE_KEY > /dev/null
echo "  Asset owner revoked Sub1 from asset_2 (isRevoked=true)"

# ── Scenario: Cancelled subscription ──────────────────────────────────────────
echo ""
echo "=== Scenario: Cancel ==="

echo "  Sub2 -> asset_2 (1h)"
./scripts/subscribe.sh 0 "local_asset_2" $SUB2_ADDR 3600 $SUB2_PK > /dev/null
cast send $REGISTRY_ADDR "cancelSubscription(bytes32,bytes32)" \
  "$(cast keccak "local_asset_2")" $SUB2_HASH \
  --rpc-url $RPC_URL --private-key $PRIVATE_KEY > /dev/null
echo "  Registry cancelled Sub2 from asset_2 (isRevoked=false, endTime truncated)"

# ── Scenario: Re-subscribe after cancel ───────────────────────────────────────
echo ""
echo "=== Scenario: Re-subscribe After Cancel (nonce reuse) ==="

echo "  Sub1 -> asset_3 (30m)"
./scripts/subscribe.sh 0 "local_asset_3" $SUB1_ADDR 1800 $SUB1_PK > /dev/null
cast send $REGISTRY_ADDR "cancelSubscription(bytes32,bytes32)" \
  "$(cast keccak "local_asset_3")" $SUB1_HASH \
  --rpc-url $RPC_URL --private-key $PRIVATE_KEY > /dev/null
echo "  Cancelled, re-subscribing (contract reuses nonce 0)..."
./scripts/subscribe.sh 0 "local_asset_3" $SUB1_ADDR 3600 $SUB1_PK > /dev/null
echo "  Sub1 re-subscribed to asset_3"

# ── Scenario: Price change → new nonce ────────────────────────────────────────
echo ""
echo "=== Scenario: Price Change (new nonce) ==="

echo "  Sub1 -> asset_4 (1h) at original price"
./scripts/subscribe.sh 0 "local_asset_4" $SUB1_ADDR 3600 $SUB1_PK > /dev/null
./scripts/setSubscriptionPrice.sh 0 "local_asset_4" 99 $PRIVATE_KEY > /dev/null
echo "  Price updated to 99 — next subscribe chains a new nonce"
./scripts/subscribe.sh 0 "local_asset_4" $SUB1_ADDR 3600 $SUB1_PK > /dev/null
echo "  Sub1 re-subscribed to asset_4 (nonce 1)"

# ── Scenario: Future subscription then revoke ─────────────────────────────────
echo ""
echo "=== Scenario: Future Subscription Revoked ==="

echo "  Sub1 -> asset_5 (1h, nonce 0 active)"
./scripts/subscribe.sh 0 "local_asset_5" $SUB1_ADDR 3600 $SUB1_PK > /dev/null
./scripts/setSubscriptionPrice.sh 0 "local_asset_5" 50 $PRIVATE_KEY > /dev/null
echo "  Sub1 -> asset_5 again (nonce 1 future, chains after nonce 0)"
./scripts/subscribe.sh 0 "local_asset_5" $SUB1_ADDR 3600 $SUB1_PK > /dev/null
ASSET5_ADDR=$(asset_addr "local_asset_5")
cast send $ASSET5_ADDR "revokeSubscription(bytes32)" $SUB1_HASH \
  --rpc-url $RPC_URL --private-key $PRIVATE_KEY > /dev/null
echo "  Revoked (nonce 0 truncated + isRevoked=true; nonce 1 deleted from DB)"

# ── Scenario: Future subscription then cancel ─────────────────────────────────
echo ""
echo "=== Scenario: Future Subscription Cancelled ==="

echo "  Sub2 -> asset_6 (1h, nonce 0 active)"
./scripts/subscribe.sh 0 "local_asset_6" $SUB2_ADDR 3600 $SUB2_PK > /dev/null
./scripts/setSubscriptionPrice.sh 0 "local_asset_6" 50 $PRIVATE_KEY > /dev/null
echo "  Sub2 -> asset_6 again (nonce 1 future, chains after nonce 0)"
./scripts/subscribe.sh 0 "local_asset_6" $SUB2_ADDR 3600 $SUB2_PK > /dev/null
cast send $REGISTRY_ADDR "cancelSubscription(bytes32,bytes32)" \
  "$(cast keccak "local_asset_6")" $SUB2_HASH \
  --rpc-url $RPC_URL --private-key $PRIVATE_KEY > /dev/null
echo "  Cancelled (nonce 0 truncated, isRevoked=false; nonce 1 deleted from DB)"

# ── Scenario: Active + future cancel then re-subscribe ────────────────────────
echo ""
echo "=== Scenario: Active + Future Cancel then Re-subscribe ==="

# nonce 0: active
echo "  Sub1 -> asset_7 (1h, nonce 0 active)"
./scripts/subscribe.sh 0 "local_asset_7" $SUB1_ADDR 3600 $SUB1_PK > /dev/null
# price change forces a new nonce on the next subscribe
./scripts/setSubscriptionPrice.sh 0 "local_asset_7" 50 $PRIVATE_KEY > /dev/null
# nonce 1: future (chains after nonce 0's endTime)
echo "  Sub1 -> asset_7 again (nonce 1 future)"
./scripts/subscribe.sh 0 "local_asset_7" $SUB1_ADDR 3600 $SUB1_PK > /dev/null
# cancel: nonce 0 truncated + nonces[sub] decremented back to 0; nonce 1 deleted from DB
cast send $REGISTRY_ADDR "cancelSubscription(bytes32,bytes32)" \
  "$(cast keccak "local_asset_7")" $SUB1_HASH \
  --rpc-url $RPC_URL --private-key $PRIVATE_KEY > /dev/null
echo "  Cancelled — nonce 0 truncated, nonce 1 deleted, on-chain nonces[sub]=0"
# re-subscribe: contract finds sub still in subscribers set, reads nonce 0's truncated endTime,
# startTime=now != truncated endTime so increments → nonce 1 again; SubscriptionAdded(nonce=1)
echo "  Re-subscribing (contract emits SubscriptionAdded nonce=1)..."
./scripts/subscribe.sh 0 "local_asset_7" $SUB1_ADDR 3600 $SUB1_PK > /dev/null
echo "  Sub1 re-subscribed to asset_7 (nonce 1 cleanly re-inserted in DB)"

echo ""
echo "Local seeding complete!"
echo "  - asset_1: 2 active subscribers, Sub1 extended"
echo "  - asset_2: Sub1 revoked, Sub2 cancelled"
echo "  - asset_3: Sub1 cancelled then re-subscribed (nonce reuse)"
echo "  - asset_4: Sub1 with price-change nonce chain"
echo "  - asset_5: Sub1 revoked with a future nonce deleted"
echo "  - asset_6: Sub2 cancelled with a future nonce deleted"
echo "  - asset_7: Sub1 active+future cancelled then re-subscribed (nonce 1 re-inserted)"
