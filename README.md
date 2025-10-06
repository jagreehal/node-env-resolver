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

const config = await resolve({
  PORT: 3000,
  NODE_ENV: ['development', 'production'] as const,
  DATABASE_URL: 'postgres',
  DEBUG: false
});
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

Load configuration from different sources:

```ts
import { resolve, processEnv, dotenv } from 'node-env-resolver';
import { awsSecrets } from '@node-env-resolver/aws';

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
```

### Next.js

Automatic client/server environment variable splitting:

```ts
// env.mjs
import { resolveNextEnv } from '@node-env-resolver/nextjs';

export const env = resolveNextEnv({
  server: {
    DATABASE_URL: 'url',
    API_SECRET: 'string',
  },
  client: {
    NEXT_PUBLIC_APP_URL: 'url',
    NEXT_PUBLIC_GA_ID: 'string?',
  }
});
```

## Packages

- **`node-env-resolver`** - Core package with zero dependencies
- **`@node-env-resolver/aws`** - AWS Secrets Manager & SSM integration
- **`@node-env-resolver/nextjs`** - Next.js client/server split

## Documentation

See the individual package READMEs for detailed documentation:

- [Core package](./packages/node-env-resolver/README.md)
- [AWS integration](./packages/node-env-resolver-aws/README.md)
- [Next.js integration](./packages/nextjs-resolver/README.md)

## License

MIT © [Jagvinder Singh Reehal](https://jagreehal.com)
