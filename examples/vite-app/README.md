# Vite + node-env-resolver Example

This example demonstrates how to use `node-env-resolver-vite` in a Vite application.

## Features Demonstrated

- ✅ Client/server environment variable separation
- ✅ Type-safe environment variables
- ✅ Runtime protection (prevents server vars in browser)
- ✅ Automatic `VITE_` prefix validation
- ✅ Full TypeScript IntelliSense support

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

### Server Variables (Node.js only)

These variables are only accessible in Node.js context (like `vite.config.ts` or SSR):

```typescript
env.server.DATABASE_URL  // postgres://...
env.server.API_SECRET    // secret key
env.server.PORT          // 5173
env.server.NODE_ENV      // 'development' | 'production' | 'test'
```

### Client Variables (Browser accessible)

These variables have the `VITE_` prefix and are exposed to the browser:

```typescript
env.client.VITE_API_URL            // https://api.example.com
env.client.VITE_APP_NAME           // 'My Vite App'
env.client.VITE_ENABLE_ANALYTICS   // false
env.client.VITE_VERSION            // '1.0.0'
```

## Runtime Protection Demo

Try clicking the buttons in the app to see runtime protection in action:

- **"Access Client Var"** - ✅ Works fine, returns the value
- **"Access Server Var"** - ❌ Throws helpful error message

This prevents accidentally leaking server secrets to the browser!

## Type Safety

The environment configuration in `src/env.ts` provides full type safety:

```typescript
// ✅ TypeScript knows the types
env.server.PORT;         // number
env.client.VITE_API_URL; // string | undefined

// ❌ TypeScript catches errors
env.server.INVALID;      // Error: Property 'INVALID' does not exist
```

## Build for Production

```bash
pnpm build
```

The built files will be in the `dist/` directory.

## Learn More

- [node-env-resolver-vite documentation](../../packages/vite-resolver/README.md)
- [Vite documentation](https://vitejs.dev/)

