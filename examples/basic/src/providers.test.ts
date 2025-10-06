/**
 * Advanced Resolvers Example Tests
 * Demonstrates async usage with AWS Secrets and caching
 */
import { describe, it, expect, vi } from 'vitest';
import { resolve, processEnv, cached } from 'node-env-resolver';
import type { Provider } from 'node-env-resolver';

// Mock AWS Secrets Manager for testing
const mockAwsSecretsProvider = (secrets: Record<string, string>): Provider => ({
  name: 'mock-aws-secrets',
  async load() {
    return secrets;
  },
});

describe('Advanced Resolvers Example', () => {
  it('should resolve environment variables from multiple resolvers with caching', async () => {
    // Mock process.env
    process.env.NODE_ENV = 'production';
    process.env.PORT = '8080';

    const mockSecrets = {
      DATABASE_PASSWORD: 'supersecretpassword',
      API_KEY: 'mock-api-key-123',
    };

    const config = await resolve.with(
      [processEnv(), {
        NODE_ENV: ['development', 'production', 'test'] as const,
        PORT: 3000,
      }],
      [
        cached(
          mockAwsSecretsProvider(mockSecrets),
          {
            ttl: 60000,
            maxAge: 300000,
            staleWhileRevalidate: true,
            key: 'production-secrets'
          }
        ),
        {
          DATABASE_PASSWORD: 'string',
          API_KEY: 'string',
        }
      ]
    );

    expect(config.NODE_ENV).toBe('production');
    expect(config.PORT).toBe(8080);
    expect(config.DATABASE_PASSWORD).toBe(mockSecrets.DATABASE_PASSWORD);
    expect(config.API_KEY).toBe(mockSecrets.API_KEY);

    // Clean up
    delete process.env.NODE_ENV;
    delete process.env.PORT;
  });

  it('should handle provider errors gracefully', async () => {
    const failingProvider: Provider = {
      name: 'failing-provider',
      async load() {
        throw new Error('Provider failed to load');
      },
    };

    await expect(resolve.with(
      [processEnv(), { TEST_VAR: 'string' }],
      [failingProvider, { TEST_VAR: 'string' }]
    )).rejects.toThrow('Provider failed to load');
  });

  it('should demonstrate caching with different TTL values', async () => {
    const mockSecrets = {
      SHORT_TTL_VAR: 'short-ttl-value',
      LONG_TTL_VAR: 'long-ttl-value',
    };

    // Short TTL cache
    process.env.NODE_ENV = 'development';
    const shortConfig = await resolve.with(
      [processEnv(), { NODE_ENV: ['development', 'production', 'test'] as const }],
      [
        cached(mockAwsSecretsProvider(mockSecrets), { ttl: 1000 }), // 1 second
        { SHORT_TTL_VAR: 'string' }
      ]
    );

    expect(shortConfig.SHORT_TTL_VAR).toBe('short-ttl-value');

    // Long TTL cache
    const longConfig = await resolve.with(
      [processEnv(), { NODE_ENV: ['development', 'production', 'test'] as const }],
      [
        cached(mockAwsSecretsProvider(mockSecrets), { ttl: 300000 }), // 5 minutes
        { LONG_TTL_VAR: 'string' }
      ]
    );

    expect(longConfig.LONG_TTL_VAR).toBe('long-ttl-value');
  });
});