# node-env-resolver

Type-safe environment variable resolution with zero dependencies and ultra-small bundle size.

[![npm version](https://img.shields.io/npm/v/node-env-resolver)](https://www.npmjs.com/package/node-env-resolver)

**Bundle Size:** ~4.3KB gzipped

## Install

```bash
npm install node-env-resolver
```

## Quick start (uses process.env)

```ts
import { resolve } from 'node-env-resolver';
import { string } from 'node-env-resolver/resolvers';

const config = resolve({
  PORT: 3000,
  NODE_ENV: ['development', 'production', 'test'] as const,
  DEBUG: false,
  API_KEY: string({optional:true})
});

// config is fully typed
config.PORT;         // number
config.NODE_ENV;     // 'development' | 'production' | 'test'
config.DEBUG;        // boolean
config.API_KEY;      // string | undefined
```

## Quick start (with custom resolvers)

```ts
import { resolve, resolveAsync, processEnv } from 'node-env-resolver';
import { dotenv, string, url, postgres, redis } from 'node-env-resolver/resolvers';
import { awsSecrets, gcpSecrets, vaultSecrets } from 'node-env-resolver-aws';

// Synchronous with custom resolver (object syntax)
const config = resolve({
  resolvers: [
    [dotenv(), {
      PORT: 3000,
      NODE_ENV: ['development', 'production', 'test'] as const,
      DEBUG: false,
      API_KEY: string({optional:true})
    }]
  ]
});

// Asynchronous with any resolvers (both sync and async work!)
const config = await resolveAsync({
  resolvers: [
    [dotenv(), {
      PORT: 3000,
      NODE_ENV: ['development', 'production', 'test'] as const,
      DEBUG: false,
      API_KEY: string({optional:true})
    }],
    [awsSecrets(), { DATABASE_URL: url() }]
  ]
});

// Multiple resolvers with options
const config = await resolveAsync({
  resolvers: [
    [processEnv(), { PORT: 3000 }],
    [dotenv(), { DATABASE_URL: postgres() }],
    [awsSecrets(), { API_KEY: string() }],
    [gcpSecrets(), { JWT_SECRET: string() }],
    [vaultSecrets(), { REDIS_URL: redis() }]
  ],
  options: { priority: 'last' }
});
```

## Table of Contents

- [Install](#install)
- [Quick start](#quick-start-uses-processenv)
- [Quick start (with custom resolvers)](#quick-start-with-custom-resolvers)
- [Basic usage](#basic-usage)
  - [Required values](#required-values)
  - [Default values](#default-values)
  - [Optional values](#optional-values)
  - [Enums](#enums)
- [Variable Naming Conventions](#variable-naming-conventions)
- [Performance & Bundle Size](#performance--bundle-size)
- [Custom validators](#custom-validators)
- [Multiple sources](#multiple-sources)
- [Safe error handling](#safe-error-handling)
- [Synchronous resolution](#synchronous-resolution)
- [Advanced features](#advanced-features)
- [API Reference](#api-reference)
- [Configuration Options](#configuration-options)
- [Framework examples](#framework-examples)
- [Security Policies](#security-policies)
- [Audit Logging](#audit-logging)
- [Error messages](#error-messages)
- [Licence](#licence)

## Basic usage

### Required values

If an environment variable is missing and has no default, validation fails:

```ts
import { resolve } from 'node-env-resolver';
import { postgres, string } from 'node-env-resolver/resolvers';

const config = resolve({
  DATABASE_URL: postgres(),  // Required PostgreSQL URL
  API_KEY: string()          // Required
});
```

### Default values

Provide a default value to use when the environment variable is not set:

```ts
import { resolve } from 'node-env-resolver';

const config = resolve({
  PORT: 3000,           // Defaults to 3000
  DEBUG: false,         // Defaults to false
  LOG_LEVEL: 'info'     // Defaults to 'info'
});
```

### Optional values

Use the `{optional: true}` option to make a value optional:

```ts
import { string, url, number } from 'node-env-resolver/resolvers';

const config = resolve({
  API_KEY: string({optional: true}),    // string | undefined
  REDIS_URL: url({optional: true}),     // string | undefined
  MAX_RETRIES: number({optional: true}) // number | undefined
});
```

### Enums

Use arrays for enum validation:

```ts
import { resolve } from 'node-env-resolver';

const config = resolve({
  NODE_ENV: ['development', 'production', 'test'] as const,
  LOG_LEVEL: ['debug', 'info', 'warn', 'error'] as const
});

// TypeScript knows the exact types
config.NODE_ENV;  // 'development' | 'production' | 'test'
config.LOG_LEVEL; // 'debug' | 'info' | 'warn' | 'error'
```

## Variable Naming Conventions

The library validates environment variable names to prevent shell errors and ensure cross-platform compatibility.

### Supported Name Formats

Variable names can use:
- **Letters** (both uppercase and lowercase): `A-Z`, `a-z`
- **Numbers** (not as first character): `0-9`
- **Underscores**: `_`

### Valid Examples

```ts
import { resolve } from 'node-env-resolver';
import { string } from 'node-env-resolver/resolvers';

const config = resolve({
  PORT: 3000,              // ✅ SCREAMING_SNAKE_CASE (traditional)
  port: 3000,              // ✅ lowercase
  myApiKey: string(),      // ✅ camelCase
  my_api_key: string(),    // ✅ snake_case
  API_KEY_V2: string(),    // ✅ with numbers (not first char)
  _PRIVATE: string()       // ✅ starting with underscore
});
```

### Invalid Examples

```ts
import { resolve } from 'node-env-resolver';
import { string } from 'node-env-resolver/resolvers';

const config = resolve({
  '123PORT': 3000,         // ❌ Starts with number
  'API-KEY': string(),     // ❌ Contains hyphen
  'API.KEY': string(),     // ❌ Contains dot
  'API KEY': string(),     // ❌ Contains space
  'API@KEY': string()      // ❌ Special characters
});
```

**Recommendation:** While all formats are supported, **SCREAMING_SNAKE_CASE** (e.g., `DATABASE_URL`, `API_KEY`) is the most common convention for environment variables and ensures maximum compatibility with legacy systems.

**Validation pattern:** `/^[A-Za-z_][A-Za-z0-9_]*$/`

## Performance & Bundle Size

**Lightweight** The core library is **~4.3KB gzipped** with validation and resolver capabilities - **optimized for minimal bundle impact**.

```ts
import { resolveAsync, processEnv } from 'node-env-resolver';
import { dotenv, json, postgres, string, redis } from 'node-env-resolver/resolvers';
import { awsSecrets } from 'node-env-resolver-aws';

const config = await resolveAsync({
  resolvers: [
    [processEnv(), { PORT: 3000 }],
    [dotenv(), { DATABASE_URL: postgres() }],
    [awsSecrets(), { API_KEY: string() }]
  ]
  // Perfect for complex microservice architectures!
});
```

**Benefits:**
- **No artificial limits** - use as many resolvers as needed
- **Better type inference** - proper schema merging with full TypeScript support
- **Cleaner code** - single implementation instead of multiple overloads
- **Future-proof** - automatically supports new resolver types

### Efficient validation architecture

The library uses a two-tier validation strategy with lazy-loaded validators:

**Basic types** (~3.6KB core - inline validation):
- `string`, `number`, `boolean` (with min/max validation)
- `enum` (array validation)
- `pattern` (regex validation)
- `custom` (validator functions)

**Advanced types** (+1KB when used - lazy-loaded):
- Database URLs: `postgres`, `mysql`, `mongodb`, `redis`
- Web types: `http`, `https`, `url`, `email`
- Format types: `json`, `date`, `timestamp`, `port`

Advanced validators are lazy-loaded only when you use them, keeping the base bundle minimal. All types work both synchronously and asynchronously:

```ts
import { resolve, resolveAsync } from 'node-env-resolver';
import { postgres, url } from 'node-env-resolver/resolvers';
import { awsSecrets } from 'node-env-resolver-aws';

// Synchronous - works with all types
const config = resolve({
  PORT: 3000,
  DATABASE_URL: postgres(),
  API_URL: url(),
  NODE_ENV: ['development', 'production'] as const
});

// Also works with async resolvers
const config = await resolveAsync({
  resolvers: [
    [awsSecrets(), { DATABASE_URL: postgres(), API_URL: url() }]
  ]
});
```

### What's in the 3.6KB core?
- Core resolver logic (async/sync resolution)
- Schema normalization & type coercion
- Basic validation (string, number, boolean, enum, pattern, custom)
- Interpolation & policy checking
- Provenance tracking & error handling

### Code Splitting Architecture
The library uses intelligent code splitting to keep the core minimal:
- **Advanced validators** (~1KB): Lazy-loaded when using types like `url`, `email`, `postgres`
- **Audit logging** (~150 bytes): Lazy-loaded when `enableAudit: true`
- **dotenv parser** (~1.6KB): Separate import from `'node-env-resolver/resolvers'`
- **Utility functions** (~1KB): Separate import from `'node-env-resolver/utils'`

Only the code you actually use gets loaded!

### Audit Logging (Lazy Loaded)

Audit logging is lazy-loaded only when enabled, keeping the base bundle minimal:

```ts
import { resolve } from 'node-env-resolver';

// Base bundle
const config = resolve({ PORT: 3000 });

// Audit module loaded when enabled
const config = resolve({ PORT: 3000 }, { enableAudit: true });
```

### Optimized Module Structure

Import only what you need for optimal bundle size:

```ts
// Core (~3.6KB) - Main API
import { resolve, safeResolve, processEnv } from 'node-env-resolver';

// Resolvers (separate chunk) - .env file parsing
import { dotenv } from 'node-env-resolver/resolvers';

// Utils (separate chunk) - caching & retry logic
import { cached, retry, TTL, awsCache } from 'node-env-resolver/utils';

// Validators (separate chunk) - reusable validation functions
import { validateUrl, validateEmail } from 'node-env-resolver/validators';

// Integrations (separate packages)
import { resolveZod } from 'node-env-resolver/zod';
import { resolveValibot } from 'node-env-resolver/valibot';
import { awsSecrets } from 'node-env-resolver-aws';
```

**Most apps only need the core (~3.6KB)!**

## Custom validators

Write your own validation functions:

```ts
import { resolve } from 'node-env-resolver';

const isValidPort = (value: string): number => {
  const port = parseInt(value, 10);
  if (isNaN(port) || port < 1 || port > 65535) {
    throw new Error('Port must be between 1 and 65535');
  }
  return port;
};

const isValidEmail = (value: string): string => {
  if (!value.includes('@')) {
    throw new Error('Invalid email address');
  }
  return value.toLowerCase();
};

const config = resolve({
  CUSTOM_PORT: isValidPort,
  ADMIN_EMAIL: isValidEmail
});
```

### Reusing built-in validators

For advanced use cases, you can import and compose the built-in validation functions:

```ts
import { resolve } from 'node-env-resolver';
import { validateUrl, validateEmail } from 'node-env-resolver/validators';

const validateMarketingUrl = (value: string): string => {
  // Reuse built-in URL validator
  const result = validateUrl(value);
  if (!result.valid) {
    throw new Error(result.error || 'Invalid URL');
  }
  
  // Add custom business logic
  if (!value.includes('marketing.example.com')) {
    throw new Error('Must be a marketing domain URL');
  }
  
  return value;
};

const config = resolve({
  MARKETING_URL: validateMarketingUrl
});
```

Available validation functions: `validatePostgres`, `validateMysql`, `validateMongodb`, `validateRedis`, `validateHttp`, `validateHttps`, `validateUrl`, `validateEmail`, `validatePort`, `validateNumber`, `validateBoolean`, `validateJson`, `validateDate`, `validateTimestamp`.

## Multiple sources

Load configuration from multiple sources. By default, later sources override earlier ones:
```ts
import { resolve, resolveAsync, processEnv } from 'node-env-resolver';
import { dotenv, json, postgres, string, redis } from 'node-env-resolver/resolvers';
import { awsSecrets } from 'node-env-resolver-aws';

// Async mode - supports both sync and async resolvers
const config = await resolveAsync({
  resolvers: [
    [processEnv(), {
      PORT: 3000,
      NODE_ENV: ['development', 'production'] as const,
    }],
    [dotenv(), {
      DATABASE_URL: postgres(),
      API_KEY: string(),
    }]
  ]
});

// Sync mode - supports multiple SYNC resolvers
const config = resolve({
  resolvers: [
    [dotenv(), { PORT: 3000 }],
    [json('config.json'), { DATABASE_URL: postgres() }]
  ]
  // Both resolvers must have loadSync() method
});

// Support for ANY number of resolvers (3, 4, 5, 10+ resolvers!)
const config = await resolveAsync({
  resolvers: [
    [processEnv(), { PORT: 3000 }],
    [dotenv(), { DATABASE_URL: postgres() }],
    [awsSecrets(), { API_KEY: string() }]
  ],
  options: { priority: 'last' }
});
```

### Controlling merge behaviour

Use `priority` to control how resolvers merge values (works with both sync and async modes):

```ts
import { resolve, resolveAsync, processEnv } from 'node-env-resolver';
import { dotenv, json, postgres } from 'node-env-resolver/resolvers';
import { awsSecrets } from 'node-env-resolver-aws';

// priority: 'last' (default) - later resolvers override earlier ones
const config = await resolveAsync({
  resolvers: [
    [processEnv(), { DATABASE_URL: postgres() }],
    [awsSecrets(), { DATABASE_URL: postgres() }]
  ]
  // AWS wins
});

// priority: 'first' - earlier resolvers take precedence
const config = await resolveAsync({
  resolvers: [
    [dotenv(), { DATABASE_URL: postgres() }],
    [awsSecrets(), { DATABASE_URL: postgres() }]
  ],
  options: { priority: 'first' }
  // dotenv wins
});

// Also works with sync resolve()
const config = resolve({
  resolvers: [
    [dotenv(), { DATABASE_URL: postgres() }],
    [json('config.json'), { DATABASE_URL: postgres() }]
  ],
  options: { priority: 'first' }
  // dotenv wins
});
```

This is useful for development workflows where local overrides should take precedence over cloud secrets.

### Performance optimizations

The library includes two automatic performance optimizations:

#### 1. Early termination with `priority: 'first'`

When using `priority: 'first'`, resolvers are called sequentially, but execution **stops early** once all required environment variables are satisfied:

```ts
import { resolveAsync } from 'node-env-resolver';
import { dotenv, postgres, string } from 'node-env-resolver/resolvers';
import { awsSecrets } from 'node-env-resolver-aws';

const config = await resolveAsync({
  resolvers: [
    [dotenv(), { DATABASE_URL: postgres(), API_KEY: string(), PORT: 3000 }],
    [awsSecrets(), { DATABASE_URL: postgres(), API_KEY: string(), PORT: 3000 }]
  ],
  options: { priority: 'first' }
});
// If dotenv() provides all required keys, awsSecrets() is never called!
```

This is particularly valuable in development where:

- Local `.env` file contains all needed variables
- Expensive remote resolver calls (AWS Secrets Manager, Parameter Store, GCP Secret Manager) are skipped
- Startup time is significantly reduced

**What counts as "satisfied"?**

- Only **required** keys (no `optional: true`, no `default` value) trigger early termination
- Optional variables and variables with defaults do **not** prevent calling remaining resolvers

#### 2. Parallel execution with `priority: 'last'`

When using `priority: 'last'` (the default), all resolvers are called **in parallel** for maximum performance:

```ts
import { resolveAsync } from 'node-env-resolver';
import { postgres, string } from 'node-env-resolver/resolvers';
import { awsSecrets, awsSsm } from 'node-env-resolver-aws';

const config = await resolveAsync({
  resolvers: [
    [awsSecrets(), { DATABASE_URL: postgres() }],      // 100ms
    [awsSsm(), { API_KEY: string() }], // 100ms
  ]
  // Default: priority: 'last'
});
// Total time: ~100ms (parallel) instead of ~300ms (sequential)
```

Since `priority: 'last'` means "last write wins", the order doesn't matter for conflict resolution, so all resolvers can run concurrently.

**Use cases:**

- Production environments loading from multiple remote secret stores
- Fetching different variables from different sources
- Significant speedup when resolvers have network latency

## Safe error handling

Like Zod's `safeParse()`, use `safeResolve()` to get a result object instead of throwing:

```ts
import { safeResolve, safeResolveAsync } from 'node-env-resolver';
import { number, postgres } from 'node-env-resolver/resolvers';

// Synchronous safe resolve
const result = safeResolve({
  PORT: number(),
  DATABASE_URL: postgres()
});

// Asynchronous safe resolve
const result = await safeResolveAsync({
  resolvers: [
    [processEnv(), { PORT: number() }],
    [awsSecrets(), { DATABASE_URL: postgres() }]
  ]
});

if (result.success) {
  // Use result.data with full type safety
  console.log(result.data.PORT);
} else {
  // Handle error gracefully
  console.error(result.error);
  process.exit(1);
}
```

All functions have safe variants:

- `resolve()` → `safeResolve()` (both synchronous)
- `resolveAsync()` → `safeResolveAsync()` (both async)

## Synchronous resolution

`resolve()` is **synchronous by default** when reading from `process.env`:

```ts
import { resolve } from 'node-env-resolver';
import { string, url, postgres } from 'node-env-resolver/resolvers';

// Synchronous - no await needed, works with ALL types
const config = resolve({
  PORT: 3000,
  NODE_ENV: ['development', 'production'] as const,
  API_KEY: string(),
  API_URL: url(),        // Advanced types work synchronously!
  DATABASE_URL: postgres(),
  DEBUG: false
});
```

`resolveAsync()` is **async** when using custom resolvers:

```ts
import { resolveAsync, processEnv } from 'node-env-resolver';
import { dotenv, postgres, url } from 'node-env-resolver/resolvers';

// Async - await required when using custom resolvers
const config = await resolveAsync({
  resolvers: [
    [processEnv(), { PORT: 3000 }],
    [dotenv(), { DATABASE_URL: postgres(), API_URL: url() }]
  ]
});
```

## Advanced features

### CLI arguments

Parse command-line arguments as environment variables - perfect for CLI tools:

```ts
import { resolveAsync, processEnv } from 'node-env-resolver';
import { postgres } from 'node-env-resolver/resolvers';
import { cliArgs } from 'node-env-resolver/cli';

// $ node app.js --port 8080 --database-url postgres://localhost --verbose

const config = await resolveAsync({
  resolvers: [
    [processEnv(), {
      PORT: 3000,
      DATABASE_URL: postgres(),
      VERBOSE: false
    }],
    [cliArgs(), {
      PORT: 3000,
      DATABASE_URL: postgres(),
      VERBOSE: false
    }]
  ]
});

// config.PORT === 8080 (from CLI)
// config.DATABASE_URL === 'postgres://localhost' (from CLI)
// config.VERBOSE === true (from CLI flag)
```

**Supported formats:**
- `--key value` → `KEY=value`
- `--key=value` → `KEY=value`  
- `--flag` → `FLAG=true` (boolean flags)
- `--kebab-case` → `KEBAB_CASE` (auto-normalization)

**Bundle size:** ~500 bytes (lazy-loaded)

### Computed fields

Derive properties from resolved configuration:

```ts
import { resolve } from 'node-env-resolver';
import { withComputed } from 'node-env-resolver/utils';

const config = resolve({
  HOST: 'localhost',
  PORT: 3000,
  SSL_ENABLED: false,
  NODE_ENV: ['development', 'production'] as const
});

// Add computed properties
const appConfig = withComputed(config, {
  // Build URLs from components
  url: (c) => `${c.SSL_ENABLED ? 'https' : 'http'}://${c.HOST}:${c.PORT}`,
  
  // Environment checks
  isProd: (c) => c.NODE_ENV === 'production',
  isDev: (c) => c.NODE_ENV === 'development',
  
  // Complex derived config
  serverOptions: (c) => ({
    host: c.HOST,
    port: c.PORT,
    cors: c.NODE_ENV !== 'production',
    compression: c.NODE_ENV === 'production'
  })
});

console.log(appConfig.url);           // 'http://localhost:3000'
console.log(appConfig.isProd);        // false
console.log(appConfig.serverOptions); // { host: 'localhost', ... }
```

**Common patterns:**
```ts
// Build database connection URLs
withComputed(config, {
  databaseUrl: (c) => 
    `postgres://${c.DB_USER}:${c.DB_PASSWORD}@${c.DB_HOST}:${c.DB_PORT}/${c.DB_NAME}`
});

// Derive API endpoints
withComputed(config, {
  endpoints: (c) => ({
    users: `${c.API_BASE_URL}/${c.API_VERSION}/users`,
    posts: `${c.API_BASE_URL}/${c.API_VERSION}/posts`
  })
});

// Feature flags based on environment
withComputed(config, {
  features: (c) => ({
    analytics: c.ENABLE_ANALYTICS && c.NODE_ENV === 'production',
    debug: c.NODE_ENV === 'development'
  })
});
```

**Bundle size:** ~200 bytes (included in utils)

### Zod integration

Use Zod schemas for powerful validation:

```ts
import { resolveZod } from 'node-env-resolver/zod';
import * as z from 'zod';  // ✅ Recommended import pattern (better tree-shaking)

const schema = z.object({
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string().url(),
  NODE_ENV: z.enum(['development', 'production', 'test']),
  DEBUG: z.coerce.boolean().optional(),
});

const config = await resolveZod(schema);
// config.PORT is number, config.DATABASE_URL is string, etc.
```

**Safe error handling** with field-level errors:

```ts
import { safeResolveZod } from 'node-env-resolver/zod';
import * as z from 'zod';

const schema = z.object({
  PORT: z.coerce.number(),
  DATABASE_URL: z.string().url()
});

const result = await safeResolveZod(schema);

if (result.success) {
  console.log(result.data.PORT);
} else {
  console.error(result.error);  // Summary message
  result.issues.forEach(issue => {
    // Field-level details: path, message, code
    console.log(`${issue.path.join('.')}: ${issue.message}`);
  });
}
```

**Available functions:**

- `resolveZod()` - Async, throws on error
- `safeResolveZod()` - Async, returns `{ success, data/error, issues }`
- `resolveSyncZod()` - Sync, throws on error
- `safeResolveSyncZod()` - Sync, returns `{ success, data/error, issues }`

### Valibot integration

Use Valibot for lightweight, modular validation:

```ts
import { resolveValibot } from 'node-env-resolver/valibot';
import * as v from 'valibot';  // User imports valibot separately

const schema = v.object({
  PORT: v.pipe(v.string(), v.transform(Number)),
  DATABASE_URL: v.pipe(v.string(), v.url()),
  NODE_ENV: v.picklist(['development', 'production', 'test']),
  DEBUG: v.optional(v.pipe(v.string(), v.transform(Boolean))),
});

const config = await resolveValibot(schema);
```

**Safe error handling** with unified error format:

```ts
import { safeResolveValibot } from 'node-env-resolver/valibot';
import * as v from 'valibot';

const schema = v.object({
  PORT: v.pipe(v.string(), v.transform(Number)),
  DATABASE_URL: v.pipe(v.string(), v.url())
});

const result = await safeResolveValibot(schema);

if (result.success) {
  console.log(result.data.PORT);
} else {
  console.error(result.error);  // Summary message
  result.issues.forEach(issue => {
    // Same format as Zod - consistent across validators!
    console.log(`${issue.path.join('.')}: ${issue.message}`);
  });
}
```

**Available functions:**

- `resolveValibot()` - Async, throws on error
- `safeResolveValibot()` - Async, returns `{ success, data/error, issues }`
- `resolveSyncValibot()` - Sync, throws on error
- `safeResolveSyncValibot()` - Sync, returns `{ success, data/error, issues }`

**Why unified errors?** Switch between Zod and Valibot without changing error handling code!

### Custom resolvers

Create resolvers to load configuration from any source:

```ts
import { resolveAsync, processEnv, type Resolver } from 'node-env-resolver';
import { string } from 'node-env-resolver/resolvers';

const databaseResolver: Resolver = {
  name: 'database',
  async load() {
    const rows = await db.query('SELECT key, value FROM config');
    return Object.fromEntries(rows.map(r => [r.key, r.value]));
  }
};

const config = await resolveAsync({
  resolvers: [
    [processEnv(), { PORT: 3000 }],
    [databaseResolver, { API_KEY: string() }]
  ]
});
```

### AWS Secrets Manager

Install the AWS package:

```bash
npm install node-env-resolver-aws
```

Single source:

```ts
import { resolveSecrets } from 'node-env-resolver-aws';
import { postgres, string } from 'node-env-resolver/resolvers';

const config = await resolveSecrets({
  secretId: 'myapp/secrets'
}, {
  DATABASE_URL: postgres(),
  API_KEY: string()
});
```

Multiple sources:

```ts
import { resolveAsync, processEnv } from 'node-env-resolver';
import { postgres, string } from 'node-env-resolver/resolvers';
import { awsSecrets, awsSsm } from 'node-env-resolver-aws';

const config = await resolveAsync({
  resolvers: [
    [processEnv(), { PORT: 3000 }],
    [awsSecrets({ secretId: 'app/secrets' }), { DATABASE_URL: postgres() }],
    [awsSsm({ path: '/app/config' }), { API_KEY: string() }]
  ]
});
```

See the [AWS package documentation](../node-env-resolver-aws/README.md) for details on credentials, caching, and best practices.

### TTL caching

Cache expensive operations like AWS API calls:

```ts
import { resolveAsync } from 'node-env-resolver';
import { cached, TTL } from 'node-env-resolver/utils';
import { postgres, string } from 'node-env-resolver/resolvers';
import { awsSecrets } from 'node-env-resolver-aws';

export const getConfig = async () => {
  return await resolveAsync({
    resolvers: [
      [cached(
        awsSecrets({ secretId: 'app/secrets' }),
        { ttl: TTL.minutes5 }
      ), {
        DATABASE_URL: postgres(),
        API_KEY: string(),
      }]
    ]
  });
};

// Call getConfig() in your handlers
app.get('/api/data', async (req, res) => {
  const config = await getConfig(); // Fast after first call
});
```

Performance:

- First call: ~200ms (loads from AWS)
- Subsequent calls (< 5min): <1ms (cached)
- After 5min: ~200ms (refresh from AWS)

**Important:** Call `resolve()` every time. The `cached()` wrapper handles the caching.

**Advanced caching options:**

```ts
import { cached, TTL } from 'node-env-resolver/utils';

// Stale-while-revalidate: serve stale data while refreshing in background
const resolver = cached(awsSecrets(), {
  ttl: TTL.minutes5,           // Fresh for 5 minutes
  maxAge: TTL.hour,            // Force refresh after 1 hour
  staleWhileRevalidate: true   // Serve stale data during refresh
});

// Custom cache key for debugging
const resolver = cached(awsSecrets(), {
  ttl: TTL.minutes15,
  key: 'prod-secrets-v2'
});
```

## API Reference

### Function variants

| Function | Behaviour | Use case |
|----------|-----------|----------|
| `resolve()` | Sync, throws on error | Most applications (reading from process.env) |
| `safeResolve()` | Sync, returns result object | Graceful error handling |
| `resolveAsync()` | Async, throws on error | Multiple sources (dotenv, AWS, etc.) |
| `safeResolveAsync()` | Async, returns result object | Multiple sources with error handling |

### Resolver API Reference

Import resolver functions from `'node-env-resolver/resolvers'`:

```ts
import {
  string, number, boolean, url, email, port, json,
  postgres, mysql, mongodb, redis,
  http, https, date, timestamp, duration, file
} from 'node-env-resolver/resolvers';
```

| Syntax | Type | Description |
|--------|------|-------------|
| `string()` | `string` | Required string (empty strings rejected by default) |
| `string({optional: true})` | `string \| undefined` | Optional string |
| `number()` | `number` | Required number (coerced from string) |
| `number({optional: true})` | `number \| undefined` | Optional number |
| `boolean()` | `boolean` | Required boolean (coerced from string) |
| `boolean({optional: true})` | `boolean \| undefined` | Optional boolean |
| `url()` | `string` | Validated URL (returns string) |
| `url({optional: true})` | `string \| undefined` | Optional URL |
| `email()` | `string` | Validated email address |
| `port()` | `number` | Validated port number (1-65535) |
| `json()` | `unknown` | Parsed JSON (returns object/array) |
| `postgres()` or `postgresql()` | `string` | Validated PostgreSQL URL |
| `mysql()` | `string` | Validated MySQL connection string |
| `mongodb()` | `string` | Validated MongoDB connection string |
| `redis()` | `string` | Validated Redis connection string |
| `http()` | `string` | HTTP or HTTPS URL |
| `https()` | `string` | HTTPS-only URL |
| `date()` | `string` | Validated ISO 8601 date |
| `timestamp()` | `number` | Validated Unix timestamp |
| `duration()` | `number` | Time duration (`5s`, `2m`, `1h` → milliseconds) |
| `file()` | `string` | Read content from file path |
| `3000` | `number` | Number with default value |
| `false` | `boolean` | Boolean with default value |
| `'defaultValue'` | `string` | String with default value |
| `['a', 'b'] as const` | `'a' \| 'b'` | Enum (requires `as const`) |

## Configuration Options

All `resolve()` functions accept an optional `options` parameter to control behaviour:

```ts
// Single source (process.env) - options as second parameter
const config = resolve(schema, {
  interpolate: false,
  strict: true,
  policies: {...},
  enableAudit: true
});

// Multiple sources - options in config object
const config = await resolveAsync({
  resolvers: [
    [resolver1, schema],
    [resolver2, schema]
  ],
  options: {
    interpolate: false,
    strict: true,
    policies: {...},
    enableAudit: true,
    priority: 'last'
  }
});
```

**Note:** The `resolvers` option has been removed. For single source resolution, use `resolve()` directly (defaults to `process.env`). For multiple sources, use `resolveAsync()` syntax.

### `interpolate`

**What:** Enables variable interpolation using `${VAR_NAME}` syntax.

**When:** Use when environment variables reference other variables.

**Why:** Keeps configuration DRY and maintainable.

**Default:** `true` in `resolveAsync()`, `false` in `resolve()`

```ts
import { resolve } from 'node-env-resolver';
import { url } from 'node-env-resolver/resolvers';

// With interpolation
process.env.BASE_URL = 'https://api.example.com';
process.env.API_ENDPOINT = '${BASE_URL}/v1';

const config = resolve({
  BASE_URL: url(),
  API_ENDPOINT: url()
}, {
  interpolate: true
});

// config.API_ENDPOINT === 'https://api.example.com/v1'
```

### `strict`

**What:** Controls whether resolver failures stop the entire resolution process.

**When:**

- `strict: true` (default) - Production environments where you want fail-fast behaviour
- `strict: false` - Graceful degradation when some sources might be unavailable

**Why:**

- `true`: Ensures all resolvers work correctly (reliability)
- `false`: Allows partial success when some resolvers fail (availability)

**Default:** `true`

```ts
const flakyResolver = {
  name: 'external-api',
  async load() {
    throw new Error('Service unavailable');
  }
};

// ❌ Throws immediately
await resolveAsync({
  resolvers: [
    [flakyResolver, schema],
    [processEnv(), schema]
  ],
  options: { strict: true }  // default
});

// ✅ Continues with processEnv()
await resolveAsync({
  resolvers: [
    [flakyResolver, schema],
    [processEnv(), schema]
  ],
  options: { strict: false }  // graceful degradation
});
```

**Note:** In sync mode with `strict: true`, resolvers without `loadSync()` method will throw errors.

### `priority`

**What:** Controls merge strategy when multiple resolvers provide the same variable.

**When:**

- `priority: 'last'` (default) - Production: cloud secrets override local env
- `priority: 'first'` - Development: local overrides override cloud secrets

**Why:** Different environments need different precedence rules.

**Default:** `'last'`

```ts
import { resolveAsync, processEnv } from 'node-env-resolver';
import { dotenv, postgres } from 'node-env-resolver/resolvers';
import { awsSecrets } from 'node-env-resolver-aws';

// Production: AWS secrets override process.env
await resolveAsync({
  resolvers: [
    [processEnv(), { DATABASE_URL: postgres() }],
    [awsSecrets(), { DATABASE_URL: postgres() }]
  ]
  // priority: 'last' (default) - AWS wins
});

// Development: Local .env overrides cloud
await resolveAsync({
  resolvers: [
    [dotenv(), { DATABASE_URL: postgres() }],
    [awsSecrets(), { DATABASE_URL: postgres() }]
  ],
  options: { priority: 'first' }  // dotenv wins
});
```

**See:** "Controlling merge behaviour" section above for details.

### `policies`

**What:** Security policies to enforce where variables can be loaded from.

**When:** Use in production to enforce security requirements.

**Why:** Prevent accidental use of `.env` files or ensure secrets come from secure sources.

**Default:** `undefined` (no policies enforced)

```ts
await resolveAsync({
  resolvers: [
    [processEnv(), schema],
    [awsSecrets(), schema]
  ],
  options: {
    policies: {
      // Block .env in production (default behaviour)
      allowDotenvInProduction: false,

      // Force secrets to come from AWS
      enforceAllowedSources: {
        DATABASE_PASSWORD: ['aws-secrets'],
        API_KEY: ['aws-secrets']
      }
    }
  }
});
```

**See:** "Security Policies" section below for complete documentation.

### `enableAudit`

**What:** Enables audit logging to track where each variable was loaded from.

**When:**

- Production monitoring and compliance
- Debugging configuration issues
- Security audits

**Why:** Track configuration sources for compliance and troubleshooting.

**Default:** `false` (disabled in development), automatically `true` in production (`NODE_ENV === 'production'`)

```ts
await resolveAsync({
  resolvers: [
    [processEnv(), schema],
    [awsSecrets(), schema]
  ],
  options: { enableAudit: true }  // Explicitly enable in development
});

const logs = getAuditLog();
// [
//   { type: 'env_loaded', key: 'DATABASE_URL', source: 'aws-secrets', ... },
//   { type: 'validation_success', ... }
// ]
```

**See:** "Audit Logging" section below for complete documentation.

### Complete Interface

```ts
interface ResolveOptions {
  interpolate?: boolean;               // Variable interpolation (default: true in .async())
  strict?: boolean;                    // Fail-fast behaviour (default: true)
  priority?: 'first' | 'last';         // Merge strategy (default: 'last')
  policies?: PolicyOptions;            // Security policies (default: undefined)
  enableAudit?: boolean;               // Audit logging (default: auto in production)
  secretsDir?: string;                 // Base directory for file secrets (Docker/K8s)
}

interface PolicyOptions {
  allowDotenvInProduction?: boolean | string[];  // .env in production control
  enforceAllowedSources?: Record<string, string[]>;  // Source restrictions
}
```

## Framework examples

### Express

```ts
import express from 'express';
import { resolve } from 'node-env-resolver';
import { postgres, string } from 'node-env-resolver/resolvers';

const config = resolve({
  PORT: 3000,
  DATABASE_URL: postgres(),
  SESSION_SECRET: string()
});

const app = express();
app.listen(config.PORT);
```

### Next.js

```ts
// env.mjs
import { resolve } from 'node-env-resolver/nextjs';
import { postgres, string, url } from 'node-env-resolver/resolvers';

export const env = resolve({
  server: {
    DATABASE_URL: postgres(),
    API_SECRET: string(),
  },
  client: {
    NEXT_PUBLIC_APP_URL: url(),
  }
});
```

### AWS Lambda

```ts
import { resolveAsync } from 'node-env-resolver';
import { cached, TTL } from 'node-env-resolver/utils';
import { postgres } from 'node-env-resolver/resolvers';
import { awsSecrets } from 'node-env-resolver-aws';

const getConfig = async () => {
  return await resolveAsync({
    resolvers: [
      [cached(
        awsSecrets({ secretId: 'lambda/config' }),
        { ttl: TTL.minutes5 }
      ), {
        DATABASE_URL: postgres(),
      }]
    ]
  });
};

export const handler = async (event) => {
  const config = await getConfig();
  // Use config
};
```

## Security Policies

Control where environment variables can be loaded from to enforce security requirements.

### Policy: `allowDotenvInProduction`

By default, `.env` files are **completely blocked in production** for security. Production platforms (Vercel, AWS, Docker) inject environment variables via `process.env`, NOT `.env` files.

**Default behavior (secure):**

```ts
import { resolveAsync } from 'node-env-resolver';
import { dotenv, postgres } from 'node-env-resolver/resolvers';

// In production (NODE_ENV=production)
const config = await resolveAsync({
  resolvers: [
    [dotenv(), {
      DATABASE_URL: postgres(),
    }]
  ]
});
// ❌ Throws: "DATABASE_URL cannot be sourced from .env files in production"
```

**Allow all .env variables (NOT recommended):**

```ts
import { resolveAsync } from 'node-env-resolver';
import { dotenv, postgres } from 'node-env-resolver/resolvers';

const config = await resolveAsync({
  resolvers: [
    [dotenv(), {
      DATABASE_URL: postgres(),
    }]
  ],
  options: {
    policies: {
      allowDotenvInProduction: true  // Allow all (risky!)
    }
  }
});
```

**Allow specific variables only (recommended if needed):**

```ts
import { resolveAsync } from 'node-env-resolver';
import { dotenv, postgres } from 'node-env-resolver/resolvers';

const config = await resolveAsync({
  resolvers: [
    [dotenv(), {
      PORT: 3000,
      DATABASE_URL: postgres(),
    }]
  ],
  options: {
    policies: {
      allowDotenvInProduction: ['PORT']  // Only PORT allowed from .env
      // DATABASE_URL must come from process.env or cloud resolvers
    }
  }
});
```

### Policy: `enforceAllowedSources`

Restrict sensitive variables to specific resolvers (e.g., force secrets to come from AWS):

```ts
import { resolveAsync, processEnv } from 'node-env-resolver';
import { string } from 'node-env-resolver/resolvers';
import { awsSecrets } from 'node-env-resolver-aws';

const config = await resolveAsync({
  resolvers: [
    [processEnv(), {
      PORT: 3000,
    }],
    [awsSecrets({ secretId: 'prod/secrets' }), {
      DATABASE_PASSWORD: string(),
      API_KEY: string(),
    }]
  ],
  options: {
    policies: {
      enforceAllowedSources: {
        DATABASE_PASSWORD: ['aws-secrets'],  // Must come from AWS
        API_KEY: ['aws-secrets']             // Must come from AWS
        // PORT not restricted - can come from any resolver
      }
    }
  }
});
```

**Use case:** Ensure production secrets only come from AWS Secrets Manager, never from `.env` or `process.env`:

```ts
import { resolveAsync, processEnv } from 'node-env-resolver';
import { string } from 'node-env-resolver/resolvers';
import { awsSecrets } from 'node-env-resolver-aws';

const config = await resolveAsync({
  resolvers: [
    [processEnv(), {}],
    [awsSecrets({ secretId: 'prod/db' }), {
      DATABASE_PASSWORD: string(),
      STRIPE_SECRET: string(),
    }]
  ],
  options: {
    policies: {
      enforceAllowedSources: {
        DATABASE_PASSWORD: ['aws-secrets'],
        STRIPE_SECRET: ['aws-secrets']
      }
    }
  }
});

// ✅ If secrets come from AWS → Success
// ❌ If secrets come from process.env → Throws policy violation error
```

### PolicyOptions Interface

```ts
interface PolicyOptions {
  /**
   * Control loading from .env files in production.
   *
   * - undefined (default): .env files completely ignored in production
   * - true: Allow all vars from .env in production (NOT recommended)
   * - string[]: Allow only specific vars from .env in production
   */
  allowDotenvInProduction?: boolean | string[];
  
  /**
   * Restrict variables to specific resolvers.
   * 
   * Example: { DATABASE_PASSWORD: ['aws-secrets'] }
   */
  enforceAllowedSources?: Record<string, string[]>;
}
```

## Audit Logging

Track environment variable resolution for security and compliance monitoring.

### Important: Audit is Disabled by Default in Development

**Audit logging is only enabled automatically in production** (`NODE_ENV === 'production'`) for performance reasons. In development, you must explicitly enable it.

### Enable Audit Logging

```ts
import { resolve, getAuditLog, clearAuditLog } from 'node-env-resolver';
import { postgres, string } from 'node-env-resolver/resolvers';

// Option 1: Explicitly enable (works in any environment)
const config = resolve({
  DATABASE_URL: postgres(),
  API_KEY: string(),
}, {
  enableAudit: true  // ← Enable audit logging
});

console.log(getAuditLog());
// [
//   { type: 'env_loaded', key: 'DATABASE_URL', source: 'process.env', timestamp: ... },
//   { type: 'env_loaded', key: 'API_KEY', source: 'process.env', timestamp: ... },
//   { type: 'validation_success', metadata: { variableCount: 2 }, timestamp: ... }
// ]

// Clear the log
clearAuditLog();
```

```ts
import { resolve, getAuditLog } from 'node-env-resolver';
import { postgres } from 'node-env-resolver/resolvers';

// Option 2: Automatic in production
process.env.NODE_ENV = 'production';

const config = resolve({
  DATABASE_URL: postgres(),
});

// Audit automatically enabled in production
console.log(getAuditLog());
```

### Per-Config Audit Tracking

When you have multiple `resolve()` calls, you can now get audit logs **specific to each config object**:

```ts
import { resolve, getAuditLog } from 'node-env-resolver';
import { string, postgres } from 'node-env-resolver/resolvers';

const appConfig = resolve({
  PORT: 3000,
  API_KEY: string()
}, { enableAudit: true });

const dbConfig = resolve({
  DATABASE_URL: postgres(),
  DB_POOL_SIZE: 10
}, { enableAudit: true });

// Get audit logs for specific config (NEW!)
const appAudit = getAuditLog(appConfig);   // Only PORT and API_KEY events
const dbAudit = getAuditLog(dbConfig);     // Only DATABASE_URL and DB_POOL_SIZE events

// Still works: get ALL audit events (backward compatible)
const allAudit = getAuditLog();            // All events from both configs

console.log('App config audit:', appAudit);
// [
//   { type: 'env_loaded', key: 'PORT', source: 'process.env', ... },
//   { type: 'env_loaded', key: 'API_KEY', source: 'process.env', ... },
//   { type: 'validation_success', ... }
// ]

console.log('DB config audit:', dbAudit);
// [
//   { type: 'env_loaded', key: 'DATABASE_URL', source: 'process.env', ... },
//   { type: 'env_loaded', key: 'DB_POOL_SIZE', source: 'process.env', ... },
//   { type: 'validation_success', ... }
// ]
```

**Use cases:**
- Multi-tenant applications with separate configs per tenant
- Microservices with different config sources
- Testing/debugging specific configuration loads
- Isolating audit trails in complex applications

### Audit Event Types

| Event Type | When It Occurs |
|------------|----------------|
| `env_loaded` | Environment variable successfully loaded from a resolver |
| `validation_success` | All variables validated successfully |
| `validation_failure` | Variable validation failed |
| `policy_violation` | Security policy check failed |
| `resolver_error` | Resolver failed to load data |

### Monitoring Cache Performance

Audit logs include cache metadata to help monitor performance:

```ts
import { resolveAsync, getAuditLog } from 'node-env-resolver';
import { cached, TTL } from 'node-env-resolver/utils';
import { postgres } from 'node-env-resolver/resolvers';
import { awsSecrets } from 'node-env-resolver-aws';

const config = await resolveAsync({
  resolvers: [
    [cached(awsSecrets({ secretId: 'prod/db' }), { ttl: TTL.minutes5 }), {
      DATABASE_URL: postgres(),
    }]
  ],
  options: { enableAudit: true }
});

const logs = getAuditLog();
logs.forEach(log => {
  if (log.type === 'env_loaded') {
    console.log(`${log.key} from ${log.source}`,
                log.metadata?.cached ? '[CACHED]' : '[FRESH]');
  }
});
// Output:
// DATABASE_URL from cached(aws-secrets) [FRESH]
// (subsequent calls show [CACHED])
```

### Production Security Monitoring

Use audit logs for compliance and security monitoring:

```ts
import { resolveAsync, processEnv, getAuditLog } from 'node-env-resolver';
import { string } from 'node-env-resolver/resolvers';
import { awsSecrets } from 'node-env-resolver-aws';

// In production
const config = await resolveAsync({
  resolvers: [
    [processEnv(), {}],
    [awsSecrets(), {
      DATABASE_PASSWORD: string(),
      API_KEY: string(),
    }]
  ],
  options: {
    policies: {
      enforceAllowedSources: {
        DATABASE_PASSWORD: ['aws-secrets'],
        API_KEY: ['aws-secrets']
      }
    }
    // enableAudit: true automatically in production
  }
});

// Send audit logs to your monitoring system
const logs = getAuditLog();
const policyViolations = logs.filter(l => l.type === 'policy_violation');

if (policyViolations.length > 0) {
  // Alert: Secrets loaded from unauthorized source!
  console.error('Security violation:', policyViolations);
}
```

## Error messages

The library provides clear, actionable error messages:

```text
Environment validation failed:
  - Missing required environment variable: DATABASE_URL
  - PORT: Invalid port number (1-65535)
  - NODE_ENV: must be one of: development, production (got: "staging")
```

## Licence

MIT
