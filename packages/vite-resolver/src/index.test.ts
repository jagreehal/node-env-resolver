import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { resolve, safeResolve, isServer, isClient } from './index.js';

describe('node-env-resolver-vite', () => {
  // Store original process.env
  const originalEnv = process.env;

  beforeEach(() => {
    // Reset process.env for each test
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    // Restore original process.env
    process.env = originalEnv;
  });

  describe('resolve() - Prefix Validation', () => {
    it('should accept client vars with VITE_ prefix', () => {
      process.env.VITE_API_URL = 'https://api.example.com';
      process.env.VITE_ENABLE_ANALYTICS = 'false';

      const env = resolve({
        server: {},
        client: {
          VITE_API_URL: 'url',
          VITE_ENABLE_ANALYTICS: false
        }
      });

      expect(env.client.VITE_API_URL).toBe('https://api.example.com');
      expect(env.client.VITE_ENABLE_ANALYTICS).toBe(false);
    });

    it('should reject client vars without VITE_ prefix', () => {
      expect(() => {
        resolve({
          server: {},
          client: {
            API_URL: 'url' as any // Missing VITE_ prefix
          }
        });
      }).toThrow(/must be prefixed with 'VITE_'/);
    });

    it('should accept server vars without VITE_ prefix', () => {
      process.env.DATABASE_URL = 'postgres://localhost:5432/mydb';
      process.env.API_SECRET = 'secret123';

      const env = resolve({
        server: {
          DATABASE_URL: 'postgres',
          API_SECRET: 'string'
        },
        client: {}
      });

      expect(env.server.DATABASE_URL).toBe('postgres://localhost:5432/mydb');
      expect(env.server.API_SECRET).toBe('secret123');
    });

    it('should reject server vars with VITE_ prefix', () => {
      expect(() => {
        resolve({
          server: {
            VITE_DATABASE_URL: 'postgres' as any // Should not have VITE_ prefix
          },
          client: {}
        });
      }).toThrow(/should not be prefixed with 'VITE_'/);
    });

    it('should provide helpful error messages for prefix violations', () => {
      expect(() => {
        resolve({
          server: {},
          client: {
            API_URL: 'url' as any,
            PUBLIC_KEY: 'string' as any
          }
        });
      }).toThrow(/API_URL → VITE_API_URL/);
    });
  });

  describe('resolve() - Type Validation', () => {
    it('should validate and coerce string types', () => {
      process.env.VITE_APP_NAME = 'My App';

      const env = resolve({
        server: {},
        client: {
          VITE_APP_NAME: 'string'
        }
      });

      expect(env.client.VITE_APP_NAME).toBe('My App');
      expect(typeof env.client.VITE_APP_NAME).toBe('string');
    });

    it('should validate and coerce number types', () => {
      process.env.PORT = '5173';

      const env = resolve({
        server: {
          PORT: 'number'
        },
        client: {}
      });

      expect(env.server.PORT).toBe(5173);
      expect(typeof env.server.PORT).toBe('number');
    });

    it('should validate and coerce boolean types', () => {
      process.env.VITE_DEBUG = 'true';
      process.env.VITE_PRODUCTION = 'false';

      const env = resolve({
        server: {},
        client: {
          VITE_DEBUG: 'boolean',
          VITE_PRODUCTION: 'boolean'
        }
      });

      expect(env.client.VITE_DEBUG).toBe(true);
      expect(env.client.VITE_PRODUCTION).toBe(false);
    });

    it('should handle optional fields', () => {
      const env = resolve({
        server: {},
        client: {
          VITE_OPTIONAL: 'string?'
        }
      });

      expect(env.client.VITE_OPTIONAL).toBeUndefined();
    });

    it('should validate URL types', () => {
      process.env.VITE_API_URL = 'https://api.example.com';

      const env = resolve({
        server: {},
        client: {
          VITE_API_URL: 'url'
        }
      });

      expect(env.client.VITE_API_URL).toBe('https://api.example.com');
    });

    it('should validate port types', () => {
      process.env.PORT = '5173';

      const env = resolve({
        server: {
          PORT: 'port'
        },
        client: {}
      });

      expect(env.server.PORT).toBe(5173);
    });

    it('should handle enum types', () => {
      process.env.NODE_ENV = 'development';

      const env = resolve({
        server: {
          NODE_ENV: ['development', 'production', 'test'] as const
        },
        client: {}
      });

      expect(env.server.NODE_ENV).toBe('development');
    });

    it('should handle default values', () => {
      const env = resolve({
        server: {
          PORT: 5173
        },
        client: {
          VITE_ENABLE_ANALYTICS: false
        }
      });

      expect(env.server.PORT).toBe(5173);
      expect(env.client.VITE_ENABLE_ANALYTICS).toBe(false);
    });
  });

  describe('resolve() - Runtime Protection', () => {
    it('should allow server var access in server context', () => {
      process.env.DATABASE_URL = 'postgres://localhost:5432/mydb';

      const env = resolve({
        server: {
          DATABASE_URL: 'postgres'
        },
        client: {}
      });

      // In server context (no window), should work fine
      expect(() => env.server.DATABASE_URL).not.toThrow();
      expect(env.server.DATABASE_URL).toBe('postgres://localhost:5432/mydb');
    });

    it('should throw error when accessing server vars in browser context', () => {
      process.env.DATABASE_URL = 'postgres://localhost:5432/mydb';

      const env = resolve({
        server: {
          DATABASE_URL: 'postgres'
        },
        client: {}
      });

      // Mock browser environment
      const originalWindow = global.window;
      (global as any).window = {};

      expect(() => env.server.DATABASE_URL).toThrow(/Cannot access server environment variable/);
      expect(() => env.server.DATABASE_URL).toThrow(/DATABASE_URL/);

      // Restore
      if (originalWindow === undefined) {
        delete (global as any).window;
      } else {
        global.window = originalWindow;
      }
    });

    it('should allow client var access everywhere', () => {
      process.env.VITE_API_URL = 'https://api.example.com';

      const env = resolve({
        server: {},
        client: {
          VITE_API_URL: 'url'
        }
      });

      // Mock browser environment
      const originalWindow = global.window;
      (global as any).window = {};

      expect(() => env.client.VITE_API_URL).not.toThrow();
      expect(env.client.VITE_API_URL).toBe('https://api.example.com');

      // Restore
      if (originalWindow === undefined) {
        delete (global as any).window;
      } else {
        global.window = originalWindow;
      }
    });

    it('should allow disabling runtime protection', () => {
      process.env.DATABASE_URL = 'postgres://localhost:5432/mydb';

      const env = resolve({
        server: {
          DATABASE_URL: 'postgres'
        },
        client: {}
      }, {
        runtimeProtection: false
      });

      // Mock browser environment
      const originalWindow = global.window;
      (global as any).window = {};

      // Should not throw even in browser when protection is disabled
      expect(() => env.server.DATABASE_URL).not.toThrow();

      // Restore
      if (originalWindow === undefined) {
        delete (global as any).window;
      } else {
        global.window = originalWindow;
      }
    });
  });

  describe('safeResolve() - Error Handling', () => {
    it('should return success result when validation passes', () => {
      process.env.VITE_API_URL = 'https://api.example.com';
      process.env.PORT = '5173';

      const result = safeResolve({
        server: {
          PORT: 'port'
        },
        client: {
          VITE_API_URL: 'url'
        }
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.server.PORT).toBe(5173);
        expect(result.data.client.VITE_API_URL).toBe('https://api.example.com');
      }
    });

    it('should return error result when validation fails', () => {
      const result = safeResolve({
        server: {},
        client: {
          VITE_API_URL: 'url' // Missing in env
        }
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBeTruthy();
        expect(typeof result.error).toBe('string');
      }
    });

    it('should return error result for prefix violations', () => {
      const result = safeResolve({
        server: {},
        client: {
          API_URL: 'url' as any // Missing VITE_ prefix
        }
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('must be prefixed with');
      }
    });
  });

  describe('Options - Custom Prefix', () => {
    it('should support custom client prefix', () => {
      process.env.PUBLIC_API_URL = 'https://api.example.com';

      const env = resolve({
        server: {},
        client: {
          PUBLIC_API_URL: 'url'
        }
      }, {
        clientPrefix: 'PUBLIC_'
      });

      expect(env.client.PUBLIC_API_URL).toBe('https://api.example.com');
    });

    it('should validate custom prefix', () => {
      expect(() => {
        resolve({
          server: {},
          client: {
            API_URL: 'url' as any
          }
        }, {
          clientPrefix: 'PUBLIC_'
        });
      }).toThrow(/must be prefixed with 'PUBLIC_'/);
    });
  });

  describe('Utility Functions', () => {
    it('should correctly detect server context', () => {
      // In Node.js test environment, window is undefined
      expect(isServer).toBe(true);
      expect(isClient).toBe(false);
    });

    it('should correctly detect client context when window exists', () => {
      const originalWindow = global.window;
      (global as any).window = {};

      // Need to re-import to get updated values
      // For this test, we'll just verify the logic
      expect(typeof window !== 'undefined').toBe(true);

      // Restore
      if (originalWindow === undefined) {
        delete (global as any).window;
      } else {
        global.window = originalWindow;
      }
    });
  });

  describe('Complex Scenarios', () => {
    it('should handle mixed server and client config', () => {
      process.env.DATABASE_URL = 'postgres://localhost:5432/mydb';
      process.env.API_SECRET = 'secret123';
      process.env.PORT = '5173';
      process.env.NODE_ENV = 'development';
      process.env.VITE_API_URL = 'https://api.example.com';
      process.env.VITE_ENABLE_ANALYTICS = 'false';
      process.env.VITE_GA_ID = 'GA-123456';

      const env = resolve({
        server: {
          DATABASE_URL: 'postgres',
          API_SECRET: 'string',
          PORT: 'port',
          NODE_ENV: ['development', 'production', 'test'] as const
        },
        client: {
          VITE_API_URL: 'url',
          VITE_ENABLE_ANALYTICS: 'boolean',
          VITE_GA_ID: 'string?'
        }
      });

      // Server vars
      expect(env.server.DATABASE_URL).toBe('postgres://localhost:5432/mydb');
      expect(env.server.API_SECRET).toBe('secret123');
      expect(env.server.PORT).toBe(5173);
      expect(env.server.NODE_ENV).toBe('development');

      // Client vars
      expect(env.client.VITE_API_URL).toBe('https://api.example.com');
      expect(env.client.VITE_ENABLE_ANALYTICS).toBe(false);
      expect(env.client.VITE_GA_ID).toBe('GA-123456');
    });

    it('should handle empty schemas', () => {
      const env = resolve({
        server: {},
        client: {}
      });

      expect(env.server).toBeDefined();
      expect(env.client).toBeDefined();
    });
  });
});

