# node-env-resolver-doppler

Doppler integration for node-env-resolver.

[![npm version](https://img.shields.io/npm/v/node-env-resolver-doppler)](https://www.npmjs.com/package/node-env-resolver-doppler)

## Install

```bash
npm install node-env-resolver-doppler
```

## Quick start

### One-line convenience function

```ts
import { resolveDoppler } from 'node-env-resolver-doppler';

const config = await resolveDoppler(
  {
    serviceToken: process.env.DOPPLER_TOKEN,
    project: 'my-project',
    config: 'dev',
    secretName: 'API_KEY',
  },
  { API_KEY: string() }
);
```

### Using with resolveAsync()

```ts
import { resolveAsync } from 'node-env-resolver';
import { doppler } from 'node-env-resolver-doppler';

const config = await resolveAsync({
  resolvers: [
    [
      doppler({
        serviceToken: process.env.DOPPLER_TOKEN,
        project: 'my-project',
        config: 'dev',
        secretName: 'API_KEY',
      }),
      { API_KEY: string() },
    ],
  ],
});
```

## Features

- One-line convenience functions
- Service token authentication
- **Secret reference handlers** for URI-style dereferencing (`doppler://`)
- Smart caching (fetches all secrets in one API call)
- Safe (non-throwing) versions
- Full TypeScript support
- Zero dependencies

## Getting Started

1. Go to [doppler.com](https://doppler.com) and create an account
2. Create a project and configs (dev, stg, prd)
3. Add your secrets
4. Go to **Project > Access** and create a Service Token
5. Copy the token

## Secret Reference Handlers

```dotenv
# .env
API_KEY=doppler://API_KEY
DATABASE_URL=doppler://DATABASE_URL
```

```ts
import { resolveAsync } from 'node-env-resolver';
import { createDopplerHandler } from 'node-env-resolver-doppler';

const config = await resolveAsync({
  resolvers: [[dotenv(), schema]],
  references: {
    handlers: {
      'doppler': createDopplerHandler({
        serviceToken: process.env.DOPPLER_TOKEN,
        project: 'my-project',
        config: 'dev',
      }),
    },
  },
});
```

### Pre-configured Handler

```ts
import { dopplerHandlerFromEnv } from 'node-env-resolver-doppler';

const config = await resolveAsync({
  resolvers: [[dotenv(), schema]],
  references: {
    handlers: {
      'doppler': dopplerHandlerFromEnv('my-project', 'dev'),
    },
  },
});
```

## API Functions

### `resolveDoppler(options, schema, resolveOptions?)`

```ts
const config = await resolveDoppler(
  {
    serviceToken: process.env.DOPPLER_TOKEN,
    project: 'my-project',
    config: 'dev',
    secretName: 'API_KEY',
  },
  { API_KEY: string() }
);
```

### `safeResolveDoppler(options, schema, resolveOptions?)`

Safe version that returns a result object.

### `doppler(options)`

Returns a resolver for use with `resolveAsync()`.

### `createDopplerHandler(options)`

Creates a reference handler for URI-style `doppler://` references.

### `dopplerHandlerFromEnv(project, config)`

Pre-configured handler using DOPPLER_TOKEN env var.

## Configuration

```ts
interface DopplerOptions {
  serviceToken: string;  // Doppler service token
  project: string;       // Project name
  config: string;        // Config name (dev, stg, prd)
  secretName: string;    // Secret name
  envKey?: string;       // Optional override for target env key
}
```

### `dopplerBulk(options)`

Loads all secrets for a project/config in one resolver call.

## Performance

Doppler client automatically caches all secrets from a project/config on the first request, so multiple secret lookups share a single API call.

## Licence

MIT
