/**
 * TTL Caching Examples Tests
 * Demonstrates various TTL caching configurations
 */
import { describe, it, expect } from 'vitest';
import { resolve } from 'node-env-resolver';
import { cached, TTL, awsCache } from 'node-env-resolver/utils';
import type { Resolver } from 'node-env-resolver';

// Mock resolvers for testing
const mockSecretsProvider = (secrets: Record<string, string>): Resolver => ({
  name: 'mock-secrets',
  async load() {
    return secrets;
  },
});

const mockSsmProvider = (params: Record<string, string>): Resolver => ({
  name: 'mock-ssm',
  async load() {
    return params;
  },
});

describe('TTL Caching Examples', () => {
  it('should demonstrate simple TTL caching', async () => {
    const schema = {
      API_KEY: 'string',
      DATABASE_URL: 'url',
    };

    const config = await resolve.async(
      [cached(
        mockSecretsProvider({ API_KEY: 'simple-key', DATABASE_URL: 'https://db.example.com' }),
        { ttl: 2 * 60 * 1000 } // 2 minutes
      ), schema]
    );
    expect(config.API_KEY).toBe('simple-key');
    expect(config.DATABASE_URL).toBe('https://db.example.com');
  });

  it('should demonstrate advanced TTL with stale-while-revalidate', async () => {
    const schema = {
      JWT_SECRET: 'string',
      STRIPE_KEY: 'string',
    };

    const config = await resolve.async(
      [cached(
        mockSecretsProvider({ JWT_SECRET: 'jwt-secret', STRIPE_KEY: 'stripe-key' }),
        {
          ttl: TTL.minutes5,
          maxAge: TTL.hour,
          staleWhileRevalidate: true,
          key: 'production-secrets'
        }
      ), schema]
    );
    expect(config.JWT_SECRET).toBe('jwt-secret');
    expect(config.STRIPE_KEY).toBe('stripe-key');
  });

  it('should demonstrate AWS-optimized cache configuration', async () => {
    const schema = {
      DATABASE_PASSWORD: 'string',
      REDIS_PASSWORD: 'string',
      EXTERNAL_API_KEY: 'string',
    };

    const config = await resolve.async(
      [cached(
        mockSsmProvider({
          'DATABASE_PASSWORD': 'db-pass',
          'REDIS_PASSWORD': 'redis-pass',
          'EXTERNAL_API_KEY': 'external-key',
        }),
        awsCache({
          ttl: TTL.minutes15,
          maxAge: TTL.hours6,
          staleWhileRevalidate: true
        })
      ), schema]
    );
    expect(config.DATABASE_PASSWORD).toBe('db-pass');
    expect(config.REDIS_PASSWORD).toBe('redis-pass');
    expect(config.EXTERNAL_API_KEY).toBe('external-key');
  });

  it('should demonstrate tiered caching strategy', async () => {
    const schema = {
      USER_SESSION_TOKEN: 'string',
      DATABASE_PASSWORD: 'string',
      APP_VERSION: 'string',
    };

    const config = await resolve.async(
      [cached(mockSecretsProvider({ USER_SESSION_TOKEN: 'session-token' }), { ttl: TTL.short, staleWhileRevalidate: true }), schema],
      [cached(mockSecretsProvider({ DATABASE_PASSWORD: 'db-pass-tiered' }), { ttl: TTL.minutes5, staleWhileRevalidate: true }), schema],
      [cached(mockSecretsProvider({ APP_VERSION: 'v1.2.3' }), { ttl: TTL.hour, staleWhileRevalidate: false }), schema]
    );
    expect(config.USER_SESSION_TOKEN).toBe('session-token');
    expect(config.DATABASE_PASSWORD).toBe('db-pass-tiered');
    expect(config.APP_VERSION).toBe('v1.2.3');
  });

  it('should demonstrate production-ready tiered caching', async () => {
    const schema = {
      JWT_SECRET: 'string',
      ENCRYPTION_KEY: 'string',
      DATABASE_URL: 'url',
      REDIS_URL: 'url',
      STRIPE_SECRET_KEY: 'string',
      SENDGRID_API_KEY: 'string',
    };

    const config = await resolve.async(
      [cached(mockSecretsProvider({ JWT_SECRET: 'app-jwt', ENCRYPTION_KEY: 'app-enc' }), { ttl: TTL.hour, maxAge: TTL.day, staleWhileRevalidate: true, key: 'app-secrets' }), schema],
      [cached(mockSecretsProvider({ DATABASE_URL: 'https://prod-db.com', REDIS_URL: 'https://prod-redis.com' }), { ttl: TTL.minutes15, maxAge: TTL.hour, staleWhileRevalidate: true, key: 'database-creds' }), schema],
      [cached(mockSecretsProvider({ STRIPE_SECRET_KEY: 'stripe-prod', SENDGRID_API_KEY: 'sendgrid-prod' }), { ttl: TTL.minutes5, maxAge: TTL.minutes15, staleWhileRevalidate: true, key: 'api-keys' }), schema],
      {
        policies: {
          allowDotenvInProduction: false,
        },
      }
    );
    expect(config.JWT_SECRET).toBe('app-jwt');
    expect(config.ENCRYPTION_KEY).toBe('app-enc');
    expect(config.DATABASE_URL).toBe('https://prod-db.com');
    expect(config.REDIS_URL).toBe('https://prod-redis.com');
    expect(config.STRIPE_SECRET_KEY).toBe('stripe-prod');
    expect(config.SENDGRID_API_KEY).toBe('sendgrid-prod');
  });
});