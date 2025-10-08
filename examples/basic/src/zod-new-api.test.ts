/**
 * Tests for new Zod API (resolveZod, safeResolveZod, etc.)
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { resolveZod, safeResolveZod, resolveSyncZod, safeResolveSyncZod } from 'node-env-resolver/zod';
import { z } from 'zod';

const originalEnv = process.env;

describe('New Zod API', () => {
  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('resolveZod() - throws on error', () => {
    it('should resolve with valid environment variables', async () => {
      process.env.PORT = '8080';
      process.env.DATABASE_URL = 'https://example.com';

      const schema = z.object({
        PORT: z.coerce.number(),
        DATABASE_URL: z.string().url(),
      });

      const env = await resolveZod(schema);

      expect(env.PORT).toBe(8080);
      expect(env.DATABASE_URL).toBe('https://example.com');
    });

    it('should throw on validation error', async () => {
      process.env.PORT = 'not-a-number';

      const schema = z.object({
        PORT: z.coerce.number(),
      });

      await expect(resolveZod(schema)).rejects.toThrow();
    });

    it('should use defaults', async () => {
      const schema = z.object({
        PORT: z.coerce.number().default(3000),
      });

      const env = await resolveZod(schema);

      expect(env.PORT).toBe(3000);
    });
  });

  describe('safeResolveZod() - returns result object', () => {
    it('should return success result with valid data', async () => {
      process.env.PORT = '8080';
      process.env.DATABASE_URL = 'https://example.com';

      const schema = z.object({
        PORT: z.coerce.number(),
        DATABASE_URL: z.string().url(),
      });

      const result = await safeResolveZod(schema);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.PORT).toBe(8080);
        expect(result.data.DATABASE_URL).toBe('https://example.com');
      }
    });

    it('should return error result on validation failure', async () => {
      process.env.DATABASE_URL = 'not-a-url';

      const schema = z.object({
        DATABASE_URL: z.string().url(),
      });

      const result = await safeResolveZod(schema);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('Invalid');
      }
    });

    it('should handle missing required fields', async () => {
      const schema = z.object({
        REQUIRED_VAR: z.string(),
      });

      const result = await safeResolveZod(schema);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBeTruthy();
      }
    });
  });

  describe('resolveSyncZod() - sync version that throws', () => {
    it('should resolve synchronously with valid data', () => {
      process.env.PORT = '8080';

      const schema = z.object({
        PORT: z.coerce.number(),
      });

      const env = resolveSyncZod(schema);

      expect(env.PORT).toBe(8080);
    });

    it('should throw on validation error', () => {
      process.env.PORT = 'not-a-number';

      const schema = z.object({
        PORT: z.coerce.number(),
      });

      expect(() => resolveSyncZod(schema)).toThrow();
    });
  });

  describe('safeResolveSyncZod() - safe sync version', () => {
    it('should return success result synchronously', () => {
      process.env.PORT = '8080';

      const schema = z.object({
        PORT: z.coerce.number(),
      });

      const result = safeResolveSyncZod(schema);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.PORT).toBe(8080);
      }
    });

    it('should return error result on validation failure', () => {
      process.env.DATABASE_URL = 'not-a-url';

      const schema = z.object({
        DATABASE_URL: z.string().url(),
      });

      const result = safeResolveSyncZod(schema);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('Invalid');
      }
    });
  });

  describe('Type inference', () => {
    it('should infer correct types', async () => {
      process.env.PORT = '8080';
      process.env.NODE_ENV = 'production';
      process.env.DEBUG = 'true';

      const schema = z.object({
        PORT: z.coerce.number(),
        NODE_ENV: z.enum(['development', 'production', 'test']),
        DEBUG: z.coerce.boolean(),
      });

      const env = await resolveZod(schema);

      // Type checks
      expect(typeof env.PORT).toBe('number');
      expect(typeof env.NODE_ENV).toBe('string');
      expect(typeof env.DEBUG).toBe('boolean');

      // Value checks
      expect(env.PORT).toBe(8080);
      expect(env.NODE_ENV).toBe('production');
      expect(env.DEBUG).toBe(true);
    });
  });
});
