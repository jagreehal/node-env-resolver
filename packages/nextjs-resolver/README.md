# node-env-resolver-nextjs

Next.js integration with automatic client/server environment variable splitting.

[![npm version](https://img.shields.io/npm/v/node-env-resolver/nextjs)](https://www.npmjs.com/package/node-env-resolver/nextjs)

## Install

```bash
npm install node-env-resolver-nextjs
```

## Quick start

Create `env.mjs` in your project root:

```javascript
import { resolve } from 'node-env-resolver-nextjs';

export const env = resolve({
  server: {
    DATABASE_URL: 'url',
    RESEND_API_KEY: 'string',
  },
  client: {
    NEXT_PUBLIC_APP_URL: 'url',
    NEXT_PUBLIC_GA_ID: 'string?',
  }
});
```

Use in your app:

```typescript
// Server component or API route
import { env } from '../env.mjs';

console.log(env.server.DATABASE_URL);
console.log(env.client.NEXT_PUBLIC_APP_URL);
```

```typescript
// Client component
'use client';
import { env } from '../env.mjs';

console.log(env.client.NEXT_PUBLIC_GA_ID);        // ✓ Works
console.log(env.server.DATABASE_URL);              // ✗ Throws error
```

## Safe resolve (Zod-like pattern)

Like Zod's `parse()` vs `safeParse()`, you can choose between throwing errors or getting result objects:

```javascript
import { resolve, safeResolve } from 'node-env-resolver/nextjs';

// ❌ Throws on validation failure (like Zod's parse())
export const env = resolve({
  server: {
    DATABASE_URL: 'url',
    API_SECRET: 'string',
  },
  client: {
    NEXT_PUBLIC_APP_URL: 'url',
  }
});

// ✅ Returns result object (like Zod's safeParse())
const result = safeResolve({
  server: {
    DATABASE_URL: 'url',
    API_SECRET: 'string',
  },
  client: {
    NEXT_PUBLIC_APP_URL: 'url',
  }
});

if (result.success) {
  export const env = result.data;
  // env.server and env.client are fully typed
} else {
  console.error('Environment validation failed:', result.error);
  process.exit(1);
}
```

**Use cases:**
- `resolve()` - Throws on error (simpler, fail-fast)
- `safeResolve()` - Returns `{ success, data?, error? }` (graceful error handling)

## Features

- Automatic client/server split
- Runtime protection to prevent leaking server vars to client
- Full TypeScript support
- Works with Next.js 13+ App Router
- Zero configuration required

## Environment files

The package automatically loads from Next.js standard env files:

```bash
.env.defaults     # Shared defaults
.env              # Shared variables
.env.local        # Local overrides (gitignored)
.env.development  # Development
.env.production   # Production
```

Example `.env.local`:

```bash
# Server-only (no NEXT_PUBLIC_ prefix)
DATABASE_URL=postgres://localhost:5432/myapp
RESEND_API_KEY=re_abc123

# Client-accessible (NEXT_PUBLIC_ prefix required)
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_GA_ID=GA-123456
```

## Validation

Use the same shorthand syntax as the core package:

```javascript
export const env = resolve({
  server: {
    PORT: 3000,
    DATABASE_URL: 'url',
    NODE_ENV: ['development', 'test', 'production'] as const,
    API_KEY: 'string',
  },
  client: {
    NEXT_PUBLIC_API_URL: 'url',
    NEXT_PUBLIC_ENABLE_ANALYTICS: false,
    NEXT_PUBLIC_GA_ID: 'string?',
  }
});
```

TypeScript knows all the types:

```typescript
env.server.PORT;                    // number
env.server.DATABASE_URL;            // URL object
env.server.NODE_ENV;                // 'development' | 'test' | 'production'
env.client.NEXT_PUBLIC_API_URL;     // URL object
env.client.NEXT_PUBLIC_GA_ID;       // string | undefined
```

## Runtime protection

The package prevents server variables from being accessed in client code:

```typescript
'use client';
import { env } from './env.mjs';

console.log(env.server.DATABASE_URL);
// Error: Cannot access server environment variable 'DATABASE_URL' in client-side code.
// Server variables are only available in server components, API routes, and middleware.
```

This protection works in both development and production.

## Options

```javascript
export const env = resolve({
  server: { /* ... */ },
  client: { /* ... */ }
}, {
  clientPrefix: 'NEXT_PUBLIC_',     // Default prefix
  runtimeProtection: true,          // Enable runtime checks (default: true)
  expandVars: true,                 // Enable ${VAR} expansion (default: true)
});
```

## Custom resolvers

Add cloud resolvers or other sources:

```javascript
import { resolve } from 'node-env-resolver-nextjs';
import { awsSecrets } from 'node-env-resolver-aws';

export const env = resolve({
  server: {
    DATABASE_URL: 'url',
    API_KEY: 'string',
  },
  client: {
    NEXT_PUBLIC_APP_URL: 'url',
  }
}, {
  extend: [
    awsSecrets({ secretId: 'prod/app/secrets' }),
  ]
});
```

## Production security

In production, `.env` files are automatically ignored. Production platforms (Vercel, AWS) inject variables via `process.env`.

```javascript
export const env = resolve({
  server: {
    DATABASE_URL: 'url',
    API_SECRET: 'string',
  },
  client: {
    NEXT_PUBLIC_APP_URL: 'url',
  }
}, {
  policies: {
    // Allow specific vars from .env in production if needed
    allowDotenvInProduction: ['PORT', 'NODE_ENV'],

    // Enforce specific sources for sensitive data
    enforceAllowedSources: {
      DATABASE_URL: ['aws-secrets(prod/db)'],
    },
  },
});
```

## Example: SaaS app

```javascript
import { resolve } from 'node-env-resolver-nextjs';

export const env = resolve({
  server: {
    DATABASE_URL: 'url',
    NEXTAUTH_SECRET: 'string',
    NEXTAUTH_URL: 'url',
    STRIPE_SECRET_KEY: 'string',
    RESEND_API_KEY: 'string',
    NODE_ENV: ['development', 'test', 'production'] as const,
  },
  client: {
    NEXT_PUBLIC_APP_URL: 'url',
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: 'string',
    NEXT_PUBLIC_POSTHOG_KEY: 'string?',
  }
});
```

## Troubleshooting

**Variables not loading?**
- Check file names and locations
- Ensure client variables have `NEXT_PUBLIC_` prefix
- Restart dev server after adding new variables

**TypeScript errors?**
- Verify schema matches `.env` files
- Restart TypeScript server in your editor

**Production issues?**
- Check platform environment variables are set
- Ensure secrets aren't sourced from `.env` files
- Verify client variables are properly prefixed

## License

MIT
