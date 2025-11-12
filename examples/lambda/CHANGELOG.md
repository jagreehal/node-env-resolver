# aws-lambda-example

## 1.0.13

### Patch Changes

- Updated dependencies [2b194f2]
  - node-env-resolver-aws@7.1.0

## 1.0.12

### Patch Changes

- Updated dependencies [b3de856]
  - node-env-resolver@6.0.1
  - node-env-resolver-aws@7.0.0

## 1.0.11

### Patch Changes

- Updated dependencies [0678bb0]
  - node-env-resolver-aws@7.0.0
  - node-env-resolver@6.0.0

## 1.0.10

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
  - node-env-resolver-aws@6.0.1
  - node-env-resolver@5.0.1

## 1.0.9

### Patch Changes

- Updated dependencies [c119292]
  - node-env-resolver-aws@6.0.0
  - node-env-resolver@5.0.0

## 1.0.8

### Patch Changes

- Updated dependencies [7e1a295]
  - node-env-resolver-aws@5.0.0
  - node-env-resolver@4.0.0

## 1.0.7

### Patch Changes

- Updated dependencies [60cf6d4]
  - node-env-resolver@3.0.1
  - node-env-resolver-aws@4.0.0

## 1.0.6

### Patch Changes

- Updated dependencies [eeb10db]
  - node-env-resolver-aws@4.0.0
  - node-env-resolver@3.0.0

## 1.0.5

### Patch Changes

- Updated dependencies [3a9c1cb]
  - node-env-resolver@2.0.1
  - node-env-resolver-aws@3.0.0

## 1.0.4

### Patch Changes

- Updated dependencies [aa920f4]
  - node-env-resolver-aws@3.0.0
  - node-env-resolver@2.0.0

## 1.0.3

### Patch Changes

- Updated dependencies [b4afee9]
  - node-env-resolver@1.1.0
  - node-env-resolver-aws@2.0.0

## 1.0.2

### Patch Changes

- Updated dependencies [6cb8897]
- Updated dependencies [5a4165e]
  - node-env-resolver/aws@1.0.0

## 1.0.1

### Patch Changes

- Updated dependencies [5c05090]
  - node-env-resolver@1.0.0
  - node-env-resolver/aws@1.0.0
