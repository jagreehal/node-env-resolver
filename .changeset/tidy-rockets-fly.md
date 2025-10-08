---
'node-env-resolver': minor
'node-env-resolver-nextjs': minor
---

Add safeResolve API and environment variable name validation

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
