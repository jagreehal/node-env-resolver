# Changelog

## 1.1.0

### Minor Changes

- b4afee9: Add safeResolve API and environment variable name validation

  **New Features:**
  - Add `safeResolve()` and `safeResolveSync()` functions with Zod-like API pattern
    - Returns `{ success: true, data }` on success instead of throwing
    - Returns `{ success: false, error }` on validation failure
    - Includes `.with()` methods for multiple resolvers
    - No try/catch needed, safer error handling
  - Add environment variable name validation
    - Validates names follow standard conventions (uppercase letters, numbers, underscores)
    - Rejects invalid names like `PORxxxT`, `port`, `123PORT`, `PORT-NAME` with clear error messages
    - Validates early before resolution begins
  - Add cache hit/miss tracking in audit logs
    - `metadata.cached: false` for cache misses (fresh data fetched)
    - `metadata.cached: true` for cache hits (served from cache)
    - Helps monitor cache effectiveness and debug performance

  **Improvements:**
  - Fix `cached()` wrapper to preserve underlying resolver name in audit logs
    - Now shows `cached(aws-secrets)` instead of `cached(custom-key)`
    - Makes audit logs more informative about data sources

## 1.0.0

### Major Changes

- 5c05090: Initial release version 1.0.0
  - node-env-resolver: Core environment variable resolver with async resolvers
  - node-env-resolver/nextjs: Zero-config Next.js integration with client/server split
  - node-env-resolver/aws: AWS resolvers for Secrets Manager and SSM Parameter Store
  - node-env-resolver/config: Shared TypeScript and ESLint configurations

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Initial release of node-env-resolver
- Type-safe environment variable resolution
- Support for multiple resolvers (process.env, dotenv, AWS SSM, etc.)
- Builder API for simple configuration
- Zod integration for schema validation
- Standard Schema integration
- Web environment support
- Comprehensive test suite
- Full TypeScript support

### Changed

- N/A

### Deprecated

- N/A

### Removed

- N/A

### Fixed

- N/A

### Security

- N/A
