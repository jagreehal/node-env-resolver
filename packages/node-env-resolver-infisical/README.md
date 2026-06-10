# node-env-resolver-infisical

Infisical integration for node-env-resolver.

[![npm version](https://img.shields.io/npm/v/node-env-resolver-infisical)](https://www.npmjs.com/package/node-env-resolver-infisical)

## Install

```bash
npm install node-env-resolver-infisical
```

## Quick start

### One-line convenience function

```ts
import { resolveInfisical } from 'node-env-resolver-infisical';

const config = await resolveInfisical(
  {
    clientId: process.env.INFISICAL_CLIENT_ID,
    clientSecret: process.env.INFISICAL_CLIENT_SECRET,
    projectId: 'your-project-id',
    environment: 'dev',
    secretName: 'API_KEY',
  },
  { API_KEY: string() }
);
```

### Using with resolveAsync()

```ts
import { resolveAsync } from 'node-env-resolver';
import { infisical } from 'node-env-resolver-infisical';

const config = await resolveAsync({
  resolvers: [
    [
      infisical({
        clientId: process.env.INFISICAL_CLIENT_ID,
        clientSecret: process.env.INFISICAL_CLIENT_SECRET,
        projectId: 'your-project-id',
        environment: 'dev',
        secretName: 'API_KEY',
      }),
      { API_KEY: string() },
    ],
  ],
});
```

## Features

- One-line convenience functions
- Universal Auth (machine identity) support
- Self-hosted Infisical support
- **Secret reference handlers** for URI-style dereferencing (`infisical://`)
- Safe (non-throwing) versions
- Full TypeScript support
- Zero dependencies

## Getting Started

1. Go to [infisical.com](https://infisical.com) and create an account
2. Create a project and add your secrets
3. Go to **Project Settings > Machine Identities**
4. Create a machine identity with Universal Auth
5. Copy the **Client ID** and **Client Secret**

## Secret Reference Handlers

```dotenv
# .env
API_KEY=infisical://API_KEY
DATABASE_URL=infisical://DATABASE_URL
```

```ts
import { resolveAsync } from 'node-env-resolver';
import { createInfisicalHandler } from 'node-env-resolver-infisical';

const config = await resolveAsync({
  resolvers: [[dotenv(), schema]],
  references: {
    handlers: {
      'infisical': createInfisicalHandler({
        clientId: process.env.INFISICAL_CLIENT_ID,
        clientSecret: process.env.INFISICAL_CLIENT_SECRET,
        projectId: 'your-project-id',
        environment: 'dev',
      }),
    },
  },
});
```

### Self-hosted Infisical

```ts
const handler = createInfisicalHandler({
  clientId: process.env.INFISICAL_CLIENT_ID,
  clientSecret: process.env.INFISICAL_CLIENT_SECRET,
  projectId: 'your-project-id',
  environment: 'dev',
  siteUrl: 'https://infisical.yourcompany.com',
});
```

## API Functions

### `resolveInfisical(options, schema, resolveOptions?)`

```ts
const config = await resolveInfisical(
  {
    clientId: process.env.INFISICAL_CLIENT_ID,
    clientSecret: process.env.INFISICAL_CLIENT_SECRET,
    projectId: 'your-project-id',
    environment: 'dev',
    secretName: 'API_KEY',
  },
  { API_KEY: string() }
);
```

### `safeResolveInfisical(options, schema, resolveOptions?)`

Safe version that returns a result object.

### `infisical(options)`

Returns a resolver for use with `resolveAsync()`.

### `createInfisicalHandler(options)`

Creates a reference handler for URI-style `infisical://` references.

### `infisicalHandlerFromEnv(projectId, environment, options?)`

Pre-configured handler using INFISICAL_CLIENT_ID and INFISICAL_CLIENT_SECRET env vars.

## Configuration

```ts
interface InfisicalOptions {
  clientId: string;         // Universal Auth Client ID
  clientSecret: string;     // Universal Auth Client Secret
  projectId: string;        // Infisical project ID
  environment: string;      // Environment (dev, staging, prod)
  secretName: string;       // Secret name to fetch
  envKey?: string;          // Optional override for target env key
  secretPath?: string;      // Optional path (default: /)
  siteUrl?: string;         // Optional custom URL for self-hosted
}
```

## Licence

MIT
