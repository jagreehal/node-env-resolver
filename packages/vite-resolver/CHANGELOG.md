# node-env-resolver-vite

## 2.1.1

### Patch Changes

- 6324d89: - refresh third-party dependencies (aws-sdk, next, vite) to pick up
  security and bug fixes
  - align core resolver package with the updated adapters so consumers get
    consistent peer ranges on install
- Updated dependencies [6324d89]
  - node-env-resolver@6.1.1

## 2.1.0

### Minor Changes

- e71a403: Add support for optional enum arrays with new `enumOf()` function and `optional()` wrapper.

  **New Features:**
  - **`enumOf()` function**: A clearer, more explicit alternative to `oneOf()` specifically designed for enum validation. Supports optional values and default values.
  - **`optional()` wrapper**: Enables clean array literal syntax for optional enums. Simply wrap your enum array with `optional()` to make it optional.

  **Usage Examples:**

  ```ts
  import { resolve } from 'node-env-resolver';
  import { optional, enumOf } from 'node-env-resolver/validators';

  const config = resolve({
    // Required enum (existing syntax still works)
    NODE_ENV: ['development', 'production', 'test'] as const,

    // Optional enum - Method 1: optional() wrapper (clean syntax)
    PROTOCOL: optional(['http', 'grpc'] as const),

    // Optional enum - Method 2: enumOf() function (explicit)
    LOG_LEVEL: enumOf(['error', 'warn', 'info', 'debug'] as const, { optional: true }),

    // Enum with default value
    COMPRESSION: enumOf(['gzip', 'brotli', 'none'] as const, { default: 'gzip' }),
  });

  // TypeScript infers correct types:
  // config.NODE_ENV: 'development' | 'production' | 'test'
  // config.PROTOCOL: 'http' | 'grpc' | undefined
  // config.LOG_LEVEL: 'error' | 'warn' | 'info' | 'debug' | undefined
  // config.COMPRESSION: 'gzip' | 'brotli' | 'none'
  ```

  **Backward Compatibility:**
  - All existing code continues to work unchanged
  - `oneOf()` remains available as an alias for `enumOf()` for backward compatibility
  - Plain array syntax `['a', 'b'] as const` still works for required enums

### Patch Changes

- Updated dependencies [e71a403]
  - node-env-resolver@6.1.0

## 2.0.1

### Patch Changes

- Updated dependencies [b3de856]
  - node-env-resolver@6.0.1

## 2.0.0

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

## 1.1.1

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

## 1.1.0

### Minor Changes

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

## 1.0.0

### Major Changes

- Initial release of Vite integration for node-env-resolver
- Zero-config client/server environment variable splitting
- Automatic `VITE_` prefix validation
- Runtime protection for server variables
- Full TypeScript support with IntelliSense
- **Auto-generate TypeScript definitions** for `import.meta.env`
- Optional Vite plugin for config-time integration
- Support for Vite 4.x, 5.x, 6.x, and 7.x
- Framework agnostic (works with Vue, React, Svelte, Solid, Astro)

### Plugin Features

- `generateTypes` option to auto-generate `vite-env.d.ts`
- Smart type inference from schema (url → string, false → boolean, etc.)
- Won't overwrite files with custom content
- Only runs in development mode for performance
