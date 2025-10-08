import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { resolve, safeResolve } from './index';
// Mock the globalThis.window for browser detection
const originalGlobalThis = globalThis;

describe('node-env-resolver/nextjs', () => {
  beforeEach(() => {
    // Reset process.env
    delete process.env.NEXT_PUBLIC_APP_URL;
    delete process.env.DATABASE_URL;
    delete process.env.API_KEY;
    delete process.env.NODE_ENV;
    delete process.env.PORT;
    
    // Mock globalThis.window for browser detection
    (globalThis as { window?: Window }).window = undefined;
  });

  afterEach(() => {
    // Restore original globalThis
    Object.defineProperty(globalThis, 'window', {
      value: originalGlobalThis.window,
      writable: true,
      configurable: true,
    });
  });

  describe('resolveNextEnv()', () => {
    it('handles basic client/server split', () => {
      // Set environment variables
      process.env.DATABASE_URL = 'postgres://localhost:5432/test';
      process.env.API_KEY = 'secret-key';
      process.env.NEXT_PUBLIC_APP_URL = 'https://app.example.com';
      process.env.NEXT_PUBLIC_ANALYTICS_ID = 'GA-123';

      const config = resolve({
        server: {
          DATABASE_URL: 'url',
          API_KEY: 'string',
          PORT: 3000
        },
        client: {
          NEXT_PUBLIC_APP_URL: 'url',
          NEXT_PUBLIC_ANALYTICS_ID: 'string'
        }
      });

      // Server variables should be available
      expect(config.server.DATABASE_URL).toBe('postgres://localhost:5432/test');
      expect(config.server.API_KEY).toBe('secret-key');
      expect(config.server.PORT).toBe(3000); // Default is now properly handled

      // Client variables should be available
      expect(config.client.NEXT_PUBLIC_APP_URL).toBe('https://app.example.com');
      expect(config.client.NEXT_PUBLIC_ANALYTICS_ID).toBe('GA-123');
    });

    it('validates client prefix requirements', () => {
      process.env.NEXT_PUBLIC_APP_URL = 'https://app.example.com';
      process.env.INVALID_CLIENT_VAR = 'should-fail';

      expect(() => resolve({
        server: {},
        client: {
          INVALID_CLIENT_VAR: 'string' // Missing NEXT_PUBLIC_ prefix
        }
      })).toThrow(/Client environment variables must be prefixed with 'NEXT_PUBLIC_'/);
    });

    it('validates server variables should not have client prefix', () => {
      process.env.NEXT_PUBLIC_DATABASE_URL = 'postgres://localhost:5432/test';

      expect(() => resolve({
        server: {
          NEXT_PUBLIC_DATABASE_URL: 'url' // Should not have client prefix
        },
        client: {}
      })).toThrow(/Server environment variables should not be prefixed with 'NEXT_PUBLIC_'/);
    });

    it('handles custom client prefix', () => {
      process.env.CUSTOM_PREFIX_APP_URL = 'https://app.example.com';

      const config = resolve({
        server: {},
        client: {
          CUSTOM_PREFIX_APP_URL: 'url'
        }
      }, {
        clientPrefix: 'CUSTOM_PREFIX_'
      });

      expect(config.client.CUSTOM_PREFIX_APP_URL).toBe('https://app.example.com');
    });

    it('handles defaults correctly', () => {
      process.env.NODE_ENV = 'development';

      const config = resolve({
        server: {
          PORT: 3000,
          NODE_ENV: ['development', 'production']
        },
        client: {
          NEXT_PUBLIC_DEBUG: 'boolean:false'
        }
      });

      expect(config.server.PORT).toBe(3000); // Default is now properly handled
      expect(config.client.NEXT_PUBLIC_DEBUG).toBe(false); // Default is now properly handled
    });

    it('handles missing optional variables', () => {
      const config = resolve({
        server: {
          OPTIONAL_SERVER: 'string?'
        },
        client: {
          NEXT_PUBLIC_OPTIONAL_CLIENT: 'string?'
        }
      });

      expect(config.server.OPTIONAL_SERVER).toBeUndefined(); // Optional variables return undefined
      expect(config.client.NEXT_PUBLIC_OPTIONAL_CLIENT).toBeUndefined(); // Optional variables return undefined
    });

    it('handles missing required variables', () => {
      // Now properly validates required variables and throws errors
      expect(() => resolve({
        server: {
          REQUIRED_SERVER: 'string'
        },
        client: {}
      })).toThrow(/Missing required environment variable: REQUIRED_SERVER/);
    });

    it('handles enum validation', () => {
      process.env.NODE_ENV = 'development';

      process.env.NEXT_PUBLIC_ENV = 'dev';

      const config = resolve({
        server: {
          NODE_ENV: ['development', 'production', 'test']
        },
        client: {
          NEXT_PUBLIC_ENV: ['dev', 'prod']
        }
      });

      expect(config.server.NODE_ENV).toBe('development');
      expect(config.client.NEXT_PUBLIC_ENV).toBe('dev');
    });

    it('handles invalid enum values', () => {
      process.env.NODE_ENV = 'invalid';

      // Now properly validates enums and throws errors
      expect(() => resolve({
        server: {
          NODE_ENV: ['development', 'production']
        },
        client: {}
      })).toThrow(/NODE_ENV must be one of: development, production/);
    });

    it('handles URL validation', () => {
      process.env.DATABASE_URL = 'postgres://localhost:5432/test';
      process.env.NEXT_PUBLIC_APP_URL = 'https://app.example.com';

      const config = resolve({
        server: {
          DATABASE_URL: 'url'
        },
        client: {
          NEXT_PUBLIC_APP_URL: 'url'
        }
      });

      expect(config.server.DATABASE_URL).toBe('postgres://localhost:5432/test');
      expect(config.client.NEXT_PUBLIC_APP_URL).toBe('https://app.example.com');
    });

    it('throws error for invalid URLs', () => {
      process.env.DATABASE_URL = 'not-a-url';

      expect(() => resolve({
        server: {
          DATABASE_URL: 'url'
        },
        client: {}
      })).toThrow(/Environment validation failed/);
    });

    it('handles boolean validation', () => {
      process.env.DEBUG = 'true';
      process.env.NEXT_PUBLIC_ANALYTICS = 'false';

      const config = resolve({
        server: {
          DEBUG: 'boolean'
        },
        client: {
          NEXT_PUBLIC_ANALYTICS: 'boolean'
        }
      });

      expect(config.server.DEBUG).toBe(true);
      expect(config.client.NEXT_PUBLIC_ANALYTICS).toBe(false);
    });

    it('handles number validation', () => {
      process.env.PORT = '3000';
      process.env.NEXT_PUBLIC_TIMEOUT = '5000';

      const config = resolve({
        server: {
          PORT: 'number'
        },
        client: {
          NEXT_PUBLIC_TIMEOUT: 'number'
        }
      });

      expect(config.server.PORT).toBe(3000);
      expect(config.client.NEXT_PUBLIC_TIMEOUT).toBe(5000);
    });

    it('handles JSON validation', () => {
      process.env.CONFIG = '{"theme":"dark","features":["analytics"]}';
      process.env.NEXT_PUBLIC_SETTINGS = '{"debug":true}';

      const config = resolve({
        server: {
          CONFIG: 'json'
        },
        client: {
          NEXT_PUBLIC_SETTINGS: 'json'
        }
      });

      expect(config.server.CONFIG).toEqual({ theme: 'dark', features: ['analytics'] });
      expect(config.client.NEXT_PUBLIC_SETTINGS).toEqual({ debug: true });
    });

    it('handles email validation', () => {
      process.env.ADMIN_EMAIL = 'admin@example.com';
      process.env.NEXT_PUBLIC_CONTACT_EMAIL = 'contact@example.com';

      const config = resolve({
        server: {
          ADMIN_EMAIL: 'email'
        },
        client: {
          NEXT_PUBLIC_CONTACT_EMAIL: 'email'
        }
      });

      expect(config.server.ADMIN_EMAIL).toBe('admin@example.com');
      expect(config.client.NEXT_PUBLIC_CONTACT_EMAIL).toBe('contact@example.com');
    });

    it('throws error for invalid email format', () => {
      process.env.ADMIN_EMAIL = 'not-an-email';

      expect(() => resolve({
        server: {
          ADMIN_EMAIL: 'email'
        },
        client: {}
      })).toThrow(/Environment validation failed/);
    });

    it('handles port validation', () => {
      process.env.PORT = '3000';

      const config = resolve({
        server: {
          PORT: 'port'
        },
        client: {}
      });

      expect(config.server.PORT).toBe(3000);
    });

    it('throws error for invalid port numbers', () => {
      process.env.PORT = '99999'; // Port out of range

      expect(() => resolve({
        server: {
          PORT: 'port'
        },
        client: {}
      })).toThrow(/Environment validation failed/);
    });

    it('handles pattern validation', () => {
      process.env.API_KEY = 'sk_1234567890abcdef';

      const config = resolve({
        server: {
          API_KEY: 'string:/^sk_[a-zA-Z0-9]+$/'
        },
        client: {}
      });

      expect(config.server.API_KEY).toBe('sk_1234567890abcdef');
    });

    it('handles pattern mismatch', () => {
      process.env.API_KEY = 'invalid-key';

      // Now properly validates patterns and throws errors
      expect(() => resolve({
        server: {
          API_KEY: 'string:/^sk_[a-zA-Z0-9]+$/'
        },
        client: {}
      })).toThrow(/API_KEY does not match required pattern/);
    });

    it('handles secret validation', () => {
      process.env.SECRET_KEY = 'very-secret-key';

      const config = resolve({
        server: {
          SECRET_KEY: 'string'
        },
        client: {}
      });

      expect(config.server.SECRET_KEY).toBe('very-secret-key');
    });

    it('handles interpolation', () => {
      process.env.BASE_URL = 'https://api.example.com';
      process.env.API_URL = '${BASE_URL}/v1';

      // Interpolation now works properly
      const config = resolve({
        server: {
          BASE_URL: 'url',
          API_URL: 'url'
        },
        client: {}
      }, {
        interpolate: true
      });

      expect(config.server.BASE_URL).toBe('https://api.example.com');
      expect(config.server.API_URL).toBe('https://api.example.com/v1');
    });

    it('handles runtime protection', () => {
      // Mock browser environment
      (globalThis as { window?: Window }).window = {};

      process.env.SECRET_VAR = 'secret-value';
      process.env.NEXT_PUBLIC_PUBLIC_VAR = 'public-value';

      const config = resolve({
        server: {
          SECRET_VAR: 'string'
        },
        client: {
          NEXT_PUBLIC_PUBLIC_VAR: 'string'
        }
      }, {
        runtimeProtection: true
      });

      // In browser, accessing server vars should be protected
      expect(config.client.NEXT_PUBLIC_PUBLIC_VAR).toBe('public-value');
      
      // Test runtime protection - accessing server vars in browser should throw
      expect(() => {
        // This should throw due to runtime protection
        const _secret = config.server.SECRET_VAR;
        void _secret; // Suppress unused variable warning
      }).toThrow(/Cannot access server environment variable 'SECRET_VAR' in client-side code/);
    });
  });


  describe('browser detection', () => {
    it('detects browser environment correctly', () => {
      // Mock browser environment
      (globalThis as { window?: Window }).window = {};

      process.env.NEXT_PUBLIC_BROWSER_VAR = 'browser-value';

      const config = resolve({
        server: {},
        client: {
          NEXT_PUBLIC_BROWSER_VAR: 'string'
        }
      });

      expect(config.client.NEXT_PUBLIC_BROWSER_VAR).toBe('browser-value');
    });

    it('detects server environment correctly', () => {
      // Ensure window is undefined (server environment)
      (globalThis as { window?: unknown }).window = undefined;

      process.env.SERVER_VAR = 'server-value';

      const config = resolve({
        server: {
          SERVER_VAR: 'string'
        },
        client: {}
      });

      expect(config.server.SERVER_VAR).toBe('server-value');
    });
  });

  describe('error handling', () => {
    it('provides clear error messages for validation failures', () => {
      process.env.INVALID_URL = 'not-a-url';

      expect(() => resolve({
        server: {
          INVALID_URL: 'url'
        },
        client: {}
      })).toThrow(/Environment validation failed/);
    });

    it('handles missing required variables gracefully', () => {
      expect(() => resolve({
        server: {
          MISSING_REQUIRED: 'string'
        },
        client: {}
      })).toThrow(/Missing required environment variable: MISSING_REQUIRED/);
    });

    it('provides clear error messages for invalid enum values', () => {
      process.env.INVALID_ENUM = 'invalid-value';

      // Now properly validates enums and throws errors
      expect(() => resolve({
        server: {
          INVALID_ENUM: ['valid1', 'valid2']
        },
        client: {}
      })).toThrow(/INVALID_ENUM must be one of: valid1, valid2/);
    });
  });

  describe('safeResolve() - Zod-like pattern', () => {
    it('returns success result when validation passes', () => {
      process.env.DATABASE_URL = 'postgres://localhost:5432/test';
      process.env.NEXT_PUBLIC_APP_URL = 'https://app.example.com';

      const result = safeResolve({
        server: {
          DATABASE_URL: 'url',
          PORT: 3000
        },
        client: {
          NEXT_PUBLIC_APP_URL: 'url'
        }
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.server.DATABASE_URL).toBe('postgres://localhost:5432/test');
        expect(result.data.server.PORT).toBe(3000);
        expect(result.data.client.NEXT_PUBLIC_APP_URL).toBe('https://app.example.com');
      }
    });

    it('returns error result when validation fails', () => {
      const result = safeResolve({
        server: {
          REQUIRED_VAR: 'string'
        },
        client: {}
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('Missing required environment variable: REQUIRED_VAR');
      }
    });

    it('returns error result for invalid client prefix', () => {
      process.env.INVALID_CLIENT_VAR = 'value';

      const result = safeResolve({
        server: {},
        client: {
          INVALID_CLIENT_VAR: 'string'
        }
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("Client environment variables must be prefixed with 'NEXT_PUBLIC_'");
      }
    });

    it('returns error result for server vars with client prefix', () => {
      process.env.NEXT_PUBLIC_DATABASE_URL = 'postgres://localhost:5432/test';

      const result = safeResolve({
        server: {
          NEXT_PUBLIC_DATABASE_URL: 'url'
        },
        client: {}
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("Server environment variables should not be prefixed with 'NEXT_PUBLIC_'");
      }
    });

    it('returns error result for invalid URL', () => {
      process.env.DATABASE_URL = 'not-a-url';

      const result = safeResolve({
        server: {
          DATABASE_URL: 'url'
        },
        client: {}
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('Environment validation failed');
      }
    });

    it('handles runtime protection in success result', () => {
      // Mock browser environment
      (globalThis as { window?: Window }).window = {};

      process.env.SECRET_VAR = 'secret-value';
      process.env.NEXT_PUBLIC_PUBLIC_VAR = 'public-value';

      const result = safeResolve({
        server: {
          SECRET_VAR: 'string'
        },
        client: {
          NEXT_PUBLIC_PUBLIC_VAR: 'string'
        }
      }, {
        runtimeProtection: true
      });

      expect(result.success).toBe(true);
      if (result.success) {
        // Client vars should be accessible
        expect(result.data.client.NEXT_PUBLIC_PUBLIC_VAR).toBe('public-value');

        // Server vars should throw in browser
        expect(() => {
          const _secret = result.data.server.SECRET_VAR;
          void _secret;
        }).toThrow(/Cannot access server environment variable 'SECRET_VAR' in client-side code/);
      }
    });
  });
});
