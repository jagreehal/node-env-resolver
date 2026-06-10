# node-env-resolver-bitwarden

Bitwarden Secrets Manager integration for node-env-resolver.

[![npm version](https://img.shields.io/npm/v/node-env-resolver-bitwarden)](https://www.npmjs.com/package/node-env-resolver-bitwarden)

## Install

```bash
npm install node-env-resolver-bitwarden
```

## Quick start

### One-line convenience function (recommended)

```ts
import { resolveBitwarden } from 'node-env-resolver-bitwarden';

const config = await resolveBitwarden(
  {
    accessToken: process.env.BWS_ACCESS_TOKEN,
    secretId: '12345678-1234-1234-1234-123456789abc',
    envKey: 'API_KEY',
  },
  {
    API_KEY: string(),
  }
);
```

### Using with resolveAsync() (for combining multiple sources)

```ts
import { resolveAsync } from 'node-env-resolver';
import { bitwarden } from 'node-env-resolver-bitwarden';

const config = await resolveAsync({
  resolvers: [
    [
      bitwarden({
        accessToken: process.env.BWS_ACCESS_TOKEN,
        secretId: '12345678-1234-1234-1234-123456789abc',
        envKey: 'API_KEY',
      }),
      {
        API_KEY: string(),
      },
    ],
  ],
});
```

## Features

- One-line convenience functions for quick setup
- Load secrets from Bitwarden Secrets Manager
- **Secret reference handlers** for URI-style dereferencing (`bws://`)
- Safe (non-throwing) versions of all functions
- Automatic JWT authentication with caching
- Full TypeScript support
- Zero dependencies (uses native Web Crypto API)

## Secret Reference Handlers

Use URI-style references in your `.env` files instead of plaintext secrets:

```dotenv
# .env
API_KEY=bws://12345678-1234-1234-1234-123456789abc
DATABASE_URL=bws://87654321-4321-4321-4321-cba987654321
```

```ts
import { resolveAsync } from 'node-env-resolver';
import { createBitwardenHandler } from 'node-env-resolver-bitwarden';

const config = await resolveAsync({
  resolvers: [[dotenv(), schema]],
  references: {
    handlers: {
      'bws': createBitwardenHandler({
        accessToken: process.env.BWS_ACCESS_TOKEN,
      }),
    },
  },
});
```

### Secret Reference Format

```
bws://secret-uuid           # Fetch secret by UUID
```

### Pre-configured Handler (from environment)

```ts
import { bitwardenHandlerFromEnv } from 'node-env-resolver-bitwarden';

// Uses BWS_ACCESS_TOKEN environment variable
const config = await resolveAsync({
  resolvers: [[dotenv(), schema]],
  references: {
    handlers: {
      'bws': bitwardenHandlerFromEnv(),
    },
  },
});
```

## Getting a Bitwarden Access Token

1. Go to Bitwarden Secrets Manager
2. Create a **Machine Account**
3. Generate an **Access Token** for that machine account
4. Grant the machine account access to the secrets it needs
5. Copy the access token (format: `0.<client_id>.<client_secret>:<encryption_key>`)

## Performance and caching

Bitwarden API calls involve authentication and encryption overhead. The client automatically:

- Caches JWT tokens until they expire (with 60s safety margin)
- Prevents parallel authentication requests (rate limit protection)

### With caching wrapper (recommended for production)

```ts
import { resolveAsync, cached, TTL } from 'node-env-resolver';
import { bitwarden } from 'node-env-resolver-bitwarden';

const getConfig = async () => {
  return await resolveAsync({
    resolvers: [
      [
        cached(
          bitwarden({
            accessToken: process.env.BWS_ACCESS_TOKEN,
            secretId: '12345678-1234-1234-1234-123456789abc',
          }),
          {
            ttl: TTL.minutes5,
            maxAge: TTL.hour,
            staleWhileRevalidate: true,
          }
        ),
        {
          API_KEY: string(),
        },
      ],
    ],
  });
};
```

### AWS Lambda

```ts
import { resolveBitwarden } from 'node-env-resolver-bitwarden';

const getConfig = async () => {
  return await resolveBitwarden(
    {
      accessToken: process.env.BWS_ACCESS_TOKEN,
      secretId: '12345678-1234-1234-1234-123456789abc',
    },
    {
      API_KEY: string(),
    }
  );
};

export const handler = async (event) => {
  const config = await getConfig();
  // Lambda container reuse = JWT cache persists across invocations
};
```

## API Functions

### Convenience Functions

#### `resolveBitwarden(options, schema, resolveOptions?)`

Directly resolve environment variables from Bitwarden Secrets Manager.

```ts
import { resolveBitwarden } from 'node-env-resolver-bitwarden';

const config = await resolveBitwarden(
  {
    accessToken: process.env.BWS_ACCESS_TOKEN,
    secretId: '12345678-1234-1234-1234-123456789abc',
  },
  {
    API_KEY: string(),
  }
);
```

#### `safeResolveBitwarden(options, schema, resolveOptions?)`

Safe version that returns a result object instead of throwing.

```ts
import { safeResolveBitwarden } from 'node-env-resolver-bitwarden';

const result = await safeResolveBitwarden(
  {
    accessToken: process.env.BWS_ACCESS_TOKEN,
    secretId: '12345678-1234-1234-1234-123456789abc',
  },
  {
    API_KEY: string(),
  }
);

if (result.success) {
  console.log(result.data.API_KEY);
} else {
  console.error(result.error);
}
```

### Resolver Functions (for use with `resolveAsync()`)

#### `bitwarden(options)`

Returns a resolver object for use with `resolveAsync()` when you need to combine multiple sources.

#### `createBitwardenHandler(options)`

Creates a reference handler for URI-style `bws://` references.

#### `bitwardenHandlerFromEnv()`

Pre-configured handler that reads `BWS_ACCESS_TOKEN` from environment.

## Configuration

### bitwarden options

```ts
interface BitwardenOptions {
  /** Bitwarden Secrets Manager access token (machine account) */
  accessToken: string;
  /** Secret UUID to fetch */
  secretId: string;
  /** Override target env key (defaults to Bitwarden secret key field) */
  envKey?: string;
  /** API URL - defaults to https://api.bitwarden.com */
  apiUrl?: string;
  /** Identity URL - defaults to https://identity.bitwarden.com */
  identityUrl?: string;
}
```

### createBitwardenHandler options

```ts
interface BitwardenHandlerOptions {
  /** Bitwarden Secrets Manager access token (machine account) */
  accessToken: string;
  /** API URL - defaults to https://api.bitwarden.com */
  apiUrl?: string;
  /** Identity URL - defaults to https://identity.bitwarden.com */
  identityUrl?: string;
}
```

## Examples

### Production app with one-line function

```ts
import { resolveBitwarden } from 'node-env-resolver-bitwarden';

const secrets = await resolveBitwarden(
  {
    accessToken: process.env.BWS_ACCESS_TOKEN,
    secretId: '12345678-1234-1234-1234-123456789abc',
  },
  {
    API_KEY: string(),
    DATABASE_URL: string(),
  }
);
```

### Production app with resolveAsync() (combining sources)

```ts
import { resolveAsync, processEnv } from 'node-env-resolver';
import { bitwarden } from 'node-env-resolver-bitwarden';

const config = await resolveAsync({
  resolvers: [
    [
      processEnv(),
      {
        NODE_ENV: ['development', 'production'] as const,
        PORT: 3000,
      },
    ],
    [
      bitwarden({
        accessToken: process.env.BWS_ACCESS_TOKEN,
        secretId: '12345678-1234-1234-1234-123456789abc',
      }),
      {
        API_KEY: string(),
        DATABASE_URL: string(),
      },
    ],
  ],
});
```

### Lambda function

```ts
import { resolveBitwarden } from 'node-env-resolver-bitwarden';

const getConfig = async () => {
  return await resolveBitwarden(
    {
      accessToken: process.env.BWS_ACCESS_TOKEN,
      secretId: '12345678-1234-1234-1234-123456789abc',
    },
    {
      API_KEY: string(),
    }
  );
};

export const handler = async (event) => {
  const config = await getConfig();
  // Use config
};
```

### Reference-first deployment (pointer-in-env)

```dotenv
# .env
STRIPE_KEY=bws://abc12345-1234-1234-1234-123456789abc
```

```ts
import { resolveAsync, strictReferenceResolveOptions } from 'node-env-resolver';
import { createBitwardenHandler } from 'node-env-resolver-bitwarden';

const config = await resolveAsync({
  resolvers: [[processEnv(), { STRIPE_KEY: string() }]],
  references: {
    handlers: {
      'bws': createBitwardenHandler({
        accessToken: process.env.BWS_ACCESS_TOKEN,
      }),
    },
  },
  options: strictReferenceResolveOptions({
    sensitiveKeys: ['STRIPE_KEY'],
    secretSources: ['bitwarden'],
  }),
});
```

## Error handling

### With safe functions (recommended)

```ts
import { safeResolveBitwarden } from 'node-env-resolver-bitwarden';

const result = await safeResolveBitwarden(
  {
    accessToken: process.env.BWS_ACCESS_TOKEN,
    secretId: '12345678-1234-1234-1234-123456789abc',
  },
  {
    API_KEY: string(),
  }
);

if (!result.success) {
  console.error('Failed to load secrets:', result.error);
  process.exit(1);
}

// Use result.data safely
console.log(result.data.API_KEY);
```

### With try-catch

```ts
import { resolveBitwarden } from 'node-env-resolver-bitwarden';

try {
  const config = await resolveBitwarden(
    {
      accessToken: process.env.BWS_ACCESS_TOKEN,
      secretId: '12345678-1234-1234-1234-123456789abc',
    },
    {
      API_KEY: string(),
    }
  );
} catch (error) {
  console.error('Failed to load secrets from Bitwarden:', error);
}
```

## Troubleshooting

**Invalid access token format**

- Verify your access token matches the format: `0.<client_id>.<client_secret>:<encryption_key>`
- Generate a new token from Bitwarden Secrets Manager if needed

**Secret not found (404)**

- Verify the secret ID is a valid UUID
- Check if the secret exists in your Bitwarden Secrets Manager
- Ensure your machine account has access to this secret or its project

**Access denied (401/403)**

- Verify your machine account has "Can read" or "Can read, write" permissions
- Check that the machine account has access to this secret or its project
- Review the role assignments in Bitwarden Secrets Manager

**Authentication failed**

- Verify the access token is correct
- Check if the access token has expired or been revoked
- Ensure the machine account is not disabled

## Licence

MIT
