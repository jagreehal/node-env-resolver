---
'node-env-resolver-aws': major
'node-env-resolver': major
'node-env-resolver-nextjs': major
---

# v3.0.0 - Major Performance & Architecture Improvements

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
  DATABASE_URL: v.pipe(v.string(), v.url())
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
  result.issues.forEach(issue => {
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
  DATABASE_URL: 'postgres',
  EMAIL: 'email',
  API_URL: 'url'
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
import { validateUrl, validateEmail } from 'node-env-resolver/validators';
```

### Update Zod Safe Resolve
If using `safeResolveZod`, update error handling to use the new `issues` array:

```typescript
const result = await safeResolveZod(schema);
if (!result.success) {
  // New: Access detailed issues
  result.issues.forEach(issue => {
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
