# Next.js + Node Env Resolver Example

This example demonstrates `node-env-resolver-nextjs` with automatic client/server environment variable splitting.

## Overview

- Automatic client/server split with runtime protection
- Type-safe environment variable access
- Production security policies
- Works with Next.js 13+ App Router
- Custom validators support

## Features Demonstrated

### 1. Server Components
- Access both server and client environment variables
- Full type safety with IntelliSense
- Runtime validation of all variables

### 2. Client Components  
- Access to `NEXT_PUBLIC_` prefixed variables only
- Runtime protection against server variable access
- Error messages in development

### 3. Security Policies
- Server secrets blocked from `.env` files in production
- Client variables exposed to browser
- Type-safe access

### 4. Custom Validators
- Custom validation functions
- Mix with built-in validators
- TypeScript inference for return types

## Quick Start

1. **Install the package:**
```bash
npm install node-env-resolver/nextjs
```

2. **Create `env.ts` (synchronous):**
```typescript
import { resolve } from 'node-env-resolver-nextjs';

export const env = resolve({
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

console.log(env.server.DATABASE_URL); // string (URL)
console.log(env.server.PORT);         // number
console.log(env.client.NEXT_PUBLIC_APP_URL); // string (URL)

// Client Component
'use client';
import { env } from './env';

console.log(env.server.DATABASE_URL); // Runtime error
console.log(env.client.NEXT_PUBLIC_APP_URL); // string (URL)
console.log(env.client.NEXT_PUBLIC_ENABLE_ANALYTICS); // boolean
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

The example demonstrates runtime protection:

1. **Server Component** (`app/page.tsx`) - Accesses both server and client variables
2. **Client Component** (`app/client-component.tsx`) - Demonstrates runtime protection

Click the "Try to access SERVER variable" button to see the protection mechanism.

## Production Deployment

### Vercel

1. Set environment variables in the Vercel dashboard
2. Ensure server secrets use Vercel's environment variables (not `.env` files)
3. Deploy with configured security policies

### Other Platforms

1. Set environment variables in platform dashboard
2. Remove `.env` files from production builds
3. `.env` secrets are automatically blocked in production

## Migration Guide

If you're migrating from other environment variable libraries:

```diff
- import { createEnv } from "@t3-oss/env-nextjs";
- import { z } from "zod";
+ import { resolve } from "node-env-resolver-nextjs";

- export const env = createEnv({
+ export const env = resolve({
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

**Key differences:**
- Zero runtime dependencies
- Built-in validators for common types (url, postgres, mysql, mongodb, redis)
- Shorthand syntax
- No manual `runtimeEnv` mapping required
- Runtime protection for server variables
- Automatic type coercion
- Standard Schema support

## Learn More

- [Node Env Resolver Documentation](../../README.md)
- [Next.js Integration Documentation](../../packages/nextjs-resolver/README.md)