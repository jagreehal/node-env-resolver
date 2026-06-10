# node-env-resolver-1password

1Password integration for node-env-resolver.

[![npm version](https://img.shields.io/npm/v/node-env-resolver-1password)](https://www.npmjs.com/package/node-env-resolver-1password)

## Install

```bash
npm install node-env-resolver-1password
```

## Quick start

### One-line convenience function (recommended)

```ts
import { resolveOnePassword } from 'node-env-resolver-1password';

// Using service account token
const config = await resolveOnePassword(
  {
    serviceAccountToken: process.env.OP_SERVICE_ACCOUNT_TOKEN,
    reference: 'op://vault/item/field',
  },
  { API_KEY: string() }
);

// Using 1Password Connect server
const config = await resolveOnePassword(
  {
    connectHost: 'https://connect.example.com',
    connectToken: process.env.OP_CONNECT_TOKEN,
    reference: 'op://vault/item/field',
  },
  { API_KEY: string() }
);
```

### Using with resolveAsync()

```ts
import { resolveAsync } from 'node-env-resolver';
import { onePassword } from 'node-env-resolver-1password';

const config = await resolveAsync({
  resolvers: [
    [
      onePassword({
        serviceAccountToken: process.env.OP_SERVICE_ACCOUNT_TOKEN,
        reference: 'op://vault/item/field',
      }),
      { API_KEY: string() },
    ],
  ],
});
```

## Features

- One-line convenience functions
- Service account token authentication
- 1Password Connect server support
- CLI-based service-account and app auth (`op` command)
- **Secret reference handlers** for URI-style dereferencing (`op://`)
- Safe (non-throwing) versions of all functions
- Full TypeScript support
- Zero dependencies

## Authentication Methods

### 1. Service Account Token (Recommended)

Generate a service account token in 1Password:
1. Go to 1Password Developer Tools
2. Create a service account
3. Copy the token (starts with `ops_`)

```ts
const config = await resolveOnePassword(
  {
    serviceAccountToken: process.env.OP_SERVICE_ACCOUNT_TOKEN,
    reference: 'op://vault/item/field',
  },
  { API_KEY: string() }
);
```

Note: service-account token and app-auth flows use the local `op` CLI.

### 2. 1Password Connect Server

For self-hosted Connect deployments:

```ts
const config = await resolveOnePassword(
  {
    connectHost: 'https://connect.example.com',
    connectToken: process.env.OP_CONNECT_TOKEN,
    reference: 'op://vault/item/field',
  },
  { API_KEY: string() }
);
```

## Secret Reference Handlers

Use URI-style references in your `.env` files:

```dotenv
# .env
API_KEY=op://Production/API/credential
DATABASE_URL=op://Production/Database/password
```

```ts
import { resolveAsync } from 'node-env-resolver';
import { createOnePasswordHandler } from 'node-env-resolver-1password';

const config = await resolveAsync({
  resolvers: [[dotenv(), schema]],
  references: {
    handlers: {
      'op': createOnePasswordHandler({
        serviceAccountToken: process.env.OP_SERVICE_ACCOUNT_TOKEN,
      }),
    },
  },
});
```

### Reference Format

```
op://vault/item/field              # Simple field
op://vault/item/section/field      # Field in a section
```

### Pre-configured Handler (from environment)

```ts
import { onePasswordHandlerFromEnv } from 'node-env-resolver-1password';

// Uses OP_SERVICE_ACCOUNT_TOKEN or OP_CONNECT_HOST+OP_CONNECT_TOKEN
const config = await resolveAsync({
  resolvers: [[dotenv(), schema]],
  references: {
    handlers: {
      'op': onePasswordHandlerFromEnv(),
    },
  },
});
```

## API Functions

### `resolveOnePassword(options, schema, resolveOptions?)`

Directly resolve from 1Password.

```ts
const config = await resolveOnePassword(
  {
    serviceAccountToken: process.env.OP_SERVICE_ACCOUNT_TOKEN,
    reference: 'op://vault/item/field',
  },
  { API_KEY: string() }
);
```

### `safeResolveOnePassword(options, schema, resolveOptions?)`

Safe version that returns a result object.

```ts
const result = await safeResolveOnePassword(
  {
    serviceAccountToken: process.env.OP_SERVICE_ACCOUNT_TOKEN,
    reference: 'op://vault/item/field',
  },
  { API_KEY: string() }
);

if (result.success) {
  console.log(result.data.API_KEY);
} else {
  console.error(result.error);
}
```

### `onePassword(options)`

Returns a resolver for use with `resolveAsync()`.

### `createOnePasswordHandler(options)`

Creates a reference handler for URI-style `op://` references.

## Configuration

### onePassword options

```ts
interface OnePasswordOptions {
  /** Service account token (ops_*) */
  serviceAccountToken?: string;
  /** Connect server URL */
  connectHost?: string;
  /** Connect server token */
  connectToken?: string;
  /** 1Password reference */
  reference: string;
  /** Optional override for target env key */
  envKey?: string;
  /** Optional account shorthand */
  account?: string;
}
```

## Requirements

- For `serviceAccountToken` or `allowAppAuth` usage, install the 1Password CLI (`op`).
- For Connect usage, `connectHost` + `connectToken` are sufficient.

## Licence

MIT
