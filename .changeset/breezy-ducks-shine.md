---
'node-env-resolver-aws': patch
'node-env-resolver': patch
'aws-lambda-example': patch
'node-env-resolver-nextjs': patch
'node-env-resolver-vite': patch
---

## Updated API Documentation

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
