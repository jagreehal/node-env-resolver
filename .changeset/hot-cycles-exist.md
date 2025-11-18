---
'node-env-resolver-aws': minor
'node-env-resolver': minor
'node-env-resolver-nextjs': minor
'node-env-resolver-vite': minor
---

Add support for optional enum arrays with new `enumOf()` function and `optional()` wrapper.

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
