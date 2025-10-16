/**
 * Zod Integration with Standard Schema Tests
 *
 * This example shows how to use Zod schemas with node-env-resolver
 * using the Standard Schema specification.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { processEnv } from 'node-env-resolver/resolvers';
import { resolveZod, resolveSyncZod, safeResolveSyncZod } from 'node-env-resolver/zod';
import * as z from 'zod';

// Mock process.env for testing
const originalEnv = process.env;

describe('Zod Integration with Standard Schema', () => {
  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('Zod Schema Definition', () => {
    it('should define Zod schemas correctly', () => {
      const zodSchemas = {
        NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
        PORT: z.coerce.number().default(3000),
        DATABASE_URL: z.url(),
        DEBUG: z.coerce.boolean().optional(),
      };

      expect(zodSchemas.NODE_ENV).toBeDefined();
      expect(zodSchemas.PORT).toBeDefined();
      expect(zodSchemas.DATABASE_URL).toBeDefined();
      expect(zodSchemas.DEBUG).toBeDefined();
    });

    it('should validate Zod schemas independently', async () => {
      const zodSchemas = {
        NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
        PORT: z.coerce.number().default(3000),
        DATABASE_URL: z.url(),
        DEBUG: z.coerce.boolean().optional(),
      };

      // Test NODE_ENV validation
      const nodeEnvResult = await zodSchemas.NODE_ENV.safeParseAsync('production');
      expect(nodeEnvResult.success).toBe(true);
      if (nodeEnvResult.success) {
        expect(nodeEnvResult.data).toBe('production');
      }

      // Test PORT validation
      const portResult = await zodSchemas.PORT.safeParseAsync('8080');
      expect(portResult.success).toBe(true);
      if (portResult.success) {
        expect(portResult.data).toBe(8080);
      }

      // Test DATABASE_URL validation
      const urlResult = await zodSchemas.DATABASE_URL.safeParseAsync('https://example.com');
      expect(urlResult.success).toBe(true);
      if (urlResult.success) {
        expect(urlResult.data).toBe('https://example.com');
      }

      // Test DEBUG validation
      const debugResult = await zodSchemas.DEBUG.safeParseAsync('true');
      expect(debugResult.success).toBe(true);
      if (debugResult.success) {
        expect(debugResult.data).toBe(true);
      }
    });

    it('should handle invalid Zod schema values', async () => {
      const zodSchemas = {
        NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
        PORT: z.coerce.number().default(3000),
        DATABASE_URL: z.url(),
        DEBUG: z.coerce.boolean().optional(),
      };

      // Test invalid NODE_ENV
      const invalidNodeEnvResult = await zodSchemas.NODE_ENV.safeParseAsync('invalid');
      expect(invalidNodeEnvResult.success).toBe(false);

      // Test invalid PORT
      const invalidPortResult = await zodSchemas.PORT.safeParseAsync('not-a-number');
      expect(invalidPortResult.success).toBe(false);

      // Test invalid DATABASE_URL
      const invalidUrlResult = await zodSchemas.DATABASE_URL.safeParseAsync('not-a-url');
      expect(invalidUrlResult.success).toBe(false);

      // Test DEBUG coercion - 'maybe' gets coerced to true
      const debugResult = await zodSchemas.DEBUG.safeParseAsync('maybe');
      expect(debugResult.success).toBe(true);
      expect(debugResult.data).toBe(true);
    });
  });

  describe('Integration with node-env-resolver', () => {
    it('should work with node-env-resolver using Standard Schema', async () => {
      // Set up environment variables
      process.env.NODE_ENV = 'production';
      process.env.PORT = '8080';
      process.env.DATABASE_URL = 'https://example.com';
      process.env.DEBUG = 'true';

      const zodSchema = z.object({
        NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
        PORT: z.coerce.number().default(3000),
        DATABASE_URL: z.url(),
        DEBUG: z.coerce.boolean().optional(),
      });

      // Use the proper Zod integration
      const config = await resolveZod(zodSchema, {
        resolvers: [processEnv()],
      });

      expect(config.NODE_ENV).toBe('production');
      expect(config.PORT).toBe(8080);
      expect(config.DATABASE_URL).toBe('https://example.com');
      expect(config.DEBUG).toBe(true);
    });

    it('should handle missing environment variables with defaults', async () => {
      // Clear environment variables to test defaults
      delete process.env.NODE_ENV;
      delete process.env.PORT;
      delete process.env.DATABASE_URL;
      delete process.env.DEBUG;

      const zodSchema = z.object({
        NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
        PORT: z.coerce.number().default(3000),
        DATABASE_URL: z.url(),
        DEBUG: z.coerce.boolean().optional(),
      });

      // Use the proper Zod integration - should throw error since DATABASE_URL is required
      await expect(resolveZod(zodSchema, {
        resolvers: [processEnv()],
      })).rejects.toThrow();
    });

    it('should handle validation errors gracefully', async () => {
      // Set up invalid environment variables
      process.env.NODE_ENV = 'invalid';
      process.env.PORT = 'not-a-number';
      process.env.DATABASE_URL = 'not-a-url';
      process.env.DEBUG = 'maybe';

      const zodSchema = z.object({
        NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
        PORT: z.coerce.number().default(3000),
        DATABASE_URL: z.url(),
        DEBUG: z.coerce.boolean().optional(),
      });

      // Use the proper Zod integration - should throw error for invalid values
      await expect(resolveZod(zodSchema, {
        resolvers: [processEnv()],
      })).rejects.toThrow();
    });
  });

  describe('TypeScript Integration', () => {
    it('should provide correct TypeScript types', async () => {
      // Set up environment variables
      process.env.NODE_ENV = 'production';
      process.env.PORT = '8080';
      process.env.DATABASE_URL = 'https://example.com';
      process.env.DEBUG = 'true';

      const zodSchema = z.object({
        NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
        PORT: z.coerce.number().default(3000),
        DATABASE_URL: z.url(),
        DEBUG: z.coerce.boolean().optional(),
      });

      // Use the proper Zod integration
      const config = await resolveZod(zodSchema, {
        resolvers: [processEnv()],
      });

      // TypeScript should know the exact types
      expect(typeof config.NODE_ENV).toBe('string');
      expect(typeof config.PORT).toBe('number');
      expect(typeof config.DATABASE_URL).toBe('string');
      expect(typeof config.DEBUG).toBe('boolean');

      // Test type-specific behavior
      if (config.DEBUG) {
        expect(config.DEBUG).toBe(true);
      }

      expect(config.PORT).toBeGreaterThan(0);
    });
  });

  describe('Sync Zod Functions', () => {
    it('should work with resolveSyncZod', () => {
      // Set up environment variables
      process.env.NODE_ENV = 'production';
      process.env.PORT = '8080';
      process.env.DATABASE_URL = 'https://example.com';
      process.env.DEBUG = 'true';

      const zodSchema = z.object({
        NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
        PORT: z.coerce.number().default(3000),
        DATABASE_URL: z.string().url(),
        DEBUG: z.coerce.boolean().optional(),
      });

      // Use sync Zod integration
      const config = resolveSyncZod(zodSchema, {
        resolvers: [processEnv()],
      });

      expect(config.NODE_ENV).toBe('production');
      expect(config.PORT).toBe(8080);
      expect(config.DATABASE_URL).toBe('https://example.com');
      expect(config.DEBUG).toBe(true);
    });

    it('should work with safeResolveSyncZod - success case', () => {
      process.env.NODE_ENV = 'development';
      process.env.PORT = '3000';
      process.env.DATABASE_URL = 'https://db.example.com';

      const zodSchema = z.object({
        NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
        PORT: z.coerce.number().default(3000),
        DATABASE_URL: z.string().url(),
        DEBUG: z.coerce.boolean().optional(),
      });

      const result = safeResolveSyncZod(zodSchema, {
        resolvers: [processEnv()],
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.NODE_ENV).toBe('development');
        expect(result.data.PORT).toBe(3000);
        expect(result.data.DATABASE_URL).toBe('https://db.example.com');
      }
    });

    it('should work with safeResolveSyncZod - error case', () => {
      process.env.NODE_ENV = 'invalid';
      process.env.PORT = '8080';
      process.env.DATABASE_URL = 'not-a-url';

      const zodSchema = z.object({
        NODE_ENV: z.enum(['development', 'production', 'test']),
        PORT: z.coerce.number(),
        DATABASE_URL: z.string().url(),
      });

      const result = safeResolveSyncZod(zodSchema, {
        resolvers: [processEnv()],
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBeTruthy();
        expect(typeof result.error).toBe('string');
      }
    });

    it('should handle defaults in sync mode', () => {
      delete process.env.NODE_ENV;
      delete process.env.PORT;
      delete process.env.DEBUG;
      process.env.DATABASE_URL = 'https://example.com';

      const zodSchema = z.object({
        NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
        PORT: z.coerce.number().default(3000),
        DATABASE_URL: z.string().url(),
        DEBUG: z.coerce.boolean().optional(),
      });

      const config = resolveSyncZod(zodSchema, {
        resolvers: [processEnv()],
      });

      expect(config.NODE_ENV).toBe('development');
      expect(config.PORT).toBe(3000);
      expect(config.DATABASE_URL).toBe('https://example.com');
      expect(config.DEBUG).toBeUndefined();
    });

    it('should throw error in sync mode for invalid values', () => {
      process.env.PORT = 'invalid-port';
      process.env.DATABASE_URL = 'https://example.com';

      const zodSchema = z.object({
        PORT: z.coerce.number(),
        DATABASE_URL: z.string().url(),
      });

      expect(() => {
        resolveSyncZod(zodSchema, {
          resolvers: [processEnv()],
        });
      }).toThrow();
    });

    it('should have correct TypeScript types in sync mode', () => {
      process.env.PORT = '4000';
      process.env.ENABLED = 'true';

      const zodSchema = z.object({
        PORT: z.coerce.number(),
        ENABLED: z.coerce.boolean(),
      });

      const config = resolveSyncZod(zodSchema, {
        resolvers: [processEnv()],
      });

      // TypeScript should know the exact types
      expect(typeof config.PORT).toBe('number');
      expect(typeof config.ENABLED).toBe('boolean');
      expect(config.PORT).toBe(4000);
      expect(config.ENABLED).toBe(true);
    });
  });
});
