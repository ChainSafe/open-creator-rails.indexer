# Changelog

## [0.9.0](https://github.com/ChainSafe/open-creator-rails.indexer/compare/v0.8.0...v0.9.0) (2026-06-01)


### Features

* activate Base Sepolia (84532) chain indexing ([#82](https://github.com/ChainSafe/open-creator-rails.indexer/issues/82)) ([775dd52](https://github.com/ChainSafe/open-creator-rails.indexer/commit/775dd52d5b8f64d5d88a5e5c6455739e4c591e27))

## [0.8.0](https://github.com/ChainSafe/open-creator-rails.indexer/compare/v0.7.0...v0.8.0) (2026-05-21)


### Features

* **api:** add Asset.expiringSubscriptions(within) query ([#66](https://github.com/ChainSafe/open-creator-rails.indexer/issues/66)) ([1b37e91](https://github.com/ChainSafe/open-creator-rails.indexer/commit/1b37e91b346966be2e7e1cf578be1629b395397e))
* **api:** add root Query.expiringSubscriptions(within) ([#68](https://github.com/ChainSafe/open-creator-rails.indexer/issues/68)) ([a5a587a](https://github.com/ChainSafe/open-creator-rails.indexer/commit/a5a587a8996c0b9dd80ef8672bfa3f0e2543037f))
* **test:** add vitest e2e harness for indexer + /v2/graphql ([#60](https://github.com/ChainSafe/open-creator-rails.indexer/issues/60)) ([541ca15](https://github.com/ChainSafe/open-creator-rails.indexer/commit/541ca155ba987956ea45c5f1a33bc61dedc8db03))

## [0.7.0](https://github.com/ChainSafe/open-creator-rails.indexer/compare/v0.6.0...v0.7.0) (2026-05-19)


### Features

* **api:** add custom GraphQL v2 endpoint at /v2/graphql ([#34](https://github.com/ChainSafe/open-creator-rails.indexer/issues/34)) ([9d3a31a](https://github.com/ChainSafe/open-creator-rails.indexer/commit/9d3a31a45938cef13045a2f7ab22a18f937ae668))
* **indexer:** add RegistryEntity and split handlers into separate files ([#22](https://github.com/ChainSafe/open-creator-rails.indexer/issues/22)) ([62b6cad](https://github.com/ChainSafe/open-creator-rails.indexer/commit/62b6cade88aecf0575dfbd29203f4ffceaec15bd))
* **indexer:** claimable amount query with rollup ([#52](https://github.com/ChainSafe/open-creator-rails.indexer/issues/52)) ([825cb9b](https://github.com/ChainSafe/open-creator-rails.indexer/commit/825cb9b9a6b04e714d5dfada6ab356932e2924ea))
* **indexer:** index claimedAtTimestamp/Nonce on claimed events ([#45](https://github.com/ChainSafe/open-creator-rails.indexer/issues/45)) ([#49](https://github.com/ChainSafe/open-creator-rails.indexer/issues/49)) ([e77eac5](https://github.com/ChainSafe/open-creator-rails.indexer/commit/e77eac5a08adf03d9e65d2b70c4643046daa8280))
* **indexer:** per-nonce subscriptions, active query, GraphQL type renames [WIP] ([#37](https://github.com/ChainSafe/open-creator-rails.indexer/issues/37)) ([47c40e4](https://github.com/ChainSafe/open-creator-rails.indexer/commit/47c40e4f4d64900d638ff5784b2bd75302c7b0e5))
* ponder indexer implementation ([#8](https://github.com/ChainSafe/open-creator-rails.indexer/issues/8)) ([5ec449c](https://github.com/ChainSafe/open-creator-rails.indexer/commit/5ec449c4af1027f6898f391b2058576d1ab2d09b))
* port latest ponder index from monorepo ([#12](https://github.com/ChainSafe/open-creator-rails.indexer/issues/12)) ([e42c4ff](https://github.com/ChainSafe/open-creator-rails.indexer/commit/e42c4ffefd0908297ff923a6cf7501430f1c533e))


### Bug Fixes

* **ci:** remove submodule checkout from deploy workflow ([#21](https://github.com/ChainSafe/open-creator-rails.indexer/issues/21)) ([e3cdccd](https://github.com/ChainSafe/open-creator-rails.indexer/commit/e3cdccdfc1fbac6ee60069e0d56d7413327d4e88))
* lock file ([#25](https://github.com/ChainSafe/open-creator-rails.indexer/issues/25)) ([900914e](https://github.com/ChainSafe/open-creator-rails.indexer/commit/900914e2f32cb059ff456310f5a6eb739e954511))
