---
'node-env-resolver-aws': major
'node-env-resolver': major
'node-env-resolver-nextjs': major
'node-env-resolver-vite': major
---

# Breaking Changes: Validator Functions Moved to Separate Module

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
  API_URL: url()
};
```

**After:**
```typescript
const config = {
  ENV: oneOf(['development', 'production', 'test']),
  API_URL: url()
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
