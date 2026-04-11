---
name: node-env-resolver-vite
description: 'Use when integrating node-env-resolver with Vite for client/server env split, VITE_ prefix validation, build-time env injection, ImportMetaEnv type generation, or Proxy-guarded server vars.'
---

## Overview

`node-env-resolver-vite` provides zero-config Vite integration with automatic client/server split. Server vars are Proxy-guarded against browser access. Client vars must use the `VITE_` prefix.

## Import Map

| Import path                     | Exports                                                                                                                              |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `node-env-resolver-vite`        | `resolve`, `resolveAsyncFn`, `safeResolve`, `isServer`, `isClient`, all validators (re-exported from `node-env-resolver/validators`) |
| `node-env-resolver-vite/plugin` | `nodeEnvResolverPlugin`                                                                                                              |

Validators can be imported from either `node-env-resolver-vite` or `node-env-resolver/validators` — both work.

## Config Shape

Always split into `server` and `client`:

```typescript
{
  server: {
    DATABASE_URL: postgres(),    // no VITE_ prefix — server only
    API_SECRET: string(),
  },
  client: {
    VITE_API_URL: url(),         // MUST have VITE_ prefix
    VITE_APP_NAME: 'my-app',
  },
}
```

**Prefix rules (enforced at runtime):**

- Client keys MUST start with `VITE_` — throws if violated
- Server keys MUST NOT start with `VITE_` — throws if violated

## Sync Resolution (env.ts)

```typescript
import { resolve, postgres, string, url } from 'node-env-resolver-vite';

const env = resolve({
  server: {
    DATABASE_URL: postgres(),
    API_SECRET: string(),
  },
  client: {
    VITE_API_URL: url(),
    VITE_APP_NAME: 'my-app',
  },
});

export const { server, client } = env;
```

`resolve()` reads from `process.env`. The `server` object is a Proxy that throws if accessed when `typeof window !== 'undefined'`.

## Async Resolution (with reference handlers)

```typescript
import { resolveAsyncFn, postgres, string, url } from 'node-env-resolver-vite';
import { createAwsSecretHandler } from 'node-env-resolver-aws/handlers';

const env = await resolveAsyncFn(
  {
    server: {
      DATABASE_URL: postgres(), // value can be aws-sm://prod/db#url
      API_SECRET: string(),
    },
    client: {
      VITE_API_URL: url(),
      VITE_APP_NAME: 'my-app',
    },
  },
  {
    referenceHandlers: {
      'aws-sm': createAwsSecretHandler({ region: 'us-east-1' }),
    },
  }
);
```

`resolveAsyncFn` uses `dotenv()` as the resolver (not `processEnv()`). Resolves server and client schemas in parallel.

## Vite Plugin (vite.config.ts)

```typescript
import { defineConfig } from 'vite';
import { nodeEnvResolverPlugin } from 'node-env-resolver-vite/plugin';
import { postgres, string, url } from 'node-env-resolver-vite';

export default defineConfig({
  plugins: [
    nodeEnvResolverPlugin(
      {
        server: {
          DATABASE_URL: postgres(),
          API_SECRET: string(),
        },
        client: {
          VITE_API_URL: url(),
          VITE_APP_NAME: 'my-app',
        },
      },
      {
        injectClientEnv: true, // default: true — replaces import.meta.env.VITE_*
        generateTypes: 'src/vite-env.d.ts', // auto-generate ImportMetaEnv interface
        async: true, // use resolveAsyncFn internally (needed for reference handlers)
        referenceHandlers: {
          // only with async: true
          'aws-sm': createAwsSecretHandler({ region: 'us-east-1' }),
        },
      }
    ),
  ],
});
```

**Plugin behavior:**

- Runs in the `config` hook — validates and resolves all env vars
- `injectClientEnv: true` adds `define` entries for each `import.meta.env.VITE_*`
- `generateTypes` writes a `.d.ts` file during dev `configResolved` hook (only overwrites if file contains the auto-generation marker)

## Safe Resolution

```typescript
import { safeResolve, string, url } from 'node-env-resolver-vite';

const result = safeResolve({
  server: { API_SECRET: string() },
  client: { VITE_API_URL: url() },
});

if (result.success) {
  const { server, client } = result.data;
} else {
  console.error(result.error);
  process.exit(1);
}
```

## Proxy Guard

The `server` object is a Proxy. In browser context (`typeof window !== 'undefined'`), any property access throws:

```
Error: Cannot access server env var 'DATABASE_URL' in client code
```

This prevents accidental secret leakage in client components. Disable with `runtimeProtection: false`.

**Testing escape hatch:** Set `globalThis.__NODE_ENV_RESOLVER_VITE_IS_BROWSER` to a function returning `boolean` to override browser detection in Node.js tests.

## Environment Flags

```typescript
import { isServer, isClient } from 'node-env-resolver-vite';

if (isServer) {
  /* SSR / server code */
}
if (isClient) {
  /* browser code */
}
```

## Common Agent Mistakes

| Mistake                                                | Correct                                                                                         |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| Client key without `VITE_` prefix                      | All client keys MUST start with `VITE_`                                                         |
| Server key with `VITE_` prefix                         | Server keys MUST NOT start with `VITE_`                                                         |
| `import { resolve } from 'node-env-resolver'` for Vite | `import { resolve } from 'node-env-resolver-vite'` (different API — takes `{ server, client }`) |
| Using `resolveAsync` from core package                 | Use `resolveAsyncFn` from `node-env-resolver-vite` (wraps dotenv + reference handlers)          |
| Flat schema without server/client split                | Always use `{ server: {...}, client: {...} }`                                                   |
| Plugin with one argument                               | `nodeEnvResolverPlugin(config, options)` — config and options are separate args                 |
