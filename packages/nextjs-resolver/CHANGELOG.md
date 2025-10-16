# Changelog

## 7.0.0

### Major Changes

- 0678bb0: # Breaking Changes: Validator Functions Moved to Separate Module

  This release introduces a breaking change to improve code organization and tree-shaking capabilities.

  ## What Changed

  ### Validator Functions Moved
  - **Before**: All validator functions (e.g., `string`, `number`, `url`, `postgres`) were exported from `'node-env-resolver/resolvers'`
  - **After**: Validator functions are now exported from `'node-env-resolver/validators'`

  ### Function Rename
  - `enums()` function has been renamed to `oneOf()` for better clarity

  ## Migration Guide

  ### Update Import Statements

  **Before:**

  ```typescript
  import { string, number, url, postgres, enums } from 'node-env-resolver/resolvers';
  ```

  **After:**

  ```typescript
  import { string, number, url, postgres, oneOf } from 'node-env-resolver/validators';
  ```

  ### Update Function Calls

  **Before:**

  ```typescript
  const config = {
    ENV: enums(['development', 'production', 'test']),
    API_URL: url(),
  };
  ```

  **After:**

  ```typescript
  const config = {
    ENV: oneOf(['development', 'production', 'test']),
    API_URL: url(),
  };
  ```

  ## Benefits
  - **Better Tree Shaking**: Validators can be imported separately from resolvers
  - **Clearer Separation**: Resolvers (data sources) vs Validators (validation logic)
  - **Improved Bundle Size**: Only import the validators you need
  - **Better Developer Experience**: More intuitive function naming

  ## Resolver Functions Unchanged

  Resolver functions remain in `'node-env-resolver/resolvers'`:

  ```typescript
  import { dotenv, processEnv, http, json } from 'node-env-resolver/resolvers';
  ```

### Patch Changes

- Updated dependencies [0678bb0]
  - node-env-resolver@6.0.0

## 6.0.1

### Patch Changes

- 3147202: ## Updated API Documentation

  ### 📚 README.md Overhaul
  - **Removed migration guide** - No users yet, so removed v1 to v2 migration section
  - **Updated all code examples** - Converted from tuple-based to object-based API syntax
  - **Fixed package references** - Removed non-existent packages (`node-env-resolver-integrations`, `gcpSecrets`, `vaultSecrets`)
  - **Added CLI documentation** - Properly documented the existing CLI functionality
  - **Restored TTL caching docs** - Added comprehensive caching documentation with examples

  ### 🔧 API Examples Updated
  - All `resolveAsync()` calls now use `{ resolvers: [...], options: {...} }` syntax
  - All `resolve()` calls with custom resolvers use object-based config
  - Fixed AWS package examples to use correct exports (`awsSecrets`, `awsSsm`)
  - Updated framework examples (Express, Next.js, AWS Lambda)
  - Corrected security policies and audit logging examples

  ### ✅ Fact-Checked Content
  - Verified all package imports point to existing packages
  - Confirmed all function signatures match current implementation
  - Validated all resolver exports are correct
  - Ensured all examples are runnable with current codebase

  ### 🚀 New Features Documented
  - **CLI argument parsing** - `import { cliArgs } from 'node-env-resolver/cli'`
  - **TTL caching** - `import { cached, TTL } from 'node-env-resolver/utils'`
  - **Advanced caching options** - Stale-while-revalidate, error resilience
  - **Cache monitoring** - Audit logs with cache metadata

  All documentation is now factually accurate and all examples should work with the current codebase.

- Updated dependencies [3147202]
  - node-env-resolver@5.0.1

## 6.0.0

### Major Changes

- c119292: ## 🚀 Major Release: Generic Type System & Bundle Optimization

  ### ✨ New Features

  #### **Unlimited Resolver Tuples Support**
  - **BREAKING**: New generic type system supports unlimited resolver tuples in `resolveAsync()`, `resolve()`, and safe variants
  - No more fixed limits of 3-4 resolvers - use as many as needed!
  - Improved type inference with proper schema merging from multiple resolvers

  #### **New Vite Integration Package**
  - **NEW**: `node-env-resolver-vite` package for seamless Vite integration
  - Vite plugin for environment variable validation during build
  - Type-safe environment variables in Vite applications

  ### 🔧 Improvements

  #### **Bundle Size Optimization**
  - **51% smaller main bundle**: Reduced from 32KB to 15.60KB
  - **45% smaller gzipped**: Reduced from 7.80KB to 4.31KB
  - Moved `processEnv` into main index to avoid importing heavy resolvers
  - Inlined `file` function to prevent pulling in entire validators module
  - Perfect for Cloudflare Workers (only 1.5% of 1MB limit)

  #### **API Enhancements**
  - **BREAKING**: Improved tuple handling with better argument parsing
  - Enhanced error messages for better developer experience
  - Fixed type inference issues across all resolver combinations
  - Improved TypeScript support with better type safety

  #### **Developer Experience**
  - Updated all examples with correct import statements and syntax
  - Fixed validator syntax (e.g., `'url?'` → `url({optional: true})`)
  - Enhanced README documentation with comprehensive examples
  - Improved error messages and debugging information

  ### 🐛 Bug Fixes
  - Fixed import path issues in test files (`validators` → `resolvers`)
  - Resolved TypeScript compilation errors in examples
  - Fixed missing exports and type conversion issues
  - Corrected validator syntax throughout codebase

  ### 📦 Package Updates
  - Updated AWS SDK dependencies to version 3.910.0
  - Enhanced ESLint configuration for better TypeScript support
  - Improved build configuration and bundle optimization

  ### 🎯 Performance
  - **Tailwind CSS approach**: Utility-first, tree-shakeable, minimal bundle impact
  - Lazy loading architecture preserved - heavy resolvers only loaded when imported
  - Optimized for serverless environments with fast cold starts
  - 35% smaller than dotenv alternative

### Patch Changes

- Updated dependencies [c119292]
  - node-env-resolver@5.0.0

## 5.0.0

### Major Changes

- 7e1a295: **BREAKING CHANGE**: Renamed resolver API method from `.with()` to `.async()` for better clarity

  The asynchronous resolver method has been renamed to better indicate its asynchronous behavior:
  - **Before**: `resolve.with()`
  - **After**: `resolveAsync()`

  **Migration Guide:**

  Replace all instances of `resolve.with()` with `resolveAsync()`:

  ```typescript
  // Before
  const config = await resolve.with([
    processEnv(),
    { NODE_ENV: ['development', 'production', 'test'] as const },
  ]);

  // After
  const config = await resolveAsync([
    processEnv(),
    { NODE_ENV: ['development', 'production', 'test'] as const },
  ]);
  ```

  **Additional Changes:**
  - Added new `getAuditLog(config)` function to retrieve audit events for specific configurations
  - Enhanced support for multiple synchronous resolvers using tuple syntax
  - Updated all documentation and examples to use the new `.async()` method

### Patch Changes

- Updated dependencies [7e1a295]
  - node-env-resolver@4.0.0

## 4.0.1

### Patch Changes

- Updated dependencies [60cf6d4]
  - node-env-resolver@3.0.1

## 4.0.0

### Major Changes

- eeb10db: # v3.0.0 - Major Performance & Architecture Improvements

  ## 🚀 Performance Improvements
  - **38% smaller bundle size**: Reduced from ~6KB to ~3.6KB gzipped through intelligent code splitting and lazy loading
  - **Lazy-loaded validators**: Advanced validators (URL, email, database types) are now lazy-loaded only when used
  - **Lazy-loaded audit logging**: Audit functionality loads only when `enableAudit: true`
  - **Tree-shakeable utilities**: Separate imports for utils, resolvers, and validators enable optimal bundle sizes

  ## ✨ New Features

  ### Valibot Integration

  Added full support for Valibot validation library with consistent API:
  - `resolveValibot()` / `resolveSyncValibot()` - Async/sync resolution with Valibot schemas
  - `safeResolveValibot()` / `safeResolveSyncValibot()` - Safe variants that return result objects

  ```typescript
  import { resolveValibot } from 'node-env-resolver/valibot';
  import * as v from 'valibot';

  const schema = v.object({
    PORT: v.pipe(v.string(), v.transform(Number)),
    DATABASE_URL: v.pipe(v.string(), v.url()),
  });

  const config = await resolveValibot(schema);
  ```

  ### Unified Validation Types

  Introduced consistent error format across all validators (Zod, Valibot, built-in):

  ```typescript
  import type { ValidationIssue, SafeResolveResultWithIssues } from 'node-env-resolver';

  // Consistent error handling across all validators
  const result = await safeResolveZod(schema);
  if (!result.success) {
    result.issues.forEach((issue: ValidationIssue) => {
      console.error(`${issue.path.join('.')}: ${issue.message} (${issue.code})`);
    });
  }
  ```

  ### Exported Validation Types

  Users can now import validation types for better TypeScript integration:
  - `ValidationIssue` - Field-level error details with path, message, and code
  - `SafeResolveResultWithIssues<T>` - Result type with detailed validation issues

  ## 🔧 Breaking Changes

  ### 1. Removed Standard Schema Integration

  **Removed:**
  - `toStandardSchema()` function
  - `schemaToStandardSchema()` function
  - `validateWithStandardSchema()` function
  - `validateEnvWithStandardSchema()` function
  - All Standard Schema types and exports
  - `@standard-schema/spec` dependency

  **Why:** Direct validator integration is more performant, reduces bundle size, and simplifies maintenance.

  ### 2. Modular Import Structure

  Functions moved to separate imports for better tree-shaking:

  **Before (v2):**

  ```typescript
  import { resolve, dotenv, cached, TTL, awsCache } from 'node-env-resolver';
  ```

  **After (v3):**

  ```typescript
  import { resolve, processEnv } from 'node-env-resolver';
  import { dotenv } from 'node-env-resolver/resolvers';
  import { cached, TTL, awsCache } from 'node-env-resolver/utils';
  ```

  ### 3. Enhanced Zod Integration

  Zod integration now uses unified error format:
  - `safeResolveZod()` returns `SafeResolveResultWithIssues<T>` with detailed `issues` array
  - Removed `zodToStandardSchema()` function

  **Before (v2):**

  ```typescript
  const result = await safeResolveZod(schema);
  if (!result.success) {
    console.error(result.error); // Simple string
  }
  ```

  **After (v3):**

  ```typescript
  const result = await safeResolveZod(schema);
  if (!result.success) {
    console.error(result.error); // Summary string
    result.issues.forEach((issue) => {
      console.log(`${issue.path.join('.')}: ${issue.message}`); // Detailed errors
    });
  }
  ```

  ## 📦 What's in the Core Bundle?

  The 3.6KB core now includes:
  - Core resolver logic (async/sync resolution)
  - Schema normalization & type coercion
  - Basic validation (string, number, boolean, enum, pattern, custom)
  - Interpolation & policy checking
  - Provenance tracking & error handling

  **Lazy-loaded when needed:**
  - Advanced validators (~1KB) - URL, email, postgres, redis, etc.
  - Audit logging (~150 bytes)
  - dotenv parser (~1.6KB)
  - Utility functions (~1KB)

  ## 🔄 Migration Guide

  ### Standard Schema Users

  If you were using Standard Schema integration:

  **Option 1: Use built-in validators**

  ```typescript
  // Before
  import { validateWithStandardSchema } from 'node-env-resolver';

  // After - use built-in types
  import { resolve } from 'node-env-resolver';
  const config = resolve({
    DATABASE_URL: postgres(),
    EMAIL: 'email',
    API_URL: url(),
  });
  ```

  **Option 2: Switch to Zod or Valibot**

  ```typescript
  // Use Zod
  import { resolveZod } from 'node-env-resolver/zod';
  // Or use Valibot
  import { resolveValibot } from 'node-env-resolver/valibot';
  ```

  ### Update Imports

  Update your imports to use the new modular structure:

  ```typescript
  // Step 1: Update core imports (no changes needed for most)
  import { resolve, processEnv } from 'node-env-resolver';

  // Step 2: Add specific imports for utilities
  import { dotenv } from 'node-env-resolver/resolvers';
  import { cached, TTL, awsCache } from 'node-env-resolver/utils';

  // Step 3: If using validators directly
  import { url, email } from 'node-env-resolver/validators';
  ```

  ### Update Zod Safe Resolve

  If using `safeResolveZod`, update error handling to use the new `issues` array:

  ```typescript
  const result = await safeResolveZod(schema);
  if (!result.success) {
    // New: Access detailed issues
    result.issues.forEach((issue) => {
      console.log(`Field: ${issue.path.join('.')}`);
      console.log(`Error: ${issue.message}`);
      console.log(`Code: ${issue.code}`);
    });
  }
  ```

  ## 📝 New Exports

  **Added to `node-env-resolver`:**
  - `ValidationIssue` - Type for validation error details
  - `SafeResolveResultWithIssues<T>` - Type for safe resolve results with issues

  **New module: `node-env-resolver/valibot`:**
  - `resolveValibot()` / `resolveSyncValibot()`
  - `safeResolveValibot()` / `safeResolveSyncValibot()`
  - `InferValibotOutput<T>` - Type inference helper

  **Removed exports:**
  - `./standard-schema` module and all Standard Schema exports
  - `./validators` export from main index (use `'node-env-resolver/validators'`)

  ## 🐛 Bug Fixes
  - Fixed JSON default value parsing in shorthand syntax
  - Improved sync validator loading with better error messages
  - Enhanced type inference for `custom` validator type

  ## 📚 Documentation
  - Updated all READMEs with new import patterns
  - Added bundle size comparison and code splitting architecture
  - Added Valibot integration examples
  - Updated migration guides for v2 to v3

  ## ⚠️ Notes
  - **No behavior changes** for basic usage - `resolve()` works the same way
  - **Fully backward compatible** except for removed Standard Schema features
  - **All tests passing** - 298 tests across all packages
  - **Type-safe** - No breaking changes to TypeScript types (except removed features)

### Patch Changes

- Updated dependencies [eeb10db]
  - node-env-resolver@3.0.0

## 3.0.1

### Patch Changes

- Updated dependencies [3a9c1cb]
  - node-env-resolver@2.0.1

## 3.0.0

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

  ### `resolveAsync()` now uses tuple syntax

  Custom providers are now specified using a cleaner tuple syntax instead of options:

  ```ts
  // ❌ Old
  await resolve(schema, {
    resolvers: [customProvider()],
  });

  // ✅ New
  await resolveAsync([customProvider(), schema]);
  ```

  Multiple providers can be chained:

  ```ts
  await resolveAsync(
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

  The AWS convenience functions now use the new `resolveAsync()` API internally:

  ```ts
  // Your code doesn't need to change, but the implementation
  // now uses the cleaner tuple syntax internally
  const config = await resolveSsm({ APP_NAME: string() });
  const config = await resolveSecrets({ API_KEY: string() });
  ```

  ### Standard Schema moved to dev dependencies

  The `@standard-schema/spec` package is now a dev dependency instead of a production dependency, reducing bundle size for users who don't use Standard Schema validators.

  ## New Features (from previous release)
  - Added `safeResolve()` and `safeResolveSync()` for non-throwing error handling
  - Support for custom async providers via `resolveAsync()`
  - Improved error messages with actionable hints
  - Enhanced type safety throughout the API

  ## Migration Guide
  1. **Simple schemas**: Remove `await` from `resolve()` calls
  2. **Custom providers**: Change from `resolve(schema, { resolvers: [...] })` to `resolveAsync([provider(), schema])`
  3. **Next.js**: Change imports from `resolveSync` to `resolve`
  4. **AWS**: Update to latest version - API is compatible but implementation improved

  ## Why This Change?
  - **Simpler mental model**: Most environment resolution is synchronous (process.env, .env files)
  - **Better performance**: No unnecessary Promises for sync operations
  - **Cleaner syntax**: Tuple syntax is more intuitive than nested options
  - **Explicit async**: When you need async providers, use `resolveAsync()` - the async nature is clear from the API

  ## Documentation
  - Completely rewritten README with examples for all use cases
  - New migration guides and examples
  - Improved error messages throughout

### Patch Changes

- Updated dependencies [aa920f4]
  - node-env-resolver@2.0.0

## 2.1.0

### Minor Changes

- b4afee9: Add safeResolve API and environment variable name validation

  **New Features:**
  - Add `safeResolve()` and `safeResolveSync()` functions with Zod-like API pattern
    - Returns `{ success: true, data }` on success instead of throwing
    - Returns `{ success: false, error }` on validation failure
    - Includes `.async()` methods for multiple resolvers
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

### Patch Changes

- Updated dependencies [b4afee9]
  - node-env-resolver@1.1.0

## 2.0.0

### Major Changes

- 5a4165e: Publish remaining packages to npm
  - node-env-resolver/nextjs: Zero-config Next.js integration
  - node-env-resolver/aws: AWS resolvers for Secrets Manager and SSM
  - node-env-resolver/config: Shared TypeScript and ESLint configurations

## 1.0.0

### Major Changes

- 5c05090: Initial release version 1.0.0
  - node-env-resolver: Core environment variable resolver with async resolvers
  - node-env-resolver/nextjs: Zero-config Next.js integration with client/server split
  - node-env-resolver/aws: AWS resolvers for Secrets Manager and SSM Parameter Store
  - node-env-resolver/config: Shared TypeScript and ESLint configurations

### Patch Changes

- Updated dependencies [5c05090]
  - node-env-resolver@1.0.0

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Initial release of node-env-resolver/nextjs
- Next.js specific environment variable resolver
- Support for both server and client-side environment variables
- Integration with Next.js build process
- Type-safe configuration for Next.js applications

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
