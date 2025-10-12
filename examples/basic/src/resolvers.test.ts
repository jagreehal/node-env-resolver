/**
 * Advanced Resolvers Example Tests
 * Demonstrates async usage with AWS Secrets and caching
 */
import { describe, it, expect } from 'vitest';
import { resolve, safeResolve, processEnv, getAuditLog } from 'node-env-resolver';
import { cached } from 'node-env-resolver/utils';
import type { Resolver } from 'node-env-resolver';

// Mock AWS Secrets Manager for testing
const mockAwsSecretsProvider = (secrets: Record<string, string>): Resolver => ({
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

    console.log(config)
    console.log(getAuditLog()) 

    expect(config.NODE_ENV).toBe('production');
    expect(config.PORT).toBe(8080);
    expect(config.DATABASE_PASSWORD).toBe(mockSecrets.DATABASE_PASSWORD);
    expect(config.API_KEY).toBe(mockSecrets.API_KEY);

    // Clean up
    delete process.env.NODE_ENV;
    delete process.env.PORT;
  });

  it('should handle provider errors gracefully', async () => {
    const failingProvider: Resolver = {
      name: 'failing-provider',
      async load() {
        throw new Error('Resolver failed to load');
      },
    };

    await expect(resolve.with(
      [processEnv(), { TEST_VAR: 'string' }],
      [failingProvider, { TEST_VAR: 'string' }]
    )).rejects.toThrow('Resolver failed to load');
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

  it('should show cache hit vs cache miss in audit logs', async () => {
    let loadCount = 0;
    const mockSecretsWithCounter = {
      name: 'mock-aws-secrets-counter',
      async load() {
        loadCount++;
        return {
          SECRET_VALUE: `secret-${loadCount}`,
        };
      },
    };

    // Set NODE_ENV to production to enable audit logging
    process.env.NODE_ENV = 'production';
    
    const cachedResolver = cached(mockSecretsWithCounter, { ttl: 60000, key: 'test-cache' });

    // First call - should be a cache miss (cached: false)
    const config1 = await resolve.with(
      [cachedResolver, { SECRET_VALUE: 'string' }]
    );

    const auditAfterFirst = getAuditLog();
    const firstLoad = auditAfterFirst.find(e => e.key === 'SECRET_VALUE' && e.type === 'env_loaded');
    console.log('First load (cache miss):', firstLoad);
    expect(config1.SECRET_VALUE).toBe('secret-1');
    expect(loadCount).toBe(1);
    expect(firstLoad?.metadata?.cached).toBe(false);

    // Second call - should be a cache hit (cached: true)
    const config2 = await resolve.with(
      [cachedResolver, { SECRET_VALUE: 'string' }]
    );

    const auditAfterSecond = getAuditLog();
    const secondLoad = auditAfterSecond.filter(e => e.key === 'SECRET_VALUE' && e.type === 'env_loaded')[1];
    console.log('Second load (cache hit):', secondLoad);
    expect(config2.SECRET_VALUE).toBe('secret-1'); // Same value from cache
    expect(loadCount).toBe(1); // load() not called again
    expect(secondLoad?.metadata?.cached).toBe(true);

    // Clean up
    delete process.env.NODE_ENV;
  });

  describe('Safe Resolve Functions', () => {
    it('should return success result when validation passes', async () => {
      process.env.PORT = '3000';
      process.env.NODE_ENV = 'production';

      const result = await safeResolve({
        PORT: 'number',
        NODE_ENV: ['development', 'production', 'test'] as const,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.PORT).toBe(3000);
        expect(result.data.NODE_ENV).toBe('production');
      }

      // Clean up
      delete process.env.PORT;
      delete process.env.NODE_ENV;
    });

    it('should return error result when validation fails', async () => {
      const result = await safeResolve({
        PORT: 'number',
        REQUIRED_VAR: 'string', // Missing required variable
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('Missing required environment variable: REQUIRED_VAR');
      }
    });

    it('should validate environment variable names', async () => {
      // Test invalid variable name with safeResolve (should return error result)
      const safeResult = await safeResolve({
        'PORxxxT': 3000, // Invalid variable name (contains lowercase)
      });

      expect(safeResult.success).toBe(false);
      if (!safeResult.success) {
        expect(safeResult.error).toContain('Invalid environment variable name: "PORxxxT"');
      }

      // Test with resolve (should throw)
      expect(() => resolve({
        'PORxxxT': 3000, // Invalid variable name (contains lowercase)
      })).toThrow('Invalid environment variable name: "PORxxxT"');

      // Test valid variable name (should work)
      const validResult = safeResolve({
        'VALID_VAR': { type: 'string', default: 'default' },
      });

      expect(validResult.success).toBe(true);
    });

    it('should work with multiple resolvers using safeResolve.with', async () => {
      process.env.NODE_ENV = 'production';
      process.env.PORT = '8080';

      const mockSecrets = {
        DATABASE_PASSWORD: 'supersecretpassword',
        API_KEY: 'mock-api-key-123',
      };

      const result = await safeResolve.with(
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

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.NODE_ENV).toBe('production');
        expect(result.data.PORT).toBe(8080);
        expect(result.data.DATABASE_PASSWORD).toBe(mockSecrets.DATABASE_PASSWORD);
        expect(result.data.API_KEY).toBe(mockSecrets.API_KEY);
      }

      // Clean up
      delete process.env.NODE_ENV;
      delete process.env.PORT;
    });

    it('should handle resolver errors gracefully', async () => {
      const failingProvider: Resolver = {
        name: 'failing-provider',
        async load() {
          throw new Error('Resolver failed to load');
        },
      };

      const result = await safeResolve.with(
        [processEnv(), { TEST_VAR: 'string' }],
        [failingProvider, { TEST_VAR: 'string' }]
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('Resolver failed to load');
      }
    });

    it('should work with safeResolve for sync resolvers', () => {
      process.env.PORT = '3000';

      const result = safeResolve({
        PORT: 'number',
        DEBUG: false, // boolean with default
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.PORT).toBe(3000);
        expect(result.data.DEBUG).toBe(false);
      }

      // Clean up
      delete process.env.PORT;
    });
  });
});