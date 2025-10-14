---
'node-env-resolver-aws': major
'node-env-resolver': major
'node-env-resolver-nextjs': major
---

**BREAKING CHANGE**: Renamed resolver API method from `.with()` to `.async()` for better clarity

The asynchronous resolver method has been renamed to better indicate its asynchronous behavior:

- **Before**: `resolve.with()`
- **After**: `resolve.async()`

**Migration Guide:**

Replace all instances of `resolve.with()` with `resolve.async()`:

```typescript
// Before
const config = await resolve.with([
  processEnv(),
  { NODE_ENV: ['development', 'production', 'test'] as const }
]);

// After  
const config = await resolve.async([
  processEnv(),
  { NODE_ENV: ['development', 'production', 'test'] as const }
]);
```

**Additional Changes:**

- Added new `getAuditLog(config)` function to retrieve audit events for specific configurations
- Enhanced support for multiple synchronous resolvers using tuple syntax
- Updated all documentation and examples to use the new `.async()` method
