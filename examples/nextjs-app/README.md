# Next.js + Node Env Resolver Example

This example demonstrates the full power of `node-env-resolver/nextjs` with **true automatic client/server split**:

- 🚀 **Automatic client/server split** - No manual process.env access needed
- 🔒 **Runtime protection** - Server variables throw helpful errors in client components
- 🎯 **Type-safe** environment variable access with perfect inference
- 🛡️ **Production security** policies built-in
- ⚡ **Zero configuration** - Just works with Next.js out of the box
- 🎨 **Elegant syntax** - Shorthand like 'url?', 'port:3000', ['dev', 'prod']
- 🔧 **Custom validators** - Infinite flexibility with your own validation functions

## Features Demonstrated

### 1. Server Components
- Access both server and client environment variables
- Full type safety with IntelliSense
- Runtime validation of all variables

### 2. Client Components  
- Only access to `NEXT_PUBLIC_` prefixed variables
- Runtime protection prevents server variable access
- Helpful error messages in development

### 3. Security Policies
- Server secrets cannot be sourced from `.env` files in production
- Client variables are automatically exposed to the browser
- Type-safe access prevents runtime errors

### 4. Custom Validators
- Create custom validation functions for any specific use case
- Mix custom validators with built-in validators seamlessly
- Full TypeScript inference for custom validator return types

## Quick Start

### Option 1: Use the CLI (Recommended)

```bash
# In any Next.js project
npx node-env-resolver init nextjs

# Install dependencies
npm install

# Start development
npm run dev
```

### Option 2: Manual Setup

1. **Install the package:**
```bash
npm install node-env-resolver/nextjs
```

2. **Create `env.ts` (synchronous):**
```typescript
import { resolveNextEnv } from 'node-env-resolver-nextjs';

export const env = resolveNextEnv({
  server: {
    DATABASE_URL: 'url',        // Required URL (validated)
    API_SECRET: 'string',       // Required secret string
    PORT: 3000,                  // Number with default
  },
  client: {
    NEXT_PUBLIC_APP_URL: 'url', // Required URL (validated)
    NEXT_PUBLIC_GA_ID: 'string?', // Optional string
    NEXT_PUBLIC_ENABLE_ANALYTICS: false, // Boolean with default
  }
});
```

3. **Create `.env.local`:**
```bash
# Server variables (no prefix)
DATABASE_URL=postgres://localhost:5432/myapp
API_SECRET=your-secret-key

# Client variables (NEXT_PUBLIC_ prefix)
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_GA_ID=G-XXXXXXXXXX
```

4. **Use in your app:**
```typescript
// Server Component or API Route
import { env } from './env';

console.log(env.server.DATABASE_URL); // ✅ Works, type: URL
console.log(env.server.PORT);         // ✅ Works, type: number
console.log(env.client.NEXT_PUBLIC_APP_URL); // ✅ Works, type: URL

// Client Component
'use client';
import { env } from './env';

console.log(env.server.DATABASE_URL); // ❌ Runtime error with helpful message
console.log(env.client.NEXT_PUBLIC_APP_URL); // ✅ Works, type: URL
console.log(env.client.NEXT_PUBLIC_ENABLE_ANALYTICS); // ✅ Works, type: boolean
```

## Environment Variables

This example uses these environment variables:

### Server-only (No prefix)
- `DATABASE_URL` - Database connection string
- `NEXTAUTH_SECRET` - NextAuth.js encryption secret  
- `NEXTAUTH_URL` - OAuth callback URL
- `STRIPE_SECRET_KEY` - Stripe secret key (optional)
- `OPENAI_API_KEY` - OpenAI API key (optional)
- `NODE_ENV` - Application environment
- `PORT` - Development server port

### Client-safe (NEXT_PUBLIC_ prefix)
- `NEXT_PUBLIC_APP_URL` - Public application URL
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` - Stripe public key (optional)
- `NEXT_PUBLIC_GA_ID` - Google Analytics ID (optional)
- `NEXT_PUBLIC_ENABLE_ANALYTICS` - Enable analytics tracking

## Running the Example

```bash
# Install dependencies
npm install

# Copy environment template
cp .env.example .env.local
# Edit .env.local with your values

# Validate environment (optional)
npm run env:check

# Start development server
npm run dev
```

Visit http://localhost:3000 to see the example in action.

## Security Demo

The example includes a security demonstration:

1. **Server Component** (`app/page.tsx`) - Can access both server and client variables
2. **Client Component** (`app/client-component.tsx`) - Shows runtime protection in action

Try clicking the "Try to access SERVER variable" button to see the security protection working!

## Production Deployment

### Vercel

1. Set your environment variables in the Vercel dashboard
2. Ensure server secrets use Vercel's environment variables (not `.env` files)
3. Deploy - the security policies will ensure production safety

### Other Platforms

1. Set environment variables in your platform's dashboard
2. Remove `.env` files from production builds
3. The library automatically prevents `.env` secrets in production

## Migration Guide

If you're migrating from other environment variable libraries:

```diff
- import { createEnv } from "@t3-oss/env-nextjs";
- import { z } from "zod";
+ import { resolveNextEnv } from "node-env-resolver-nextjs";

- export const env = createEnv({
+ export const env = resolveNextEnv({
  server: {
-   DATABASE_URL: z.string().url(),
-   NODE_ENV: z.enum(["development", "production"]),
-   PORT: z.number().default(3000),
+   DATABASE_URL: "url!",
+   NODE_ENV: ["development", "production"] as const,
+   PORT: 3000,
  },
  client: {
-   NEXT_PUBLIC_PUBLISHABLE_KEY: z.string().min(1),
-   NEXT_PUBLIC_GA_ID: z.string().optional(),
+   NEXT_PUBLIC_PUBLISHABLE_KEY: "string",
+   NEXT_PUBLIC_GA_ID: "string?",
  },
- runtimeEnv: {
-   DATABASE_URL: process.env.DATABASE_URL,
-   NEXT_PUBLIC_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_PUBLISHABLE_KEY,
- },
});
```

**Key features:**
- ✅ **Lightweight bundle** - ~8.8KB gzipped with zero dependencies
- ✅ **Zero dependencies** - No runtime dependencies
- ✅ **Built-in validators** - 15 types including connection strings (postgres, mysql, mongodb, redis) - no Zod needed
- ✅ **Synchronous** - No async/await required
- ✅ **Elegant syntax** - 'url', 3000 instead of verbose schemas
- ✅ **No manual mapping** - No `runtimeEnv` boilerplate
- ✅ **Runtime protection** - Server variables blocked in client
- ✅ **Type coercion** - Automatic string→number, string→boolean, string→JSON
- ✅ **AWS integration** - Built-in cloud provider support
- ✅ **Standard Schema** - Works with any validation library (optional)

## Learn More

- [Node Env Resolver Docs](../../README.md)
- [Next.js Integration Docs](../../packages/nextjs/README.md)
- [CLI Tools](../../packages/cli/README.md)