import { resolve } from 'node-env-resolver-vite';

/**
 * Environment configuration for Vite app
 * 
 * Server vars: Available only in Node.js context (vite.config.ts, SSR, build scripts)
 * Client vars: Available in browser (must have VITE_ prefix)
 */
export const env = resolve({
  server: {
    // Server-only environment variables
    DATABASE_URL: 'postgres?',
    API_SECRET: 'string?',
    PORT: 'port:5173',
    NODE_ENV: ['development', 'production', 'test'] as const,
  },
  client: {
    // Client-accessible environment variables (VITE_ prefix required)
    VITE_API_URL: 'url?',
    VITE_APP_NAME: 'string?',
    VITE_ENABLE_ANALYTICS: false,
    VITE_VERSION: 'string?',
  }
});

// Export types for convenience
export type Env = typeof env;

