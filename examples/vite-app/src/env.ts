import { string, url, port, postgres, boolean } from 'node-env-resolver-vite';

/**
 * Environment configuration for Vite app
 * 
 * Server vars: Available only in Node.js context (vite.config.ts, SSR, build scripts)
 * Client vars: Available in browser (must have VITE_ prefix)
 */
export const envConfig = {
  server: {
    // Server-only environment variables
    DATABASE_URL: postgres({ optional: true }),
    API_SECRET: string({ optional: true }),
    PORT: port({ default: 5173 }),
    NODE_ENV: ['development', 'production', 'test'] as const,
  },
  client: {
    // Client-accessible environment variables (VITE_ prefix required)
    VITE_API_URL: url({ optional: true }),
    VITE_APP_NAME: string({ optional: true }),
    VITE_ENABLE_ANALYTICS: boolean({ default: false }),
    VITE_VERSION: string({ optional: true }),
  }
};

