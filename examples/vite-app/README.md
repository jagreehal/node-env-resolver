# Vite + node-env-resolver Example

This example demonstrates both the **"Vite Way"** and the **"Enhanced Way"** for handling environment variables in a Vite application.

## Key Concept

**The `env` object works in Node.js context only** (vite.config.ts, SSR). In browser code, you must use `import.meta.env` because importing the `env` object pulls in Node.js dependencies that break the browser build.

## Features Demonstrated

### The "Vite Way" (import.meta.env)
- ✅ Simple and direct access to environment variables
- ✅ Uses Vite's built-in environment variable handling
- ✅ Works in both Node.js and browser contexts
- ✅ Zero configuration required

### The "Enhanced Way" (node-env-resolver-vite)
- ✅ **Build-time validation** of all environment variables
- ✅ Type-safe environment with proper TypeScript types
- ✅ Automatic `VITE_` prefix validation
- ✅ Advanced validators (URL, email, postgres, etc.)
- ✅ Centralized configuration in `env.ts` and `vite.config.ts`
- ✅ Runtime protection for server vars (in Node.js context)

## Getting Started

1. **Install dependencies:**
   ```bash
   pnpm install
   ```

2. **Create `.env.local` file:**
   ```bash
   cp .env.example .env.local
   ```

3. **Start dev server:**
   ```bash
   pnpm dev
   ```

4. **Open browser:**
   Navigate to http://localhost:5173

## Project Structure

```
vite-app/
├── src/
│   ├── env.ts          # Environment configuration
│   ├── main.ts         # App entry point (browser)
│   └── vite-env.d.ts   # TypeScript definitions for import.meta.env
├── .env.example        # Example environment variables
├── index.html          # HTML entry point
├── vite.config.ts      # Vite configuration
└── package.json
```

## Environment Variables

### IMPORTANT: Usage Context

The `env` object from `env.ts` **can only be used in Node.js context** (vite.config.ts, SSR, build scripts). It **CANNOT** be imported in browser code because it pulls in Node.js dependencies.

### Server Variables (Node.js only - vite.config.ts, SSR)

Use the `env` object in Node.js context:

```typescript
// ✅ In vite.config.ts, SSR, build scripts
import { env } from './env';
env.server.DATABASE_URL  // postgres://...
env.server.API_SECRET    // secret key
env.server.PORT          // 5173
env.server.NODE_ENV      // 'development' | 'production' | 'test'
```

### Client Variables (Browser - main.ts, components)

In browser code, **use Vite's standard API**:

```typescript
// ✅ In browser code (main.ts, components)
import.meta.env.VITE_API_URL            // https://api.example.com
import.meta.env.VITE_APP_NAME           // 'My Vite App'
import.meta.env.VITE_ENABLE_ANALYTICS   // false
import.meta.env.VITE_VERSION            // '1.0.0'

// ❌ DON'T do this in browser code - will break build!
// import { env } from './env';
// env.client.VITE_API_URL  // ERROR: Node.js modules not available in browser
```

## Interactive Demo

The app demonstrates how to access client environment variables in the browser:

- **"Access Client Var"** - ✅ Shows `import.meta.env.VITE_API_URL` working in browser
- **"Access Server Var"** - ❌ Shows that server vars are not exposed to browser (returns `undefined`)

**Note:** The enhanced way (using `env` object) provides validation at **build time** via the Vite plugin, not at runtime in the browser.

## Comparison

| Feature | Vite Way | Enhanced Way |
|---------|----------|--------------|
| **Browser Syntax** | `import.meta.env.VITE_*` | `import.meta.env.VITE_*` |
| **Node.js Syntax** | `import.meta.env.*` or `process.env.*` | `env.server.*` / `env.client.*` |
| **Type Safety** | Basic (all strings) | ✅ Advanced (proper types) |
| **Validation** | None | ✅ URL, email, postgres, etc. |
| **Build-time Validation** | None | ✅ Catches errors at build time |
| **Defaults** | Manual fallbacks | ✅ Built-in defaults |
| **Optional Fields** | Manual checks | ✅ Explicit optional/required |
| **Runtime Protection** | None | ✅ In Node.js (env object has Proxy) |

## Type Safety

The environment configuration in `src/env.ts` provides full type safety in Node.js context:

```typescript
// ✅ In vite.config.ts or SSR code
import { env } from './env';

env.server.PORT;         // number
env.client.VITE_API_URL; // string | undefined
env.server.INVALID;      // ❌ TypeScript error: Property 'INVALID' does not exist

// ✅ In browser code (main.ts)
// Use import.meta.env with type definitions from vite-env.d.ts
import.meta.env.VITE_API_URL; // string (typed via generated vite-env.d.ts)
```

## Build for Production

```bash
pnpm build
```

The built files will be in the `dist/` directory.

## Learn More

- [node-env-resolver-vite documentation](../../packages/vite-resolver/README.md)
- [Vite documentation](https://vitejs.dev/)

