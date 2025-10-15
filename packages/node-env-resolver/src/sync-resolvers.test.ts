import { describe, it, expect, beforeEach } from 'vitest';
import { resolve, safeResolve, SyncResolver, AsyncResolver, isSyncResolver, isAsyncOnlyResolver, string, enums, number } from './index';
import { dotenv, json, processEnv } from './resolvers';

describe('Sync Resolvers', () => {
  beforeEach(() => {
    // Clear env vars for clean tests
    Object.keys(process.env).forEach(key => {
      if (key.startsWith('TEST_')) {
        delete process.env[key];
      }
    });
  });

  describe('Type Guards', () => {
    it('should correctly identify sync resolvers', () => {
      const syncResolver: SyncResolver = {
        name: 'sync',
        async load() { return {}; },
        loadSync() { return {}; }
      };

      expect(isSyncResolver(syncResolver)).toBe(true);
      expect(isAsyncOnlyResolver(syncResolver)).toBe(false);
    });

    it('should correctly identify async-only resolvers', () => {
      const asyncResolver: AsyncResolver = {
        name: 'async',
        async load() { return {}; }
      };

      expect(isSyncResolver(asyncResolver)).toBe(false);
      expect(isAsyncOnlyResolver(asyncResolver)).toBe(true);
    });
  });

  describe('resolve() - Synchronous', () => {
    it('should work with no resolvers (uses process.env)', () => {
      process.env.TEST_VAR = 'test-value';
      process.env.TEST_PORT = '3000';

      const config = resolve({
        TEST_VAR: string(),
        TEST_PORT: number(),
        TEST_MISSING: string({optional:true})
      });

      expect(config.TEST_VAR).toBe('test-value');
      expect(config.TEST_PORT).toBe(3000);
      expect(config.TEST_MISSING).toBeUndefined();
    });

    it('should work with sync resolvers', () => {
      const customResolver: SyncResolver = {
        name: 'custom',
        async load() {
          return { CUSTOM_VAR: 'from-resolver' };
        },
        loadSync() {
          return { CUSTOM_VAR: 'from-resolver' };
        }
      };

      const config = resolve([
        customResolver,
        { CUSTOM_VAR: string() }
      ]);

      expect(config.CUSTOM_VAR).toBe('from-resolver');
    });

    it('should throw error when async-only resolver is passed', () => {
      const asyncOnlyResolver = {
        name: 'async-only',
        async load() {
          return { ASYNC_VAR: 'value' };
        }
        // Note: no loadSync()
      };

      expect(() => {
        resolve([
          // @ts-expect-error - Testing runtime validation
          asyncOnlyResolver,
          { ASYNC_VAR: string() }
        ]);
      }).toThrow(/does not support synchronous loading/);
    });

    it('should support multiple sync resolvers with priority: last (default)', () => {
      const resolver1: SyncResolver = {
        name: 'resolver1',
        async load() {
          return { SHARED: 'from-resolver1', ONLY_IN_1: 'value1' };
        },
        loadSync() {
          return { SHARED: 'from-resolver1', ONLY_IN_1: 'value1' };
        }
      };

      const resolver2: SyncResolver = {
        name: 'resolver2',
        async load() {
          return { SHARED: 'from-resolver2', ONLY_IN_2: 'value2' };
        },
        loadSync() {
          return { SHARED: 'from-resolver2', ONLY_IN_2: 'value2' };
        }
      };

      const config = resolve(
        [resolver1, { SHARED: string(), ONLY_IN_1: string() }],
        [resolver2, { SHARED: string(), ONLY_IN_2: string() }]
      );

      // With priority: 'last' (default), resolver2 wins for SHARED
      expect(config.SHARED).toBe('from-resolver2');
      expect(config.ONLY_IN_1).toBe('value1');
      expect(config.ONLY_IN_2).toBe('value2');
    });

    it('should support multiple sync resolvers with priority: first', () => {
      const resolver1: SyncResolver = {
        name: 'resolver1',
        async load() {
          return { SHARED: 'from-resolver1', ONLY_IN_1: 'value1' };
        },
        loadSync() {
          return { SHARED: 'from-resolver1', ONLY_IN_1: 'value1' };
        }
      };

      const resolver2: SyncResolver = {
        name: 'resolver2',
        async load() {
          return { SHARED: 'from-resolver2', ONLY_IN_2: 'value2' };
        },
        loadSync() {
          return { SHARED: 'from-resolver2', ONLY_IN_2: 'value2' };
        }
      };

      const config = resolve(
        [resolver1, { SHARED: string(), ONLY_IN_1: string() }],
        [resolver2, { SHARED: string(), ONLY_IN_2: string() }],
        { priority: 'first' }
      );

      // With priority: 'first', resolver1 wins for SHARED
      expect(config.SHARED).toBe('from-resolver1');
      expect(config.ONLY_IN_1).toBe('value1');
      expect(config.ONLY_IN_2).toBe('value2');
    });

    it('should merge schemas from multiple resolvers', () => {
      const resolver1: SyncResolver = {
        name: 'resolver1',
        async load() {
          return { PORT: '3000' };
        },
        loadSync() {
          return { PORT: '3000' };
        }
      };

      const resolver2: SyncResolver = {
        name: 'resolver2',
        async load() {
          return { DATABASE_URL: '//localhost' };
        },
        loadSync() {
          return { DATABASE_URL: '//localhost' };
        }
      };

      const config = resolve(
        [resolver1, { PORT: number() }],
        [resolver2, { DATABASE_URL: string() }]
      );

      expect(config.PORT).toBe(3000);
      expect(config.DATABASE_URL).toBe('//localhost');
    });
  });

  describe('resolve.async() - Asynchronous', () => {
    it('should work with async-only resolvers', async () => {
      const asyncResolver: AsyncResolver = {
        name: 'async',
        async load() {
          await new Promise(resolve => setTimeout(resolve, 10));
          return { ASYNC_VAR: 'async-value' };
        }
      };

      const config = await resolve.async([
        asyncResolver,
        { ASYNC_VAR: string() }
      ]);

      expect(config.ASYNC_VAR).toBe('async-value');
    });

    it('should work with sync resolvers in async mode', async () => {
      const syncResolver: SyncResolver = {
        name: 'sync',
        async load() { return { SYNC_VAR: 'sync-value' }; },
        loadSync() { return { SYNC_VAR: 'sync-value' }; }
      };

      const config = await resolve.async([
        syncResolver,
        { SYNC_VAR: string() }
      ]);

      expect(config.SYNC_VAR).toBe('sync-value');
    });

    it('should work with built-in sync resolvers like processEnv in async mode', async () => {
      process.env.TEST_ASYNC_VAR = 'test-value';

      // processEnv() is a sync resolver but should work with resolve.async()
      const config = await resolve.async([
        processEnv(),
        { TEST_ASYNC_VAR: string() }
      ]);

      expect(config.TEST_ASYNC_VAR).toBe('test-value');
      delete process.env.TEST_ASYNC_VAR;
    });
  });

  describe('safeResolve() - Error Handling', () => {
    it('should return success for valid sync resolution', () => {
      process.env.TEST_VAR = 'value';

      const result = safeResolve({
        TEST_VAR: string()
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.TEST_VAR).toBe('value');
      }
    });

    it('should return error for missing required variables', () => {
      const result = safeResolve({
        MISSING_REQUIRED: string()
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('Missing required');
      }
    });

    it('should return error when async resolver passed to sync safeResolve', () => {
      const asyncResolver = {
        name: 'async',
        async load() { return {}; }
      };

      const result = safeResolve([
        // @ts-expect-error - Testing runtime validation
        asyncResolver,
        { VAR: string() }
      ]);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('does not support synchronous loading');
      }
    });
  });

  describe('safeResolve.async() - Async Error Handling', () => {
    it('should return success for valid async resolution', async () => {
      const asyncResolver: AsyncResolver = {
        name: 'async',
        async load() {
          return { ASYNC_VAR: 'value' };
        }
      };

      const result = await safeResolve.async([
        asyncResolver,
        { ASYNC_VAR: string() }
      ]);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.ASYNC_VAR).toBe('value');
      }
    });

    it('should return error for resolver failures', async () => {
      const failingResolver = {
        name: 'failing',
        async load() {
          throw new Error('Resolver failed');
        }
      };

      const result = await safeResolve.async([
        failingResolver,
        { VAR: string() }
      ], { strict: true });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('Resolver failed');
      }
    });
  });

  describe('Built-in Resolvers', () => {
    it('processEnv should be a SyncResolver', () => {
      const resolver = processEnv();
      expect(isSyncResolver(resolver)).toBe(true);
    });

    it('dotenv should be a SyncResolver', () => {
      const resolver = dotenv();
      expect(isSyncResolver(resolver)).toBe(true);
    });

    it('json should be a SyncResolver', () => {
      const resolver = json('test.json');
      expect(isSyncResolver(resolver)).toBe(true);
    });
  });

  describe('Type Safety', () => {
    it('should infer types correctly for sync resolve', () => {
      // Set up test env vars
      process.env.STRING_VAR = 'test-string';
      process.env.ENUM = 'dev';

      const config = resolve({
        STRING_VAR: string(),
        NUMBER_VAR: 3000,  // Has default, won't fail
        BOOL_VAR: false,   // Has default, won't fail
        OPTIONAL: string({optional:true}), // Optional, won't fail
        ENUM: enums(['dev', 'prod'])
      });

      // TypeScript should infer these types correctly
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const _str: string = config.STRING_VAR;
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const _num: number = config.NUMBER_VAR;
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const _bool: boolean = config.BOOL_VAR;
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const _opt: string | undefined = config.OPTIONAL;
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const _enum: 'dev' | 'prod' = config.ENUM as 'dev' | 'prod';

      // Verify actual values
      expect(config.STRING_VAR).toBe('test-string');
      expect(config.NUMBER_VAR).toBe(3000);
      expect(config.BOOL_VAR).toBe(false);
      expect(config.OPTIONAL).toBeUndefined();
      expect(config.ENUM).toBe('dev');
    });

    it('should infer types correctly for async resolve', async () => {
      // Set up test env var
      process.env.STRING_VAR = 'test-string';

      const config = await resolve.async([
        processEnv(),
        {
          STRING_VAR: string(),
          NUMBER_VAR: 3000,  // Has default, won't fail
          BOOL_VAR: false,   // Has default, won't fail
        }
      ]);

      // TypeScript should infer these types correctly
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const _str: string = config.STRING_VAR;
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const _num: number = config.NUMBER_VAR;
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const _bool: boolean = config.BOOL_VAR;

      // Verify actual values
      expect(config.STRING_VAR).toBe('test-string');
      expect(config.NUMBER_VAR).toBe(3000);
      expect(config.BOOL_VAR).toBe(false);
    });
  });
});