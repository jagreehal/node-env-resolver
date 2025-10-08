# node-env-resolver

Type-safe environment variable handling with zero dependencies.

[![npm version](https://img.shields.io/npm/v/node-env-resolver)](https://www.npmjs.com/package/node-env-resolver)

## Install

```bash
npm install node-env-resolver
```

## Quick start

```ts
import { resolve } from 'node-env-resolver';

const config = await resolve({
  PORT: 3000,
  DATABASE_URL: 'url',
  DEBUG: false,
  API_KEY: 'string?'
});

// All typed correctly
config.PORT;         // number
config.DATABASE_URL; // URL object
config.DEBUG;        // boolean
config.API_KEY;      // string | undefined
```

## Features

- Zero runtime dependencies
- Full TypeScript type inference
- Custom validation functions
- Standard Schema compliant
- Works with any Node.js application

## Built-in validators

The library includes validators for common use cases:

- **Basic**: `string`, `number`, `boolean`, `json`, `port`
- **Network**: `url`, `http`, `https`, `email`
- **Database**: `postgres`, `mysql`, `mongodb`, `redis`

## Usage

### Simple schema

```ts
import { resolve } from 'node-env-resolver';

const config = await resolve({
  PORT: 3000,
  NODE_ENV: ['development', 'production'] as const,
  DATABASE_URL: 'postgres',
  DEBUG: false
});
```

### Optional values

Add `?` to make a value optional:

```ts
const config = await resolve({
  API_KEY: 'string?',
  REDIS_URL: 'url?'
});
```

### Custom validators

Write your own validation functions:

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
  DATABASE_URL: 'postgres'
});
```

### Multiple sources

Load from different sources with explicit mapping:

```ts
import { resolve, processEnv, dotenv } from 'node-env-resolver';

const config = await resolve.with(
  [processEnv(), {
    PORT: 3000,
    NODE_ENV: ['development', 'production'] as const,
  }],
  [dotenv(), {
    DATABASE_URL: 'postgres',
    API_KEY: 'string',
  }]
);
```

Later sources override earlier ones if there are conflicts.

### Custom providers

Create your own resolver to load config from any source:

```ts
import { resolve, type Resolver } from 'node-env-resolver';

// Custom resolver that loads from a database
const databaseResolver: Resolver = {
  name: 'database',
  async load() {
    const config = await db.query('SELECT key, value FROM config');
    return Object.fromEntries(config.rows.map(r => [r.key, r.value]));
  }
};

// Custom resolver that loads from an API
const apiResolver: Resolver = {
  name: 'api',
  async load() {
    const response = await fetch('https://config.example.com/api/config');
    return response.json();
  }
};

// Use custom resolvers
const config = await resolve.with(
  [processEnv(), { PORT: 3000 }],
  [databaseResolver, { FEATURE_FLAGS: 'json' }],
  [apiResolver, { RATE_LIMIT: 'number' }]
);
```

**Resolver interface:**
```ts
interface Resolver {
  name: string;                             // Unique name for logging/debugging
  load: () => Promise<Record<string, string>>;
  loadSync?: () => Record<string, string>;  // Optional sync support
  metadata?: Record<string, unknown>;       // Optional metadata (e.g., cached: true)
}
```

### Safe resolve (Zod-like pattern)

Like Zod's `parse()` vs `safeParse()`, choose between throwing errors or getting result objects:

```ts
import { resolve, safeResolve } from 'node-env-resolver';

// ❌ Throws on validation failure (like Zod's parse())
try {
  const config = await resolve({
    PORT: 'number',
    DATABASE_URL: 'postgres',
  });
  console.log(config.PORT);
} catch (error) {
  console.error(error.message);
}

// ✅ Returns result object (like Zod's safeParse())
const result = await safeResolve({
  PORT: 'number',
  DATABASE_URL: 'postgres',
});

if (result.success) {
  console.log('Port:', result.data.PORT);
  // result.data is fully typed
} else {
  console.error('Failed:', result.error);
}
```

**All variants:**

| Function | Behavior | Use case |
|----------|----------|----------|
| `resolve()` | Throws on error | Simple apps, fail-fast |
| `safeResolve()` | Returns `{ success, data?, error? }` | Graceful error handling |
| `resolveSync()` | Sync, throws on error | Sync config loading |
| `safeResolveSync()` | Sync, returns result object | Sync with error handling |

All functions support `.with()` for multiple sources:

```ts
const result = await safeResolve.with(
  [processEnv(), { PORT: 3000 }],
  [awsSecrets(), { API_KEY: 'string' }]
);

if (!result.success) {
  console.error(result.error);
  process.exit(1);
}
```

### With caching

Add TTL caching for remote sources:

```ts
import { resolve, cached, TTL } from 'node-env-resolver';

const config = await resolve.with(
  [processEnv(), { PORT: 3000 }],
  [cached(customProvider, { ttl: TTL.minutes5 }), {
    API_KEY: 'string',
  }]
);
```

## API

### Shorthand syntax

```ts
'string'        // Required string
'string?'       // Optional string
'url'           // URL (returns URL object)
'email'         // Email address
'port'          // Port number (1-65535)
'json'          // JSON value
'postgres'      // PostgreSQL connection string
'mysql'         // MySQL connection string
'mongodb'       // MongoDB connection string
'redis'         // Redis connection string

// Defaults
3000                          // number with default
false                         // boolean with default
['dev', 'prod'] as const      // enum (requires 'as const')
```

### Object syntax

For advanced validation:

```ts
{
  type: 'string',
  pattern: '^sk_[a-zA-Z0-9]+$',
  min: 32,
  max: 64,
  optional: true,
  description: 'API key'
}
```

### Options

```ts
await resolve(schema, {
  resolvers: [customResolver],     // Custom resolvers
  extend: [awsSecrets({ secretId: 'app/secrets' })],  // Extend default resolvers
  strict: true,                     // Strict mode
  enableAudit: true,                // Audit logging
  policies: {                       // Security policies
    enforceAllowedSources: {
      DATABASE_URL: ['aws-secrets']
    }
  }
});
```

### Built-in resolvers

```ts
import { dotenv, processEnv } from 'node-env-resolver';

// Load from .env files
dotenv({ path: '.env', expand: true })

// Load from process.env
processEnv()
```

### Utility resolvers

```ts
import { cached, retry, TTL } from 'node-env-resolver';

// Cache with TTL
cached(resolver, { ttl: 300 })

// Retry on failure
retry(resolver, { attempts: 3 })

// TTL constants
TTL.minute    // 60
TTL.minutes5  // 300
TTL.hour      // 3600
TTL.day       // 86400
```

## Examples

### Express app

```ts
import { resolve } from 'node-env-resolver';

const config = await resolve({
  PORT: 3000,
  NODE_ENV: ['development', 'production', 'test'] as const,
  DATABASE_URL: 'postgres',
  REDIS_URL: 'redis?',
  JWT_SECRET: 'string',
  JWT_EXPIRES_IN: '7d',
  ENABLE_ANALYTICS: false
});

app.listen(config.PORT, () => {
  console.log(`Server running on port ${config.PORT}`);
});
```

### AWS Lambda

```ts
import { resolveSecrets } from 'node-env-resolver-aws';

const config = await resolveSecrets({
  secretId: 'lambda/secrets'
}, {
  API_ENDPOINT: 'url',
  TIMEOUT: 30,
  LOG_LEVEL: ['debug', 'info', 'warn', 'error'] as const
});

export const handler = async (event) => {
  // Use config values
};
```

## Error messages

The library provides clear, actionable error messages:

```
❌ Environment validation failed:
  - Missing required environment variable: DATABASE_URL
  - PORT: Invalid port number (1-65535)
  - NODE_ENV: must be one of: development, production (got: "staging")
```

## TypeScript support

Full type inference works automatically:

```ts
const config = await resolve({
  PORT: 3000,
  DATABASE_URL: 'url',
  NODE_ENV: ['dev', 'prod'] as const,
  DEBUG: false
});

config.PORT.toFixed(2);              // ✓ number
config.DATABASE_URL.protocol;        // ✓ URL object
config.NODE_ENV === 'dev';           // ✓ 'dev' | 'prod'
config.DEBUG ? 'yes' : 'no';         // ✓ boolean
```

## License

MIT © [Jagvinder Singh Reehal](https://jagreehal.com)
