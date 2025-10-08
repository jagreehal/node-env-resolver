# Changelog

## 2.0.0

### Major Changes

- aa920f4: # Major API Redesign: Synchronous-First, Simplified API

  This is a major breaking release that simplifies the API and makes synchronous resolution the default behavior.

  ## Breaking Changes

  ### `resolve()` is now synchronous by default

  Previously `resolve()` was async and returned a Promise. It's now synchronous and returns the config directly:

  ```ts
  // ❌ Old (async)
  const config = await resolve({ PORT: 3000 });

  // ✅ New (sync)
  const config = resolve({ PORT: 3000 });
  ```

  ### `resolveSync()` removed - use `resolve()` instead

  The separate `resolveSync()` function has been removed since `resolve()` is now synchronous by default:

  ```ts
  // ❌ Old
  import { resolveSync } from 'node-env-resolver';
  const config = resolveSync({ PORT: 3000 });

  // ✅ New
  import { resolve } from 'node-env-resolver';
  const config = resolve({ PORT: 3000 });
  ```

  ### `resolve.with()` now uses tuple syntax

  Custom providers are now specified using a cleaner tuple syntax instead of options:

  ```ts
  // ❌ Old
  await resolve(schema, {
    resolvers: [customProvider()],
  });

  // ✅ New
  await resolve.with([customProvider(), schema]);
  ```

  Multiple providers can be chained:

  ```ts
  await resolve.with(
    [awsSsm(), schema1],
    [processEnv(), schema2],
    { policies: { ... } }  // options last
  );
  ```

  ### `safeResolve()` is now synchronous by default

  Like `resolve()`, `safeResolve()` is now synchronous:

  ```ts
  // ❌ Old (async)
  const result = await safeResolve({ PORT: 3000 });

  // ✅ New (sync)
  const result = safeResolve({ PORT: 3000 });
  ```

  ### Next.js resolver simplified

  The Next.js resolver now uses the synchronous `resolve()`:

  ```ts
  // Internal change - your code doesn't need to change
  // but the resolver is now fully synchronous
  import { resolve } from 'node-env-resolver-nextjs';
  const env = resolve({ server: { ... }, client: { ... } });
  ```

  ### AWS package API updated

  The AWS convenience functions now use the new `resolve.with()` API internally:

  ```ts
  // Your code doesn't need to change, but the implementation
  // now uses the cleaner tuple syntax internally
  const config = await resolveSsm({ APP_NAME: 'string' });
  const config = await resolveSecrets({ API_KEY: 'string' });
  ```

  ### Standard Schema moved to dev dependencies

  The `@standard-schema/spec` package is now a dev dependency instead of a production dependency, reducing bundle size for users who don't use Standard Schema validators.

  ## New Features (from previous release)
  - Added `safeResolve()` and `safeResolveSync()` for non-throwing error handling
  - Support for custom async providers via `resolve.with()`
  - Improved error messages with actionable hints
  - Enhanced type safety throughout the API

  ## Migration Guide
  1. **Simple schemas**: Remove `await` from `resolve()` calls
  2. **Custom providers**: Change from `resolve(schema, { resolvers: [...] })` to `resolve.with([provider(), schema])`
  3. **Next.js**: Change imports from `resolveSync` to `resolve`
  4. **AWS**: Update to latest version - API is compatible but implementation improved

  ## Why This Change?
  - **Simpler mental model**: Most environment resolution is synchronous (process.env, .env files)
  - **Better performance**: No unnecessary Promises for sync operations
  - **Cleaner syntax**: Tuple syntax is more intuitive than nested options
  - **Explicit async**: When you need async providers, use `resolve.with()` - the async nature is clear from the API

  ## Documentation
  - Completely rewritten README with examples for all use cases
  - New migration guides and examples
  - Improved error messages throughout

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
