# node-env-resolver-vite

Vite integration with automatic client/server environment variable splitting.

[![npm version](https://img.shields.io/npm/v/node-env-resolver-vite)](https://www.npmjs.com/package/node-env-resolver-vite)

## Features

- ✅ Automatic client/server split
- ✅ Runtime protection to prevent leaking server vars to client
- ✅ Full TypeScript support with IntelliSense
- ✅ **Auto-generate TypeScript definitions** for `import.meta.env`
- ✅ Works with Vite 4.x, 5.x, 6.x, and 7.x
- ✅ Framework agnostic (Vue, React, Svelte, Solid, Astro)
- ✅ Zero configuration required
- ✅ Supports all validator types (basic and advanced)
- ✅ Optional Vite plugin for config-time integration

## Install

```bash
npm install node-env-resolver-vite
# or
pnpm add node-env-resolver-vite
# or
yarn add node-env-resolver-vite
```

## Quick Start

Create `env.ts` in your project root:

```typescript
import { resolve } from 'node-env-resolver-vite';

export const env = resolve({
  server: {
    DATABASE_URL: 'postgres',
    API_SECRET: 'string',
    PORT: 'port:5173',
  },
  client: {
    VITE_API_URL: 'url',
    VITE_ENABLE_ANALYTICS: false,
    VITE_GA_ID: 'string?',
  }
});
```

Use in your app:

```typescript
// Server code (vite.config.ts, SSR, Node.js)
import { env } from './env';

console.log(env.server.DATABASE_URL);    // ✅ Works
console.log(env.client.VITE_API_URL);     // ✅ Works
```

```typescript
// Client code (browser)
import { env } from './env';

console.log(env.client.VITE_API_URL);     // ✅ Works
console.log(env.server.DATABASE_URL);     // ❌ Throws error
```

## Safe Resolve (Zod-like Pattern)

Like Zod's `parse()` vs `safeParse()`, you can choose between throwing errors or getting result objects:

```typescript
import { resolve, safeResolve } from 'node-env-resolver-vite';

// ❌ Throws on validation failure (like Zod's parse())
export const env = resolve({
  server: {
    DATABASE_URL: 'postgres',
    API_SECRET: 'string',
  },
  client: {
    VITE_API_URL: 'url',
  }
});

// ✅ Returns result object (like Zod's safeParse())
const result = safeResolve({
  server: {
    DATABASE_URL: 'postgres',
    API_SECRET: 'string',
  },
  client: {
    VITE_API_URL: 'url',
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

## Environment Files

The package automatically loads from Vite's standard env files:

```bash
.env                # Loaded in all cases
.env.local          # Local overrides (gitignored)
.env.[mode]         # Mode-specific (e.g., .env.development)
.env.[mode].local   # Mode-specific local overrides
```

Example `.env.local`:

```bash
# Server-only (no VITE_ prefix)
DATABASE_URL=postgres://localhost:5432/myapp
API_SECRET=secret123
PORT=5173

# Client-accessible (VITE_ prefix required)
VITE_API_URL=https://api.example.com
VITE_ENABLE_ANALYTICS=false
VITE_GA_ID=GA-123456
```

## Validation

Use the same shorthand syntax as the core package:

```typescript
export const env = resolve({
  server: {
    PORT: 'port:5173',
    DATABASE_URL: 'postgres',
    NODE_ENV: ['development', 'production', 'test'] as const,
    API_KEY: 'string',
    MAX_CONNECTIONS: 'number',
    TIMEOUT: 'duration',  // e.g., '30s', '5m'
  },
  client: {
    VITE_API_URL: 'url',
    VITE_ENABLE_ANALYTICS: false,
    VITE_GA_ID: 'string?',
    VITE_FEATURE_FLAGS: 'string[]',  // Comma-separated
  }
});
```

TypeScript knows all the types:

```typescript
env.server.PORT;                    // number
env.server.DATABASE_URL;            // string
env.server.NODE_ENV;                // 'development' | 'production' | 'test'
env.server.MAX_CONNECTIONS;         // number
env.server.TIMEOUT;                 // number (milliseconds)
env.client.VITE_API_URL;            // string
env.client.VITE_ENABLE_ANALYTICS;   // boolean
env.client.VITE_GA_ID;              // string | undefined
env.client.VITE_FEATURE_FLAGS;      // string[]
```

## Runtime Protection

The package prevents server variables from being accessed in client code:

```typescript
// Client code (browser)
import { env } from './env';

console.log(env.server.DATABASE_URL);
// Error: Cannot access server environment variable 'DATABASE_URL' in client-side code.
// Server variables are only available in server context (vite.config.ts, SSR, build scripts).
// If you need this data on the client, consider:
//   - Moving it to the client schema with VITE_ prefix
//   - Fetching it via an API endpoint
//   - Using SSR to pass data to client components
```

This protection works in both development and production.

## TypeScript IntelliSense

### Auto-Generate Types (Recommended)

Use the Vite plugin to automatically generate TypeScript definitions:

```typescript
// vite.config.ts
import { defineConfig } from 'vite';
import { nodeEnvResolverPlugin } from 'node-env-resolver-vite/plugin';

export default defineConfig({
  plugins: [
    nodeEnvResolverPlugin({
      server: {
        DATABASE_URL: 'postgres',
        API_SECRET: 'string',
      },
      client: {
        VITE_API_URL: 'url',
        VITE_ENABLE_ANALYTICS: false,
        VITE_GA_ID: 'string?',
      },
      generateTypes: 'src/vite-env.d.ts'  // ✨ Auto-generates types!
    })
  ]
});
```

This automatically generates `src/vite-env.d.ts` with proper TypeScript types:

```typescript
/// <reference types="vite/client" />

/**
 * Auto-generated by node-env-resolver-vite
 * DO NOT EDIT MANUALLY - Changes will be overwritten
 */

interface ImportMetaEnv {
  readonly VITE_API_URL: string
  readonly VITE_ENABLE_ANALYTICS: boolean
  readonly VITE_GA_ID: string | undefined
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
```

**Features:**
- ✅ Types auto-update when you change your schema
- ✅ Proper type inference (url → string, false → boolean, etc.)
- ✅ Won't overwrite files with custom content
- ✅ Only runs in development mode

### Manual Types (Alternative)

You can also manually create `vite-env.d.ts`:

```typescript
/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string
  readonly VITE_ENABLE_ANALYTICS: boolean
  readonly VITE_GA_ID?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
```

This gives you autocomplete for `import.meta.env.VITE_*` in your IDE.

## Vite Plugin

For config-time integration and auto-generated types, use the Vite plugin:

```typescript
// vite.config.ts
import { defineConfig } from 'vite';
import { nodeEnvResolverPlugin } from 'node-env-resolver-vite/plugin';

export default defineConfig({
  plugins: [
    nodeEnvResolverPlugin({
      server: {
        DATABASE_URL: 'postgres',
        API_SECRET: 'string',
      },
      client: {
        VITE_API_URL: 'url',
        VITE_ENABLE_ANALYTICS: false,
      },
      // Auto-generate TypeScript definitions (optional)
      generateTypes: 'src/vite-env.d.ts'
    })
  ]
});
```

**Plugin Features:**
- ✅ Validates env vars at config resolution time
- ✅ Fails fast if validation errors occur
- ✅ Logs validation status
- ✅ Auto-generates TypeScript definitions
- ✅ Optionally injects client vars into Vite's define

## Options

```typescript
export const env = resolve({
  server: { /* ... */ },
  client: { /* ... */ }
}, {
  clientPrefix: 'VITE_',         // Default prefix
  runtimeProtection: true,        // Enable runtime checks (default: true)
  expandVars: true,               // Enable ${VAR} expansion (default: true)
});
```

## Framework Examples

### React + Vite

```typescript
// env.ts
import { resolve } from 'node-env-resolver-vite';

export const env = resolve({
  server: {
    DATABASE_URL: 'postgres',
  },
  client: {
    VITE_API_URL: 'url',
  }
});

// App.tsx
import { env } from './env';

function App() {
  return <div>API: {env.client.VITE_API_URL}</div>;
}
```

### Vue + Vite

```typescript
// env.ts
import { resolve } from 'node-env-resolver-vite';

export const env = resolve({
  server: {},
  client: {
    VITE_API_URL: 'url',
  }
});

// App.vue
<script setup lang="ts">
import { env } from './env';
</script>

<template>
  <div>API: {{ env.client.VITE_API_URL }}</div>
</template>
```

### SvelteKit + Vite

```typescript
// env.ts
import { resolve } from 'node-env-resolver-vite';

export const env = resolve({
  server: {
    DATABASE_URL: 'postgres',
  },
  client: {
    VITE_PUBLIC_API_URL: 'url',
  }
}, {
  clientPrefix: 'VITE_PUBLIC_'  // SvelteKit uses PUBLIC_ internally
});
```

### Solid + Vite

```typescript
// env.ts
import { resolve } from 'node-env-resolver-vite';

export const env = resolve({
  server: {},
  client: {
    VITE_API_URL: 'url',
  }
});

// App.tsx
import { env } from './env';

function App() {
  return <div>API: {env.client.VITE_API_URL}</div>;
}
```

### Astro + Vite

```typescript
// env.ts
import { resolve } from 'node-env-resolver-vite';

export const env = resolve({
  server: {
    DATABASE_URL: 'postgres',
  },
  client: {
    VITE_PUBLIC_API_URL: 'url',
  }
}, {
  clientPrefix: 'VITE_PUBLIC_'  // Astro convention
});
```

## SSR Support

Works seamlessly with Vite's SSR mode:

```typescript
// server.ts (SSR entry)
import { env } from './env';

// Both server and client vars accessible in SSR context
console.log(env.server.DATABASE_URL);   // ✅ Works
console.log(env.client.VITE_API_URL);   // ✅ Works

// client.ts (browser entry)
import { env } from './env';

console.log(env.server.DATABASE_URL);   // ❌ Throws error
console.log(env.client.VITE_API_URL);   // ✅ Works
```

## Production Security

In production, `.env` files are automatically ignored. Production platforms inject variables via `process.env`.

```typescript
export const env = resolve({
  server: {
    DATABASE_URL: 'postgres',
    API_SECRET: 'string',
  },
  client: {
    VITE_API_URL: 'url',
  }
});
```

**Best practices:**
- Never commit `.env.local` files
- Use platform environment variables in production (Vercel, Netlify, AWS, etc.)
- Keep server secrets in `server` schema only
- Only expose public data in `client` schema

## Complete Example

```typescript
// env.ts
import { resolve } from 'node-env-resolver-vite';

export const env = resolve({
  server: {
    // Database
    DATABASE_URL: 'postgres',
    DB_POOL_SIZE: 10,

    // External APIs
    STRIPE_SECRET_KEY: 'string',
    OPENAI_API_KEY: 'string',
    
    // App configuration
    NODE_ENV: ['development', 'production', 'test'] as const,
    PORT: 'port:5173',
    LOG_LEVEL: ['debug', 'info', 'warn', 'error'] as const,
  },
  client: {
    // Public API endpoints
    VITE_API_URL: 'url',
    VITE_WS_URL: 'url',
    
    // Feature flags
    VITE_ENABLE_ANALYTICS: false,
    VITE_ENABLE_DARK_MODE: true,
    VITE_FEATURE_FLAGS: 'string[]',
    
    // Public keys
    VITE_STRIPE_PUBLISHABLE_KEY: 'string',
    VITE_GA_ID: 'string?',
    
    // App info
    VITE_APP_VERSION: 'string',
  }
});
```

## Troubleshooting

**Variables not loading?**
- Check file names and locations
- Ensure client variables have `VITE_` prefix
- Restart dev server after adding new variables
- Verify `.env` files are in project root

**TypeScript errors?**
- Verify schema matches `.env` files
- Restart TypeScript server in your editor
- Check for typos in variable names

**Runtime errors in browser?**
- Don't access `env.server.*` in client code
- Use `env.client.*` for browser-accessible values
- Check browser console for helpful error messages

**Production issues?**
- Verify platform environment variables are set
- Ensure secrets aren't sourced from `.env` files
- Confirm client variables are properly prefixed with `VITE_`

## Migration from Vite Built-in

Before (Vite built-in):

```typescript
// No validation, no types
const apiUrl = import.meta.env.VITE_API_URL;  // string | undefined
const port = import.meta.env.PORT;            // string | undefined
```

After (node-env-resolver-vite):

```typescript
import { resolve } from 'node-env-resolver-vite';

export const env = resolve({
  server: {
    PORT: 'port:5173',
  },
  client: {
    VITE_API_URL: 'url',
  }
});

// Fully typed, validated at startup
env.server.PORT;          // number
env.client.VITE_API_URL;  // string (validated URL)
```

## Related Packages

- [node-env-resolver](https://www.npmjs.com/package/node-env-resolver) - Core package
- [node-env-resolver-nextjs](https://www.npmjs.com/package/node-env-resolver-nextjs) - Next.js integration
- [node-env-resolver-aws](https://www.npmjs.com/package/node-env-resolver-aws) - AWS Secrets Manager & SSM

## License

MIT

