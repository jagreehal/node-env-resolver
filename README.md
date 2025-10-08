# node-env-resolver

Type-safe environment variable resolution for Node.js applications.

[![npm version](https://img.shields.io/npm/v/node-env-resolver)](https://www.npmjs.com/package/node-env-resolver)
[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](https://opensource.org/licenses/MIT)

Load and validate environment variables with full TypeScript inference. Works with any Node.js application, from Express to Lambda.

## Install

```bash
npm install node-env-resolver
```

## Quick start (uses process.env)

```ts
import { resolve } from 'node-env-resolver';

const config = resolve({
  PORT: 3000,
  DATABASE_URL: 'postgres',
  DEBUG: false,
  API_KEY: 'string?'
});

// config is fully typed
config.PORT;         // number
config.DATABASE_URL; // verified postgres connection string
config.DEBUG;        // boolean
config.API_KEY;      // string | undefined
```

## Quick start (async)

```ts
import { resolve } from 'node-env-resolver';

const config = await resolve.with([asyncEnvProvider(),{
  PORT: 3000,
  DATABASE_URL: 'postgres',
  DEBUG: false,
  API_KEY: 'string?'
}]);

// config is fully typed
config.PORT;         // number
config.DATABASE_URL; // verified postgres connection string
config.DEBUG;        // boolean
config.API_KEY;      // string | undefined
```

## Features

- Zero runtime dependencies
- Full TypeScript type inference
- Built-in validators (url, email, port, postgres, redis, etc.)
- Custom validation functions
- Standard Schema support (Zod, Valibot)
- Multiple source composition (process.env, .env, AWS Secrets Manager, etc.)
- Safe error handling (Zod-like pattern)

## Common patterns

### Optional values

```ts
const config = resolve({
  API_KEY: 'string?',  // Optional
  PORT: 3000           // Has default
});
```

### Enums

```ts
const config = resolve({
  NODE_ENV: ['development', 'production', 'test'] as const
});
```

### Custom validators

```ts
const isValidPort = (value: string): number => {
  const port = parseInt(value, 10);
  if (isNaN(port) || port < 1 || port > 65535) {
    throw new Error('Port must be between 1 and 65535');
  }
  return port;
};

const config = resolve({
  CUSTOM_PORT: isValidPort
});
```

### Multiple sources

```ts
import { resolve, processEnv, dotenv } from 'node-env-resolver';
import { resolveSecrets, awsSecrets } from 'node-env-resolver-aws';

// Single source
const config = await resolveSecrets({
  secretId: 'myapp/secrets'
}, {
  DATABASE_URL: 'url',
  API_KEY: 'string'
});

// Multiple sources (later overrides earlier)
const config = await resolve.with(
  [processEnv(), { PORT: 3000 }],
  [awsSecrets({ secretId: 'prod/secrets' }), { DATABASE_URL: 'url' }]
);

// Control merge behaviour
const config = await resolve.with(
  [dotenv(), { DATABASE_URL: 'url' }],
  [awsSecrets({ secretId: 'prod/secrets' }), { DATABASE_URL: 'url' }],
  { priority: 'first' }  // dotenv takes precedence
);
```

### Safe error handling

```ts
import { safeResolve } from 'node-env-resolver';

const result = safeResolve({
  PORT: 'number',
  DATABASE_URL: 'postgres'
});

if (result.success) {
  // Use result.data
} else {
  console.error(result.error);
  process.exit(1);
}
```

## Packages

| Package | Description |
|---------|-------------|
| [`node-env-resolver`](./packages/node-env-resolver) | Core package (zero dependencies) |
| [`node-env-resolver-aws`](./packages/node-env-resolver-aws) | AWS Secrets Manager and SSM Parameter Store |
| [`node-env-resolver/nextjs`](./packages/nextjs-resolver) | Next.js client/server split |

## Documentation

**[Core package documentation](./packages/node-env-resolver/README.md)** has complete API reference, advanced features, Zod integration, caching strategies, and framework-specific examples.

**[AWS package documentation](./packages/node-env-resolver-aws/README.md)** covers Secrets Manager, SSM Parameter Store, credential configuration, and caching best practices.

## Licence

MIT
