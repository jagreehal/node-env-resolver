/**
 * AWS Secrets - Full Object Syntax Tests
 * Using detailed schema definitions with AWS resolvers
 */
import { describe, it, expect, vi } from 'vitest';
import { resolve, dotenv, cached, TTL, type EnvDefinition } from 'node-env-resolver';
import type { Provider } from 'node-env-resolver';

// Mock resolvers for testing
const mockDotenvProvider = (env: Record<string, string>): Provider => ({
  name: 'mock-dotenv',
  async load() { return env; },
});

const mockAwsSecretsProvider = (secrets: Record<string, string>): Provider => ({
  name: 'mock-aws-secrets',
  async load() { return secrets; },
});

const mockAwsSsmProvider = (params: Record<string, string>): Provider => ({
  name: 'mock-aws-ssm',
  async load() { return params; },
});

describe('AWS Secrets - Full Object Syntax', () => {
  it('should resolve configuration with detailed AWS schema', async () => {
    const mockDotenv = {
      NODE_ENV: 'production',
      PORT: '8080',
      DEBUG: 'true',
    };

    const mockSsm = {
      MAX_CONNECTIONS: '500',
      REDIS_URL: 'redis://ssm-redis.example.com',
    };

    const mockSecrets = {
      DATABASE_PASSWORD: 'super-secret-db-password',
      API_KEY: 'sk-live-1234567890abcdef',
      DATABASE_URL: 'postgres://user:pass@prod-db.example.com:5432/myapp',
      JWT_SECRET: 'jwt-secret-key-for-production',
    };

    const config = await resolve({
      NODE_ENV: { type: 'string', enum: ['development', 'production', 'test'] as const, default: 'development' },
      PORT: { type: 'port', default: 3000 },
      DATABASE_PASSWORD: { type: 'string', secret: true },
      API_KEY: { type: 'string', secret: true, optional: true },
      DATABASE_URL: { type: 'url', secret: true },
      REDIS_URL: { type: 'url', optional: true },
      DEBUG: { type: 'boolean', default: false },
      MAX_CONNECTIONS: { type: 'number', default: 100, min: 1, max: 1000 },
      JWT_SECRET: { type: 'string', secret: true },
    }, {
      resolvers: [
        mockDotenvProvider(mockDotenv),
        cached(mockAwsSsmProvider(mockSsm), { ttl: TTL.minutes15, staleWhileRevalidate: true, key: 'ssm-config' }),
        cached(mockAwsSecretsProvider(mockSecrets), { ttl: TTL.minutes5, maxAge: TTL.hour, staleWhileRevalidate: true, key: 'database-secrets' }),
      ],
      interpolate: true,
      strict: true,
      policies: {
        allowDotenvInProduction: false,
      },
    });

    expect(config.NODE_ENV).toBe('production');
    expect(config.PORT).toBe(8080);
    expect(config.DEBUG).toBe(true);
    expect(config.MAX_CONNECTIONS).toBe(500);
    expect(config.DATABASE_URL).toBe('postgres://user:pass@prod-db.example.com:5432/myapp');
    expect(config.REDIS_URL).toBe('redis://ssm-redis.example.com');
    expect(config.DATABASE_PASSWORD).toBe('super-secret-db-password');
    expect(config.API_KEY).toBe('sk-live-1234567890abcdef');
    expect(config.JWT_SECRET).toBe('jwt-secret-key-for-production');
  });

  it('should handle validation errors gracefully', async () => {
    const mockSecrets = {
      DATABASE_PASSWORD: 'short', // Too short for production
      API_KEY: 'invalid-key-format',
    };

    await expect(resolve({
      DATABASE_PASSWORD: { type: 'string', secret: true, min: 10 },
      API_KEY: { type: 'string', secret: true, pattern: '^sk-[a-zA-Z0-9]{20,}$' },
    }, {
      resolvers: [mockAwsSecretsProvider(mockSecrets)],
      strict: true,
    })).rejects.toThrow();
  });

  it('should demonstrate production-ready configuration', async () => {
    const mockSecrets = {
      DATABASE_PASSWORD: 'production-db-password-123',
      JWT_SECRET: 'jwt-secret-for-production-app-very-long-key',
      ENCRYPTION_KEY: 'encryption-key-for-sensitive-data',
      STRIPE_SECRET_KEY: 'sk_test_1234567890abcdef1234567890abcdef',
    };

    const config = await resolve({
      NODE_ENV: { type: 'string', enum: ['development', 'production', 'test'] as const, default: 'development' },
      PORT: { type: 'port', default: 3000 },
      DATABASE_PASSWORD: { type: 'string', secret: true, min: 10 },
      JWT_SECRET: { type: 'string', secret: true, min: 32 },
      ENCRYPTION_KEY: { type: 'string', secret: true, min: 16 },
      STRIPE_SECRET_KEY: { type: 'string', secret: true, pattern: '^sk_(live|test)_[a-zA-Z0-9]{24,}$' },
    }, {
      resolvers: [
        cached(mockAwsSecretsProvider(mockSecrets), {
          ttl: TTL.minutes5,
          maxAge: TTL.hour,
          staleWhileRevalidate: true,
          key: 'production-secrets'
        }),
      ],
      strict: true,
      policies: {
        allowDotenvInProduction: false,
      },
    });

    expect(config.DATABASE_PASSWORD).toBe('production-db-password-123');
    expect(config.JWT_SECRET).toBe('jwt-secret-for-production-app-very-long-key');
    expect(config.ENCRYPTION_KEY).toBe('encryption-key-for-sensitive-data');
    expect(config.STRIPE_SECRET_KEY).toBe('sk_test_1234567890abcdef1234567890abcdef');
  });
});