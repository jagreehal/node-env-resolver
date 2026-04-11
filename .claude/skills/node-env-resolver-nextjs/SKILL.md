---
name: node-env-resolver-nextjs
description: 'Use when integrating node-env-resolver with Next.js for client/server env split, NEXT_PUBLIC_ prefix validation, App Router server/client components, or Proxy-guarded server vars.'
---

## Overview

`node-env-resolver-nextjs` provides zero-config Next.js integration with automatic client/server split. **Sync-only** — Next.js config files must be synchronous. Next.js handles `.env` file loading itself, so no custom resolvers are needed.

## Import Map

| Import path                | Exports                                                                                                            |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `node-env-resolver-nextjs` | `resolve`, `safeResolve`, `isServer`, `isClient`, all validators (re-exported from `node-env-resolver/validators`) |

No plugin export — Next.js has no equivalent to Vite plugins for env injection. No async variants — Next.js config must be sync.

## Config Shape

Always split into `server` and `client`:

```typescript
{
  server: {
    DATABASE_URL: postgres(),         // no NEXT_PUBLIC_ prefix — server only
    NEXTAUTH_SECRET: string(),
    STRIPE_SECRET_KEY: string(),
  },
  client: {
    NEXT_PUBLIC_API_URL: url(),       // MUST have NEXT_PUBLIC_ prefix
    NEXT_PUBLIC_APP_NAME: 'my-app',
  },
}
```

**Prefix rules (enforced at runtime):**

- Client keys MUST start with `NEXT_PUBLIC_` — throws if violated
- Server keys MUST NOT start with `NEXT_PUBLIC_` — throws if violated

## Resolution (env.ts)

```typescript
import { resolve, postgres, string, url } from 'node-env-resolver-nextjs';

export const env = resolve({
  server: {
    DATABASE_URL: postgres(),
    NEXTAUTH_SECRET: string(),
    STRIPE_SECRET_KEY: string(),
  },
  client: {
    NEXT_PUBLIC_API_URL: url(),
    NEXT_PUBLIC_APP_NAME: 'my-app',
    NEXT_PUBLIC_ENABLE_ANALYTICS: false,
  },
});
```

`resolve()` reads from `process.env` (Next.js already loads `.env` files into `process.env`).

## Safe Resolution

```typescript
import { safeResolve, postgres, string, url } from 'node-env-resolver-nextjs';

const result = safeResolve({
  server: { DATABASE_URL: postgres(), NEXTAUTH_SECRET: string() },
  client: { NEXT_PUBLIC_API_URL: url() },
});

if (!result.success) {
  console.error(result.error);
  process.exit(1);
}

export const env = result.data;
```

## Usage in Components

### Server Component (access both)

```typescript
// app/page.tsx
import { env } from '@/env';

export default async function Page() {
  const data = await db.query(env.server.DATABASE_URL);
  return <div>{env.client.NEXT_PUBLIC_APP_NAME}</div>;
}
```

### Client Component (client only)

```typescript
// components/analytics.tsx
'use client';
import { env } from '@/env';

export function Analytics() {
  // Client vars work fine
  const apiUrl = env.client.NEXT_PUBLIC_API_URL;

  // Server vars throw with helpful message:
  //   "Cannot access server environment variable 'DATABASE_URL' in client-side code.
  //    Consider: moving to client schema with NEXT_PUBLIC_ prefix,
  //    fetching via an API route, or using server actions"
  // env.server.DATABASE_URL  // throws!

  return <script src={`${apiUrl}/analytics.js`} />;
}
```

## Proxy Guard

The `server` object is a Proxy. In browser context (`typeof window !== 'undefined'`), any property access throws with suggestions:

- Move to client schema with `NEXT_PUBLIC_` prefix
- Fetch via API route
- Use server actions

Disable with `runtimeProtection: false` in options.

## Key Differences from Vite Package

| Feature            | `node-env-resolver-nextjs`                      | `node-env-resolver-vite`             |
| ------------------ | ----------------------------------------------- | ------------------------------------ |
| Prefix             | `NEXT_PUBLIC_`                                  | `VITE_`                              |
| Async resolution   | No — sync only                                  | Yes — `resolveAsyncFn`               |
| Plugin             | No                                              | Yes — `nodeEnvResolverPlugin`        |
| .env loading       | Next.js handles it (process.env)                | Uses `dotenv()` resolver             |
| Type generation    | No                                              | Yes — `generateTypes` option         |
| Reference handlers | No (use core `resolveAsync` directly if needed) | Yes — via `referenceHandlers` option |

## Common Agent Mistakes

| Mistake                                                   | Correct                                                                 |
| --------------------------------------------------------- | ----------------------------------------------------------------------- |
| `import { resolveAsync } from 'node-env-resolver-nextjs'` | No async variant. Use sync `resolve()`.                                 |
| Client key without `NEXT_PUBLIC_` prefix                  | All client keys MUST start with `NEXT_PUBLIC_`                          |
| Adding dotenv resolver                                    | Not needed — Next.js loads `.env` into `process.env` automatically      |
| Using `node-env-resolver-vite` for Next.js                | Use `node-env-resolver-nextjs` — different prefix, sync-only, no plugin |
| Flat schema without server/client split                   | Always use `{ server: {...}, client: {...} }`                           |
