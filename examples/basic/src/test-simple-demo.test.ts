/**
 * Simple Demo Tests
 */
import { describe, it, expect } from 'vitest';
import { resolve, processEnv, type Resolver, string, url, port, enums } from 'node-env-resolver';

function createDatabaseConfigResolver(values: Record<string, string>): Resolver {
  return {
    name: 'database-config',
    async load() {
      return values;
    },
    loadSync() {
      return values;
    }
  };
}

describe('Simple Demo', () => {
  it('should resolve configuration with custom provider', async () => {
    // Set NODE_ENV explicitly for this test
    process.env.NODE_ENV = 'development';
    
    const dbConfig = createDatabaseConfigResolver({
      DATABASE_HOST: 'prod-db.example.com',
      DATABASE_PORT: '5432',
    });

    const config = await resolve.async(
      [processEnv(), {
        PORT: 3000,
        NODE_ENV: ['development', 'production', 'test'] as const,
      }],
      [dbConfig, {
        DATABASE_HOST: string(),
        DATABASE_PORT: 'number',
      }]
    );

    expect(config.PORT).toBe(3000);
    expect(config.NODE_ENV).toBe('development'); // Default from enum
    expect(config.DATABASE_HOST).toBe('prod-db.example.com');
    expect(config.DATABASE_PORT).toBe(5432);
  });

  it('should handle different database configurations', async () => {
    const testCases = [
      {
        host: 'dev-db.example.com',
        port: '3306',
        expectedHost: 'dev-db.example.com',
        expectedPort: 3306
      },
      {
        host: 'staging-db.example.com',
        port: '5432',
        expectedHost: 'staging-db.example.com',
        expectedPort: 5432
      },
      {
        host: 'prod-db.example.com',
        port: '5432',
        expectedHost: 'prod-db.example.com',
        expectedPort: 5432
      }
    ];

    for (const testCase of testCases) {
      const dbConfig = createDatabaseConfigResolver({
        DATABASE_HOST: testCase.host,
        DATABASE_PORT: testCase.port,
      });

      const config = await resolve.async(
        [processEnv(), {
          PORT: 3000,
          NODE_ENV: ['development', 'production', 'test'] as const,
        }],
        [dbConfig, {
          DATABASE_HOST: string(),
          DATABASE_PORT: 'number',
        }]
      );

      expect(config.DATABASE_HOST).toBe(testCase.expectedHost);
      expect(config.DATABASE_PORT).toBe(testCase.expectedPort);
    }
  });

  it('should provide correct TypeScript types', async () => {
    const dbConfig = createDatabaseConfigResolver({
      DATABASE_HOST: 'prod-db.example.com',
      DATABASE_PORT: '5432',
    });

    const config = await resolve.async(
      [processEnv(), {
        PORT: 3000,
        NODE_ENV: ['development', 'production', 'test'] as const,
      }],
      [dbConfig, {
        DATABASE_HOST: string(),
        DATABASE_PORT: 'number',
      }]
    );

    // TypeScript should know the correct types
    expect(typeof config.PORT).toBe('number');
    expect(typeof config.NODE_ENV).toBe('string');
    expect(typeof config.DATABASE_HOST).toBe('string');
    expect(typeof config.DATABASE_PORT).toBe('number');
  });

  it('should handle enum validation', async () => {
    const dbConfig = createDatabaseConfigResolver({
      DATABASE_HOST: 'prod-db.example.com',
      DATABASE_PORT: '5432',
    });

    const validEnvironments = ['development', 'production', 'test'] as const;
    
    for (const env of validEnvironments) {
      // Set environment variable
      process.env.NODE_ENV = env;

      const config = await resolve.async(
        [processEnv(), {
          PORT: 3000,
          NODE_ENV: ['development', 'production', 'test'] as const,
        }],
        [dbConfig, {
          DATABASE_HOST: string(),
          DATABASE_PORT: 'number',
        }]
      );

      expect(config.NODE_ENV).toBe(env);
    }

    // Cleanup
    delete process.env.NODE_ENV;
  });

  it('should throw error for invalid enum value', async () => {
    const dbConfig = createDatabaseConfigResolver({
      DATABASE_HOST: 'prod-db.example.com',
      DATABASE_PORT: '5432',
    });

    // Set invalid environment variable
    process.env.NODE_ENV = 'invalid';

    await expect(resolve.async(
      [processEnv(), {
        PORT: 3000,
        NODE_ENV: ['development', 'production', 'test'] as const,
      }],
      [dbConfig, {
        DATABASE_HOST: string(),
        DATABASE_PORT: 'number',
      }]
    )).rejects.toThrow(/must be one of: development, production, test/);

    // Cleanup
    delete process.env.NODE_ENV;
  });

  it('should handle port number validation', async () => {
    // Set NODE_ENV explicitly for this test
    process.env.NODE_ENV = 'development';
    
    const dbConfig = createDatabaseConfigResolver({
      DATABASE_HOST: 'prod-db.example.com',
      DATABASE_PORT: '5432',
    });

    const config = await resolve.async(
      [processEnv(), {
        PORT: 3000,
        NODE_ENV: ['development', 'production', 'test'] as const,
      }],
      [dbConfig, {
        DATABASE_HOST: string(),
        DATABASE_PORT: 'number',
      }]
    );

    expect(config.PORT).toBe(3000);
    expect(config.DATABASE_PORT).toBe(5432);
  });

  it('should handle string validation', async () => {
    // Set NODE_ENV explicitly for this test
    process.env.NODE_ENV = 'development';
    
    const dbConfig = createDatabaseConfigResolver({
      DATABASE_HOST: 'prod-db.example.com',
      DATABASE_PORT: '5432',
    });

    const config = await resolve.async(
      [processEnv(), {
        PORT: 3000,
        NODE_ENV: ['development', 'production', 'test'] as const,
      }],
      [dbConfig, {
        DATABASE_HOST: string(),
        DATABASE_PORT: 'number',
      }]
    );

    expect(config.DATABASE_HOST).toBe('prod-db.example.com');
    expect(typeof config.DATABASE_HOST).toBe('string');
  });

  it('should demonstrate provider composition', async () => {
    // Set NODE_ENV explicitly for this test
    process.env.NODE_ENV = 'development';
    
    const dbConfig = createDatabaseConfigResolver({
      DATABASE_HOST: 'prod-db.example.com',
      DATABASE_PORT: '5432',
    });

    const config = await resolve.async(
      [processEnv(), {
        PORT: 3000,
        NODE_ENV: ['development', 'production', 'test'] as const,
      }],
      [dbConfig, {
        DATABASE_HOST: string(),
        DATABASE_PORT: 'number',
      }]
    );

    // Should have values from both resolvers
    expect(config.PORT).toBe(3000); // From processEnv
    expect(config.NODE_ENV).toBe('development'); // From processEnv (default)
    expect(config.DATABASE_HOST).toBe('prod-db.example.com'); // From dbConfig
    expect(config.DATABASE_PORT).toBe(5432); // From dbConfig
  });

  it('should handle synchronous provider', async () => {
    const syncProvider = {
      name: 'sync-provider',
      async load() {
        return { SYNC_VAR: 'async-value' };
      },
      loadSync() {
        return { SYNC_VAR: 'sync-value' };
      }
    };

    const config = await resolve.async(
      [processEnv(), {
        SYNC_VAR: string()
      }],
      [syncProvider, {
        SYNC_VAR: string()
      }]
    );

    expect(config.SYNC_VAR).toBe('async-value');
  });
});
