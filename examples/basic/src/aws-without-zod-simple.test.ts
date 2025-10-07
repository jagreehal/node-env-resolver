/**
 * AWS Secrets - Simple Shorthand Syntax Tests
 * Using the composition API for explicit provider mapping
 */
import { describe, it, expect } from 'vitest';
import { resolve, processEnv, cached, TTL } from 'node-env-resolver';
import type { Resolver } from 'node-env-resolver';

// Mock AWS Secrets Manager for testing
const mockAwsSecretsProvider = (secrets: Record<string, string>): Resolver => ({
  name: 'mock-aws-secrets',
  async load() {
    return secrets;
  },
});

describe('AWS Secrets - Simple Shorthand Syntax', () => {
  it('should resolve configuration with AWS secrets using simple syntax', async () => {
    // Mock process.env
    process.env.NODE_ENV = 'production';
    process.env.PORT = '8080';
    process.env.DEBUG = 'true';

    const mockSecrets = {
      DATABASE_PASSWORD: 'super-secret-password',
      API_KEY: 'sk-1234567890abcdef',
      DATABASE_URL: 'postgres://user:pass@localhost:5432/mydb',
      LOG_LEVEL: 'info'
    };

    const config = await resolve.with(
      [processEnv(), {
        // Local config from .env or process.env
        NODE_ENV: ['development', 'production', 'test'] as const,
        PORT: 3000,
        DEBUG: false,
      }],
      [
        // AWS Secrets with caching
        cached(
          mockAwsSecretsProvider(mockSecrets),
          {
            ttl: TTL.minute5,
            staleWhileRevalidate: true,
            key: 'production-secrets'
          }
        ),
        {
          DATABASE_PASSWORD: 'string',
          API_KEY: 'string?',
          DATABASE_URL: 'url',
          LOG_LEVEL: ['debug', 'info', 'warn', 'error'] as const,
        }
      ]
    );

    expect(config.NODE_ENV).toBe('production');
    expect(config.PORT).toBe(8080);
    expect(config.DEBUG).toBe(true);
    expect(config.LOG_LEVEL).toBe('info');
    expect(config.DATABASE_URL).toBe('postgres://user:pass@localhost:5432/mydb');
    expect(config.DATABASE_PASSWORD).toBe('super-secret-password');
    expect(config.API_KEY).toBe('sk-1234567890abcdef');

    // Clean up
    delete process.env.NODE_ENV;
    delete process.env.PORT;
    delete process.env.DEBUG;
  });

  it('should handle missing optional variables', async () => {
    process.env.NODE_ENV = 'development';

    const mockSecrets = {
      DATABASE_PASSWORD: 'required-secret',
      DATABASE_URL: 'postgres://localhost:5432/test',
      // API_KEY is missing (optional)
    };

    const config = await resolve.with(
      [processEnv(), {
        NODE_ENV: ['development', 'production', 'test'] as const,
        PORT: 3000,
      }],
      [
        cached(mockAwsSecretsProvider(mockSecrets), TTL.minute5),
        {
          DATABASE_PASSWORD: 'string',
          API_KEY: 'string?', // Optional
          DATABASE_URL: 'url',
        }
      ]
    );

    expect(config.NODE_ENV).toBe('development');
    expect(config.PORT).toBe(3000);
    expect(config.DATABASE_PASSWORD).toBe('required-secret');
    expect(config.DATABASE_URL).toBe('postgres://localhost:5432/test');
    expect(config.API_KEY).toBeUndefined();

    delete process.env.NODE_ENV;
  });

  it('should demonstrate caching benefits', async () => {
    const mockSecrets = {
      JWT_SECRET: 'jwt-secret-key',
      ENCRYPTION_KEY: 'encryption-key',
    };

    // First call - should load from provider
    process.env.NODE_ENV = 'development';
    const config1 = await resolve.with(
      [processEnv(), { NODE_ENV: ['development', 'production', 'test'] as const }],
      [
        cached(mockAwsSecretsProvider(mockSecrets), {
          ttl: TTL.minute5,
          staleWhileRevalidate: true,
          key: 'jwt-secrets'
        }),
        {
          JWT_SECRET: 'string',
          ENCRYPTION_KEY: 'string',
        }
      ]
    );

    expect(config1.JWT_SECRET).toBe('jwt-secret-key');
    expect(config1.ENCRYPTION_KEY).toBe('encryption-key');

    // Second call - should use cache
    const config2 = await resolve.with(
      [processEnv(), { NODE_ENV: ['development', 'production', 'test'] as const }],
      [
        cached(mockAwsSecretsProvider(mockSecrets), {
          ttl: TTL.minute5,
          staleWhileRevalidate: true,
          key: 'jwt-secrets'
        }),
        {
          JWT_SECRET: 'string',
          ENCRYPTION_KEY: 'string',
        }
      ]
    );

    expect(config2.JWT_SECRET).toBe('jwt-secret-key');
    expect(config2.ENCRYPTION_KEY).toBe('encryption-key');
  });
});