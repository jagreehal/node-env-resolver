---
'node-env-resolver-aws': major
'node-env-resolver': major
'node-env-resolver-nextjs': major
---

# Major API Redesign: Synchronous-First, Simplified API

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
  resolvers: [customProvider()]
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
