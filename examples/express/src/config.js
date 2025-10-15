/**
 * Centralized configuration using node-env-resolver
 * Perfect for Express.js applications with multiple deployment environments
 */
import { resolve, cached, string, url } from 'node-env-resolver';
import { awsSsm } from 'node-env-resolver-aws';
export const config = await resolve({
    // Application
    NODE_ENV: {
        type: string(),
        enum: ['development', 'production', 'test'],
        default: 'development',
        description: 'Application environment',
    },
    PORT: {
        type: 'port',
        default: 3000,
        description: 'Server port',
    },
    // Database
    DATABASE_URL: {
        type: url(),
        description: 'PostgreSQL connection string',
    },
    DATABASE_POOL_MIN: {
        type: 'number',
        default: 2,
        min: 1,
        description: 'Minimum database connections',
    },
    DATABASE_POOL_MAX: {
        type: 'number',
        default: 10,
        min: 1,
        max: 100,
        description: 'Maximum database connections',
    },
    // Redis Cache
    REDIS_URL: {
        type: url(),
        optional: true,
        description: 'Redis connection string',
    },
    // Security
    JWT_SECRET: {
        type: string(),
        secret: true,
        description: 'JWT signing secret',
    },
    JWT_EXPIRES_IN: {
        type: string(),
        default: '7d',
        pattern: '^\\d+[hdwmy]$',
        description: 'JWT expiration time',
    },
    // API Configuration
    API_RATE_LIMIT_MAX: {
        type: 'number',
        default: 100,
        min: 1,
        description: 'Max requests per window',
    },
    API_RATE_LIMIT_WINDOW: {
        type: 'number',
        default: 900000, // 15 minutes
        min: 60000,
        description: 'Rate limit window in milliseconds',
    },
    // Feature Flags
    ENABLE_CORS: {
        type: 'boolean',
        default: false,
        description: 'Enable CORS middleware',
    },
    ENABLE_METRICS: {
        type: 'boolean',
        default: false,
        description: 'Enable Prometheus metrics',
    },
    // External Services
    STRIPE_PUBLIC_KEY: {
        type: string(),
        pattern: '^pk_',
        optional: true,
        description: 'Stripe publishable key',
    },
    STRIPE_SECRET_KEY: {
        type: string(),
        pattern: '^sk_',
        secret: true,
        optional: true,
        description: 'Stripe secret key',
    },
    // Logging
    LOG_LEVEL: {
        type: string(),
        enum: ['error', 'warn', 'info', 'debug'],
        default: 'info',
        description: 'Logging level',
    },
    // Monitoring
    SENTRY_DSN: {
        type: url(),
        optional: true,
        description: 'Sentry error tracking DSN',
    },
}, {
    resolvers: [
        ...(process.env.NODE_ENV === 'production' ? [
            cached(awsSsm({
                path: '/myapp/production',
                recursive: true,
                region: process.env.AWS_REGION,
            }), 300000)
        ] : []),
    ],
});
// Helper functions for common checks
export const isDevelopment = config.NODE_ENV === 'development';
export const isProduction = config.NODE_ENV === 'production';
export const isTest = config.NODE_ENV === 'test';
