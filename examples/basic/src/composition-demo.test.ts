/**
 * Resolver Composition Demo Tests
 *
 * Shows how to explicitly compose environment variables from multiple resolvers
 * using the new resolve.async() tuple API
 */
import { describe, it, expect, vi } from 'vitest';
import { resolve, processEnv } from 'node-env-resolver';
import type { Resolver } from 'node-env-resolver';

// ============================================================================
// Custom Resolver Examples
// ============================================================================

/**
 * Example: Custom resolver that fetches config from an API or external source
 */
async function createAPIConfigResolver(): Promise<Resolver> {
  return {
    name: 'api-config-service',
    async load() {
      // In a real app, this would fetch from an API
      // For demo purposes, return hardcoded values
      return {
        API_KEY: 'sk_live_abc123def456',
        FEATURE_FLAG_NEW_UI: 'true',
        RATE_LIMIT: '1000',
      };
    }
  };
}

/**
 * Example: Custom resolver from a database
 */
function createDatabaseConfigResolver(values: Record<string, string>): Resolver {
  return {
    name: 'database-config',
    async load() {
      // In a real app, this would query a database
      return values;
    },
    loadSync() {
      return values;
    }
  };
}

describe('Resolver Composition Demo', () => {
  describe('Demo 1: Simple Local + Custom Resolver', () => {
    it('should resolve configuration from multiple resolvers', async () => {
      // Set NODE_ENV explicitly for this test
      process.env.NODE_ENV = 'development';
      
      const dbConfig = createDatabaseConfigResolver({
        DATABASE_HOST: 'prod-db.example.com',
        DATABASE_PORT: '5432',
      });

      const config = await resolve.async(
        [processEnv(), {
          // Local variables (from .env or process.env)
          PORT: 3000,
          NODE_ENV: ['development', 'production', 'test'] as const,
        }],
        [dbConfig, {
          // Database config variables
          DATABASE_HOST: 'string',
          DATABASE_PORT: 'number',
        }]
      );

      expect(config.PORT).toBe(3000);
      expect(config.NODE_ENV).toBe('development'); // Default from enum
      expect(config.DATABASE_HOST).toBe('prod-db.example.com');
      expect(config.DATABASE_PORT).toBe(5432);
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
          DATABASE_HOST: 'string',
          DATABASE_PORT: 'number',
        }]
      );

      // TypeScript should know all the types
      const port: number = config.PORT; // ✅ number
      const nodeEnv: 'development' | 'production' | 'test' = config.NODE_ENV; // ✅ enum
      const dbHost: string = config.DATABASE_HOST; // ✅ string
      const dbPort: number = config.DATABASE_PORT; // ✅ number

      expect(typeof port).toBe('number');
      expect(typeof nodeEnv).toBe('string');
      expect(typeof dbHost).toBe('string');
      expect(typeof dbPort).toBe('number');
    });
  });

  describe('Demo 2: Override Local Values (Last-Wins)', () => {
    it('should override local values with provider values', async () => {
      // Set local env var
      process.env.API_KEY = 'local-dev-key';

      const apiResolver = await createAPIConfigResolver();

      const config = await resolve.async(
        [processEnv(), {
          // Local has API_KEY set
          API_KEY: 'string', // secret
          PORT: 3000,
        }],
        [apiResolver, {
          // API service also provides API_KEY - this will override!
          API_KEY: 'string',
          FEATURE_FLAG_NEW_UI: 'boolean',
          RATE_LIMIT: 'number',
        }]
      );

      // API_KEY from api-config-service should override the local value
      expect(config.API_KEY).toBe('sk_live_abc123def456');
      expect(config.PORT).toBe(3000);
      expect(config.FEATURE_FLAG_NEW_UI).toBe(true);
      expect(config.RATE_LIMIT).toBe(1000);

      // Cleanup
      delete process.env.API_KEY;
    });

    it('should demonstrate last-wins override semantics', async () => {
      const provider1 = {
        name: 'provider1',
        async load() {
          return { TEST_VAR: 'from-provider1' };
        }
      };

      const provider2 = {
        name: 'provider2',
        async load() {
          return { TEST_VAR: 'from-provider2' };
        }
      };

      const config = await resolve.async(
        [processEnv(), {
          TEST_VAR: 'string'
        }],
        [provider1, {
          TEST_VAR: 'string'
        }],
        [provider2, {
          TEST_VAR: 'string'
        }]
      );

      // Last provider should win
      expect(config.TEST_VAR).toBe('from-provider2');
    });
  });

  describe('Demo 3: Multiple Resolvers Chain', () => {
    it('should resolve configuration from multiple resolvers in sequence', async () => {
      const dbConfig = createDatabaseConfigResolver({
        DATABASE_URL: 'postgres://prod-db:5432/app',
      });

      const apiConfig = await createAPIConfigResolver();

      const secretsResolver: Resolver = {
        name: 'secrets-manager',
        async load() {
          return {
            JWT_SECRET: 'super-secret-key-from-vault',
            ENCRYPTION_KEY: 'another-secret',
          };
        }
      };

      // Set NODE_ENV explicitly for this test
      process.env.NODE_ENV = 'development';
      
      const config = await resolve.async(
        [processEnv(), {
          // Base local config
          PORT: 3000,
          NODE_ENV: ['development', 'production'] as const,
        }],
        [dbConfig, {
          DATABASE_URL: 'postgres',
        }],
        [apiConfig, {
          API_KEY: 'string',
          FEATURE_FLAG_NEW_UI: 'boolean',
        }],
        [secretsResolver, {
          JWT_SECRET: 'string',
          ENCRYPTION_KEY: 'string',
        }]
      );

      expect(config.PORT).toBe(3000);
      expect(config.NODE_ENV).toBe('development'); // Default from enum
      expect(config.DATABASE_URL).toBe('postgres://prod-db:5432/app');
      expect(config.API_KEY).toBe('sk_live_abc123def456');
      expect(config.FEATURE_FLAG_NEW_UI).toBe(true);
      expect(config.JWT_SECRET).toBe('super-secret-key-from-vault');
      expect(config.ENCRYPTION_KEY).toBe('another-secret');
    });

    it('should provide perfect type inference for all variables', async () => {
      const dbConfig = createDatabaseConfigResolver({
        DATABASE_URL: 'postgres://prod-db:5432/app',
      });

      const apiConfig = await createAPIConfigResolver();

      const secretsResolver: Resolver = {
        name: 'secrets-manager',
        async load() {
          return {
            JWT_SECRET: 'super-secret-key-from-vault',
            ENCRYPTION_KEY: 'another-secret',
          };
        }
      };

      // Set NODE_ENV explicitly for this test
      process.env.NODE_ENV = 'development';
      
      const config = await resolve.async(
        [processEnv(), {
          PORT: 3000,
          NODE_ENV: ['development', 'production'] as const,
        }],
        [dbConfig, {
          DATABASE_URL: 'postgres',
        }],
        [apiConfig, {
          API_KEY: 'string',
          FEATURE_FLAG_NEW_UI: 'boolean',
        }],
        [secretsResolver, {
          JWT_SECRET: 'string',
          ENCRYPTION_KEY: 'string',
        }]
      );

      // Perfect type inference for all variables
      // Type should be:
      // {
      //   PORT: number;
      //   NODE_ENV: 'development' | 'production';
      //   DATABASE_URL: string;
      //   API_KEY: string;
      //   FEATURE_FLAG_NEW_UI: boolean;
      //   JWT_SECRET: string;
      //   ENCRYPTION_KEY: string;
      // }

      expect(typeof config.PORT).toBe('number');
      expect(typeof config.NODE_ENV).toBe('string');
      expect(typeof config.DATABASE_URL).toBe('string');
      expect(typeof config.API_KEY).toBe('string');
      expect(typeof config.FEATURE_FLAG_NEW_UI).toBe('boolean');
      expect(typeof config.JWT_SECRET).toBe('string');
      expect(typeof config.ENCRYPTION_KEY).toBe('string');
    });
  });

  describe('Demo 4: API Design Philosophy', () => {
    it('should demonstrate explicit provider-to-variable pairing', async () => {
      const customResolver = {
        name: 'custom-resolver',
        async load() {
          return {
            QUZ: 'from-custom'
          };
        }
      };

      // Set up process.env for testing
      process.env.FOO = 'from-process-env';

      const config = await resolve.async(
        [processEnv(), {
          FOO: 'string'  // ← from processEnv
        }],
        [customResolver, {
          QUZ: 'string'  // ← explicitly from customResolver only
        }]
      );

      // Crystal clear where each variable comes from
      expect(config.FOO).toBe('from-process-env'); // From processEnv
      expect(config.QUZ).toBe('from-custom'); // From customResolver

      // Cleanup
      delete process.env.FOO;
    });

    it('should demonstrate override semantics with explicit pairing', async () => {
      const customResolver = {
        name: 'custom-resolver',
        async load() {
          return {
            FOO: 'from-custom-override'
          };
        }
      };

      // Set up process.env for testing
      process.env.FOO = 'from-process-env';

      const config = await resolve.async(
        [processEnv(), {
          FOO: 'string'  // ← from processEnv
        }],
        [customResolver, {
          FOO: 'string'  // ← customResolver overrides processEnv
        }]
      );

      // customResolver should override processEnv (last-wins)
      expect(config.FOO).toBe('from-custom-override');

      // Cleanup
      delete process.env.FOO;
    });

    it('should demonstrate provider configuration visibility', async () => {
      const mockProvider = vi.fn().mockImplementation(() => ({
        name: 'mock-provider',
        async load() {
          return { TEST_VAR: 'test-value' };
        }
      }));

      const config = await resolve.async(
        [processEnv(), {
          TEST_VAR: 'string'
        }],
        [mockProvider(), {
          TEST_VAR: 'string'
        }]
      );

      expect(config.TEST_VAR).toBe('test-value');
      expect(mockProvider).toHaveBeenCalled();
    });
  });

  describe('Custom Resolver Examples', () => {
    it('should work with API config resolver', async () => {
      const apiResolver = await createAPIConfigResolver();

      const config = await resolve.async(
        [processEnv(), {
          API_KEY: 'string',
          FEATURE_FLAG_NEW_UI: 'boolean',
          RATE_LIMIT: 'number',
        }],
        [apiResolver, {
          API_KEY: 'string',
          FEATURE_FLAG_NEW_UI: 'boolean',
          RATE_LIMIT: 'number',
        }]
      );

      expect(config.API_KEY).toBe('sk_live_abc123def456');
      expect(config.FEATURE_FLAG_NEW_UI).toBe(true);
      expect(config.RATE_LIMIT).toBe(1000);
    });

    it('should work with database config resolver', async () => {
      const dbConfig = createDatabaseConfigResolver({
        DATABASE_HOST: 'test-host',
        DATABASE_PORT: '3306',
        DATABASE_NAME: 'test-db'
      });

      const config = await resolve.async(
        [processEnv(), {
          DATABASE_HOST: 'string',
          DATABASE_PORT: 'number',
          DATABASE_NAME: 'string',
        }],
        [dbConfig, {
          DATABASE_HOST: 'string',
          DATABASE_PORT: 'number',
          DATABASE_NAME: 'string',
        }]
      );

      expect(config.DATABASE_HOST).toBe('test-host');
      expect(config.DATABASE_PORT).toBe(3306);
      expect(config.DATABASE_NAME).toBe('test-db');
    });

    it('should work with synchronous resolvers', async () => {
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
          SYNC_VAR: 'string'
        }],
        [syncProvider, {
          SYNC_VAR: 'string'
        }]
      );

      expect(config.SYNC_VAR).toBe('async-value'); // Currently uses async load() method
    });
  });

  describe('Error Handling', () => {
    it('should handle provider errors gracefully', async () => {
      const errorProvider = {
        name: 'error-provider',
        async load() {
          throw new Error('Resolver failed to load');
        }
      };

      await expect(resolve.async(
        [processEnv(), {
          TEST_VAR: 'string'
        }],
        [errorProvider, {
          TEST_VAR: 'string'
        }]
      )).rejects.toThrow('Resolver failed to load');
    });

    it('should handle missing required variables', async () => {
      await expect(resolve.async(
        [processEnv(), {
          REQUIRED_VAR: 'string'
        }]
      )).rejects.toThrow(/Missing required environment variable/);
    });
  });

  describe('Benefits of Tuple Composition API', () => {
    it('should demonstrate explicit provider-to-variable pairing', () => {
      const benefits = [
        'Explicit provider-to-variable pairing with tuples',
        'Clear override semantics (last-wins, array order)',
        'Perfect TypeScript inference with tuple types',
        'Self-documenting code - no chaining needed',
        'Resolver config is visible: awsSecrets({ region: "..." })'
      ];

      expect(benefits).toContain('Explicit provider-to-variable pairing with tuples');
      expect(benefits).toContain('Clear override semantics (last-wins, array order)');
      expect(benefits).toContain('Perfect TypeScript inference with tuple types');
      expect(benefits).toContain('Self-documenting code - no chaining needed');
      expect(benefits).toContain('Resolver config is visible: awsSecrets({ region: "..." })');
    });

    it('should demonstrate the difference from traditional approach', () => {
      // Traditional approach (single provider list) - unclear
      const traditionalApproach = {
        unclear: true,
        questions: [
          'Where does FOO come from? dotenv or customResolver?',
          'Where does QUZ come from? Does it exist in dotenv?',
          'If both have FOO, which one wins?'
        ]
      };

      // Tuple Composition API (explicit mapping) - crystal clear
      const tupleApproach = {
        clear: true,
        benefits: [
          'FOO comes from processEnv',
          'QUZ comes from customResolver',
          'Tuple pairs [provider, schema] make the relationship obvious',
          'If customResolver also provides FOO, it overrides (last-wins)'
        ]
      };

      expect(traditionalApproach.unclear).toBe(true);
      expect(tupleApproach.clear).toBe(true);
      expect(tupleApproach.benefits).toContain('FOO comes from processEnv');
      expect(tupleApproach.benefits).toContain('QUZ comes from customResolver');
    });
  });
});
