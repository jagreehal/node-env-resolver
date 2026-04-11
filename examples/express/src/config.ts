/**
 * Centralized configuration using node-env-resolver
 * Perfect for Express.js applications with multiple deployment environments
 */
import { resolve, resolveAsync } from 'node-env-resolver';
import { url, string } from 'node-env-resolver/validators';
import { processEnv } from 'node-env-resolver/resolvers';
import { patchGlobalConsole } from 'node-env-resolver/runtime';

// Demonstrate runtime protection with console redaction
const enableRuntimeProtection = process.env.NODE_ENV !== 'test';

const resolvedConfig = await resolveAsync({
  resolvers: [
    [
      processEnv(),
      {
        NODE_ENV: ['development', 'production', 'test'] as const,
        PORT: 3000,
        DATABASE_URL: url(),
        DATABASE_POOL_MIN: 2,
        DATABASE_POOL_MAX: 10,
        REDIS_URL: 'url?',
        JWT_SECRET: string(),
        JWT_EXPIRES_IN: 'string:7d',
        API_RATE_LIMIT_MAX: 100,
        API_RATE_LIMIT_WINDOW: 900000,
        ENABLE_CORS: false,
        ENABLE_METRICS: false,
        STRIPE_PUBLIC_KEY: 'string:/^pk_/?',
        STRIPE_SECRET_KEY: 'string:/^sk_/?',
        LOG_LEVEL: ['error', 'warn', 'info', 'debug'] as const,
        SENTRY_DSN: 'url?',
      },
    ],
  ],
});

// Apply runtime protection in production
if (enableRuntimeProtection) {
  patchGlobalConsole(resolvedConfig, {
    enabled: process.env.NODE_ENV === 'production',
    customPatterns: [/sk_[a-zA-Z0-9]+/, /jwt_secret/i, /password/i],
  });
}

export const config = resolvedConfig;

// For simpler use cases, you can also use sync resolve:
// export const config = resolve({
//   NODE_ENV: ['development', 'production', 'test'] as const,
//   PORT: 3000,
//   DATABASE_URL: url(),
//   // ... rest of config
// });

// Note: In production, you can add AWS SSM provider:
// export const config = await resolveAsync(
//   [processEnv(), { ... }],
//   [awsSsm({ path: '/myapp/production' }), {}]
// );

// Export typed configuration
export type AppConfig = typeof resolvedConfig;

// Helper functions for common checks
export const isDevelopment = resolvedConfig.NODE_ENV === 'development';
export const isProduction = resolvedConfig.NODE_ENV === 'production';
export const isTest = resolvedConfig.NODE_ENV === 'test';
