/**
 * Centralized configuration using node-env-resolver
 * Perfect for Express.js applications with multiple deployment environments
 */
import { resolve } from 'node-env-resolver';

export const config = await resolve({
  // Application
  NODE_ENV: ['development', 'production', 'test'] as const,
  PORT: 3000,

  // Database
  DATABASE_URL: 'url',
  DATABASE_POOL_MIN: 2,
  DATABASE_POOL_MAX: 10,

  // Redis Cache
  REDIS_URL: 'url?',

  // Security
  JWT_SECRET: 'string',
  JWT_EXPIRES_IN: 'string:7d',

  // API Configuration
  API_RATE_LIMIT_MAX: 100,
  API_RATE_LIMIT_WINDOW: 900000,

  // Feature Flags
  ENABLE_CORS: false,
  ENABLE_METRICS: false,

  // External Services
  STRIPE_PUBLIC_KEY: 'string:/^pk_/?',
  STRIPE_SECRET_KEY: 'string:/^sk_/?',

  // Logging
  LOG_LEVEL: ['error', 'warn', 'info', 'debug'] as const,

  // Monitoring
  SENTRY_DSN: 'url?',
});

// Note: In production, you can add AWS SSM provider:
// export const config = await resolve.async(
//   [processEnv(), { ... }],
//   [awsSsm({ path: '/myapp/production' }), {}]
// );

// Export typed configuration
export type AppConfig = typeof config;

// Helper functions for common checks
export const isDevelopment = config.NODE_ENV === 'development';
export const isProduction = config.NODE_ENV === 'production';
export const isTest = config.NODE_ENV === 'test';