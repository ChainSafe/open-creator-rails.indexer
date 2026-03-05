## ocr-indexer GraphQL API (for builders)

This document describes how to query the HyperIndex GraphQL API exposed by this indexer.

- **GraphQL endpoint**: `http://localhost:8080`
- **Auth**: Basic auth, password `testing` (default Envio dev stack)

All examples assume you are using the GraphQL Playground or a GraphQL client that supports query variables.

### Conventions

- All **addresses** are stored and queried in **lowercase**.
- All `where` filters use comparison objects (`{ _eq: ... }`) as required by the schema.
- Timestamps are stored as `BigInt` values (seconds since epoch).

---

## Asset queries

### All assets

```graphql
query AllAssets {
  AssetEntity {
    id
    assetId
    registryAddress
    owner
  }
}
```

**Description:** List all indexed assets with their registry and current owner.

### Single asset by address

```graphql
query AssetById($assetAddress: String!) {
  AssetEntity_by_pk(id: $assetAddress) {
    id
    assetId
    registryAddress
    owner
  }
}
```

**Description:** Fetch one specific asset by its contract address (`id`).

**Example variables:**

```json
{
  "assetAddress": "0xasset_address_lowercased"
}
```

### Assets created by a specific registry

```graphql
query AssetsByRegistry($registry: String!) {
  AssetEntity(where: { registryAddress: { _eq: $registry } }) {
    id
    assetId
    owner
  }
}
```

**Description:** List all assets whose `registryAddress` matches the given registry.

**Example variables:**

```json
{
  "registry": "0xregistry_address_lowercased"
}
```

### Assets owned by a user

```graphql
query AssetsOwnedByUser($owner: String!) {
  AssetEntity(where: { owner: { _eq: $owner } }) {
    id
    assetId
    registryAddress
  }
}
```

**Description:** List all assets where the current owner matches the given address.

**Example variables:**

```json
{
  "owner": "0xowner_address_lowercased"
}
```

---

## Subscription queries

### All active subscriptions for a user

```graphql
query ActiveSubscriptionsForUser($user: String!) {
  Subscription(
    where: {
      user: { _eq: $user }
      isActive: { _eq: true }
    }
  ) {
    id
    asset_id
    user
    expiresAt
    isActive
  }
}
```

**Description:** Return all active subscriptions for a given user across all assets.

**Example variables:**

```json
{
  "user": "0xuser_address_lowercased"
}
```

### All active subscribers for a given asset

```graphql
query ActiveSubscribersForAsset($assetAddress: String!) {
  Subscription(
    where: {
      asset_id: { _eq: $assetAddress }
      isActive: { _eq: true }
    }
  ) {
    id
    user
    expiresAt
  }
}
```

**Description:** List all users that currently have an active subscription to a given asset.

**Example variables:**

```json
{
  "assetAddress": "0xasset_address_lowercased"
}
```

### Check if a user is currently subscribed to a specific asset

```graphql
query UserSubscriptionForAsset($assetAddress: String!, $user: String!) {
  Subscription(
    where: {
      asset_id: { _eq: $assetAddress }
      user: { _eq: $user }
      isActive: { _eq: true }
    }
  ) {
    id
    asset_id
    user
    expiresAt
    isActive
  }
}
```

**Description:** Returns the active subscription row (if any) for a `(user, asset)` pair.

**Example variables:**

```json
{
  "assetAddress": "0xasset_address_lowercased",
  "user": "0xuser_address_lowercased"
}
```

### Unique assets a user is actively subscribed to

```graphql
query UniqueAssetsUserIsSubscribedTo($user: String!) {
  Subscription(
    distinct_on: asset_id
    where: {
      user: { _eq: $user }
      isActive: { _eq: true }
    }
  ) {
    asset_id
  }
}
```

**Description:** Returns each `asset_id` once, giving the set of assets where the user has at least one active subscription.

**Example variables:**

```json
{
  "user": "0xuser_address_lowercased"
}
```

### Paginated active subscribers for an asset

```graphql
query PaginatedSubscribersForAsset(
  $assetAddress: String!
  $limit: Int!
  $offset: Int!
) {
  Subscription(
    where: {
      asset_id: { _eq: $assetAddress }
      isActive: { _eq: true }
    }
    order_by: { user: asc }
    limit: $limit
    offset: $offset
  ) {
    id
    user
    expiresAt
  }
}
```

**Description:** Fetch active subscribers for an asset in pages suitable for UIs (e.g., infinite scroll).

**Example variables:**

```json
{
  "assetAddress": "0xasset_address_lowercased",
  "limit": 20,
  "offset": 0
}
```

---

## Event history queries

These entities mirror contract events and are useful for analytics and debugging.

### Asset creation events

```graphql
query AssetCreatedEvents {
  AssetContract_AssetCreated(order_by: { id: asc }) {
    id
    assetId
    asset
    subscriptionPrice
    tokenAddress
    owner
  }
}
```

### Subscription lifecycle events for an asset

```graphql
query SubscriptionEventsForAsset($assetAddress: String!) {
  Asset_SubscriptionAdded(
    where: { id: { _like: $assetPrefix } }
  ) {
    id
    user
    expiresAt
  }
  Asset_SubscriptionRevoked(
    where: { id: { _like: $assetPrefix } }
  ) {
    id
    user
  }
  Asset_SubscriptionPriceUpdated {
    id
    newSubscriptionPrice
  }
}
```

**Description:** Inspect all subscription add/revoke/price‑update events related to a given asset.  
**Note:** Here `id` is formatted as `${chainId}_${blockNumber}_${logIndex}`; if you prefer, add a dedicated `asset` field to the event entities in the schema and filter on that instead.

