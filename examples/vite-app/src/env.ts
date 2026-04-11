import {
  resolve,
  resolveAsyncFn,
  string,
  url,
  port,
  postgres,
  boolean,
} from 'node-env-resolver-vite';
import { processEnv } from 'node-env-resolver/resolvers';

/**
 * Environment configuration for Vite app
 *
 * Server vars: Available only in Node.js context (vite.config.ts, SSR, build scripts)
 * Client vars: Available in browser (must have VITE_ prefix)
 *
 * Features:
 * - Sync resolve() for simple cases
 * - Async resolveAsyncFn() for secret manager integration
 * - Reference handlers for aws-sm:// and aws-ssm:// URIs
 * - Runtime protection prevents server var access in browser
 */

// Sync resolution (most common use case)
export const env = resolve({
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
  },
});

// Example: Async resolution with reference handlers
// Uncomment to use:
/*
import { createAwsSecretHandler, createAwsSsmHandler } from 'node-env-resolver-aws/handlers';

const awsSecretHandler = createAwsSecretHandler({ region: 'us-east-1' });
const awsSsmHandler = createAwsSsmHandler({ region: 'us-east-1' });

export const asyncEnv = await resolveAsyncFn({
  server: {
    DATABASE_URL: postgres({ optional: true }),
  },
  client: {
    VITE_API_URL: url({ optional: true }),
  }
}, {
  async: true,
  referenceHandlers: {
    'aws-sm': awsSecretHandler,
    'aws-ssm': awsSsmHandler,
  }
});
*/
