---
'node-env-resolver': minor
---

Dramatically reduce bundle size with lazy loading and inline validation

This release introduces intelligent code-splitting that reduces the baseline bundle size from ~6KB to **~3.7KB gzipped** (38% reduction) for basic use cases.

**What changed:**

- **Inline validation for basic types**: Common types (`string`, `number`, `boolean`, `enum`, `pattern`, `custom`) now use inline validation with zero external dependencies instead of loading the standard-schema validator system
- **Lazy-loaded advanced types**: Advanced validators (database URLs, email, url, json, etc.) are only loaded when actually used, not upfront
- **Lazy-loaded audit logging**: The audit module is only imported when `enableAudit: true` is set, saving ~200 bytes for apps that don't use auditing
- **Improved error messages**: Synchronous resolution (`resolve()`) now provides clear error messages when trying to use advanced types, directing users to use `resolve.with()` instead

**Breaking changes:**

⚠️ Synchronous resolution (`resolve()`) no longer supports advanced validators. If you were using types like `url`, `email`, `postgres`, etc. with `resolve()`, you must either:
1. Switch to `resolve.with()` (recommended): `const config = await resolve.with([processEnv(), schema]);`
2. Use basic types instead: Change `'url'` to `'string'` with optional `pattern` validation

Basic types continue to work synchronously: `string`, `number`, `boolean`, enums, `pattern`, and `custom` validators.

**Bundle size impact:**

- Basic types only: **3.7KB gzipped** (was 6KB)
- With advanced validators: **6KB gzipped** (same as before, but only when used)
- With audit enabled: **3.9KB gzipped** (audit module lazy-loaded)

**Migration example:**

```ts
// Before (worked synchronously, but loaded all validators)
const config = resolve({
  DATABASE_URL: 'postgres',
  API_URL: 'url'
});

// After - Option 1: Use async resolution (recommended)
const config = await resolve.with([
  processEnv(),
  { DATABASE_URL: 'postgres', API_URL: 'url' }
]);

// After - Option 2: Use basic types if you don't need advanced validation
const config = resolve({
  DATABASE_URL: 'string',  // Basic string validation
  API_URL: 'string'
});
```
