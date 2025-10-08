# node-env-resolver

Type-safe environment variable handling for Node.js applications.

[![npm version](https://img.shields.io/npm/v/node-env-resolver)](https://www.npmjs.com/package/node-env-resolver)
[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](https://opensource.org/licenses/MIT)

## What is this?

A simple way to load and validate environment variables with full TypeScript support. It works with any Node.js application and has zero runtime dependencies.

## Install

```bash
npm install node-env-resolver
```

## Quick example

```ts
import { resolve } from 'node-env-resolver';

const config = await resolve({
  PORT: 3000,
  DATABASE_URL: 'url',
  DEBUG: false,
  API_KEY: 'string?'
});

// TypeScript knows the types
config.PORT;         // number
config.DATABASE_URL; // URL object
config.DEBUG;        // boolean
config.API_KEY;      // string | undefined
```

## Core features

**Simple syntax** - Use shorthand like `'url'`, `3000`, or `['dev', 'prod']` for common cases.

**Custom validators** - Write your own validation functions when you need more control.

**Works anywhere** - Express, Next.js, Lambda, or any Node.js application.

**Zero dependencies** - The core package has no runtime dependencies.

**Standard Schema compliant** - Works with Zod v4, Valibot, and other validation libraries if you need them.

## Built-in validators

The library includes validators for common use cases:

- **Basic types**: `string`, `number`, `boolean`, `json`
- **Network**: `url`, `http`, `https`, `port`
- **Databases**: `postgres`, `mysql`, `mongodb`, `redis`
- **Other**: `email`

All validators automatically handle type coercion from environment variable strings.

## Examples

### Basic usage

```ts
import { resolve } from 'node-env-resolver';

// Throws on validation failure
const config = await resolve({
  PORT: 3000,                              // number with default
  NODE_ENV: ['development', 'production'] as const,  // enum
  DATABASE_URL: 'postgres',                // required, validated
  DEBUG: false                             // boolean with default
});

// Or use safe version (returns result object)
import { safeResolve } from 'node-env-resolver';

const result = await safeResolve({
  PORT: 'number',
  DATABASE_URL: 'postgres'
});

if (result.success) {
  console.log('Port:', result.data.PORT);
} else {
  console.error('Error:', result.error);
}
```

### Optional values

```ts
const config = await resolve({
  API_KEY: 'string?',      // Optional
  REDIS_URL: 'url?',       // Optional
  PORT: 3000               // Required (has default)
});
```

### Enums

```ts
const config = await resolve({
  NODE_ENV: ['development', 'production', 'test'] as const
});

// TypeScript knows: 'development' | 'production' | 'test'
```

### Custom validators

```ts
const portValidator = (value: string): number => {
  const port = parseInt(value, 10);
  if (isNaN(port) || port < 1 || port > 65535) {
    throw new Error('Port must be between 1 and 65535');
  }
  return port;
};

const config = await resolve({
  CUSTOM_PORT: portValidator,
  DATABASE_URL: 'postgres',
  DEBUG: false
});
```

### Multiple sources

Load configuration from different sources (later sources override earlier ones):

```ts
import { resolve, processEnv, dotenv } from 'node-env-resolver';
import { awsSecrets } from 'node-env-resolver-aws';

// Using resolve.with() to combine multiple sources
const config = await resolve.with(
  [processEnv(), {
    PORT: 3000,
    NODE_ENV: ['development', 'production'] as const,
  }],
  [awsSecrets({ secretId: 'myapp/secrets' }), {
    DATABASE_URL: 'postgres',
    API_KEY: 'string',
  }]
);

// Or use one-line convenience functions (for single AWS source)
import { resolveSecrets } from 'node-env-resolver-aws';

const config = await resolveSecrets({
  secretId: 'myapp/secrets'
}, {
  DATABASE_URL: 'postgres',
  API_KEY: 'string'
});

// Safe version with error handling
import { safeResolveSecrets } from 'node-env-resolver-aws';

const result = await safeResolveSecrets({
  secretId: 'myapp/secrets'
}, {
  DATABASE_URL: 'postgres',
  API_KEY: 'string'
});

if (!result.success) {
  console.error('Config failed:', result.error);
  process.exit(1);
}

const config = result.data;
```

**IMPORTANT:** Don't wrap arguments in extra array brackets:

```ts
// ✅ CORRECT
await resolve.with(
  [processEnv(), { PORT: 3000 }],
  [dotenv(), { DATABASE_URL: 'url' }]
);

// ❌ WRONG - Will fail with "Invalid environment variable name: 0, 1"
await resolve.with([
  [processEnv(), { PORT: 3000 }],
  [dotenv(), { DATABASE_URL: 'url' }]
]);
```

### Custom providers

Create your own resolver to load from any source (database, API, etc.):

```ts
import { resolve, type Resolver } from 'node-env-resolver';

// Create a custom resolver
const databaseResolver: Resolver = {
  name: 'database',
  async load() {
    // Fetch config from database
    const config = await db.query('SELECT key, value FROM config');
    return Object.fromEntries(config.rows.map(r => [r.key, r.value]));
  }
};

// Use with resolve.with()
const config = await resolve.with(
  [processEnv(), { PORT: 3000 }],
  [databaseResolver, { FEATURE_FLAGS: 'json' }]
);
```

**Resolver interface:**
```ts
interface Resolver {
  name: string;                             // Unique name for logging
  load: () => Promise<Record<string, string>>;
  loadSync?: () => Record<string, string>;  // Optional sync support
  metadata?: Record<string, unknown>;       // Optional (e.g., { cached: true })
}
```

**More examples:**

```ts
// API resolver
const apiResolver: Resolver = {
  name: 'api-config',
  async load() {
    const response = await fetch('https://config.example.com/api');
    return response.json();
  }
};

// Use multiple custom resolvers
const config = await resolve.with(
  [processEnv(), { PORT: 3000 }],
  [databaseResolver, { FEATURE_FLAGS: 'json' }],
  [apiResolver, { RATE_LIMIT: 'number' }]
);
```

### Safe resolve (Zod-like pattern)

Like Zod's `safeParse()`, use `safeResolve()` to get a result object instead of throwing:

```ts
import { safeResolve } from 'node-env-resolver';

const result = await safeResolve({
  PORT: 'number',
  DATABASE_URL: 'postgres',
  API_KEY: 'string',
});

if (result.success) {
  console.log('Config loaded:', result.data);
  // result.data.PORT is fully typed
} else {
  console.error('Validation failed:', result.error);
  // Handle error gracefully
}
```

**Available functions:**

| Function | Behavior | Use case |
|----------|----------|----------|
| `resolve()` | Throws on error | Simple apps, fail-fast |
| `safeResolve()` | Returns `{ success, data?, error? }` | Graceful error handling |
| `resolveSync()` | Sync, throws on error | Sync config (e.g., Next.js) |
| `safeResolveSync()` | Sync, returns result object | Sync with error handling |

All functions support `.with()` for multiple sources:

```ts
import { safeResolve, processEnv } from 'node-env-resolver';
import { awsSecrets } from 'node-env-resolver-aws';

// Safe resolve with multiple sources
const result = await safeResolve.with(
  [processEnv(), { PORT: 3000 }],
  [awsSecrets({ secretId: 'prod/secrets' }), { DATABASE_URL: 'postgres' }]
);

if (!result.success) {
  console.error(result.error);
  process.exit(1);
}
```

**Important notes:**
- `PORT: 3000` means "use default 3000 if missing" (no error)
- `PORT: 'number'` means "required, throw if missing"
- `PORT: 'number?'` means "optional, return `undefined` if missing"

### Next.js

Automatic client/server environment variable splitting:

```ts
// env.mjs
import { resolve, safeResolve } from 'node-env-resolver/nextjs';

// Throws on validation failure
export const env = resolve({
  server: {
    DATABASE_URL: 'url',
    API_SECRET: 'string',
  },
  client: {
    NEXT_PUBLIC_APP_URL: 'url',
    NEXT_PUBLIC_GA_ID: 'string?',
  }
});

// Or use safe version
const result = safeResolve({
  server: { DATABASE_URL: 'url' },
  client: { NEXT_PUBLIC_APP_URL: 'url' }
});

if (!result.success) {
  console.error('Config failed:', result.error);
  process.exit(1);
}

export const env = result.data;
```

### Zod Integration

Use Zod schemas directly for validation:

```ts
import { resolveZod, safeResolveZod } from 'node-env-resolver/zod';
import { z } from 'zod';

const schema = z.object({
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string().url(),
  NODE_ENV: z.enum(['development', 'production', 'test']),
  DEBUG: z.coerce.boolean().optional(),
});

// Throws on validation error
const env = await resolveZod(schema);

// Returns result object (safe version)
const result = await safeResolveZod(schema);
if (result.success) {
  console.log(result.data.PORT);  // Fully typed
} else {
  console.error(result.error);
}
```

**Available functions:**
- `resolveZod()` - Throws on error
- `safeResolveZod()` - Returns `{ success, data?, error? }`
- `resolveSyncZod()` - Sync, throws on error
- `safeResolveSyncZod()` - Sync, returns result object

**With AWS integration:**
```ts
// Using resolvers option
import { resolveZod, processEnv } from 'node-env-resolver/zod';
import { awsSecrets } from 'node-env-resolver-aws';

const env = await resolveZod(schema, {
  resolvers: [
    processEnv(),
    awsSecrets({ secretId: 'prod/secrets' })
  ]
});

// Or use AWS convenience functions directly
import { resolveSecrets } from 'node-env-resolver-aws';
import { z } from 'zod';

const env = await resolveSecrets({
  secretId: 'prod/secrets'
}, {
  DATABASE_URL: z.string().url(),
  API_KEY: z.string().min(32)
});
```

## Packages

- **`node-env-resolver`** - Core package with zero dependencies
- **`node-env-resolver-aws`** - AWS Secrets Manager & SSM integration with one-line convenience functions
- **`node-env-resolver/nextjs`** - Next.js client/server split

## Documentation

See the individual package READMEs for detailed documentation:

- [Core package](./packages/node-env-resolver/README.md)
- [AWS integration](./packages/node-env-resolver-aws/README.md)
- [Next.js integration](./packages/nextjs-resolver/README.md)

## License

MIT © [Jagvinder Singh Reehal](https://jagreehal.com)
