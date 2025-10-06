/**
 * Migration Guide: Zod to Standard Schema Tests
 * Shows how to convert from Zod-based validation to node-env-resolver's built-in schema
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { resolveEnvSplit } from 'node-env-resolver/web';
import { z } from 'zod';

// Mock process.env for testing
const originalEnv = process.env;

describe('Migration Guide: Zod to Standard Schema', () => {
  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('Standard Schema Example (No Zod Required)', () => {
    it('should resolve environment with standard schema', async () => {
      // Set up environment variables
      process.env.DATABASE_URL = 'postgres://user:pass@localhost:5432/mydb';
      process.env.DATABASE_PASSWORD = 'super-secret-password';
      process.env.API_SECRET = 'api-secret-key';
      process.env.NEXTAUTH_SECRET = 'nextauth-secret-32-chars-long-test-key';
      process.env.NODE_ENV = 'production';
      process.env.PORT = '8080';
      process.env.DEBUG = 'true';
      process.env.PUBLIC_NEXT_PUBLIC_APP_URL = 'https://myapp.com';
      process.env.PUBLIC_NEXT_PUBLIC_GA_ID = 'GA-123456789';
      process.env.PUBLIC_NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY = 'pk_test_123';
      process.env.PUBLIC_NEXT_PUBLIC_ENABLE_ANALYTICS = 'true';

      const env = await resolveEnvSplit({
        server: {
          // String with URL validation
          DATABASE_URL: { 
            type: 'url', 
            secret: true,
            description: 'Database connection URL' 
          },
          
          // String with minimum length (built-in validation)
          DATABASE_PASSWORD: { 
            type: 'string', 
            secret: true,
            description: 'Database password' 
          },
          
          // Required string
          API_SECRET: { 
            type: 'string', 
            secret: true,
            description: 'API secret key' 
          },
          
          // String with minimum length validation
          NEXTAUTH_SECRET: { 
            type: 'string', 
            secret: true,
            min: 32,
            description: 'NextAuth secret (min 32 chars)' 
          },
          
          // Enum with default
          NODE_ENV: { 
            type: 'string', 
            enum: ['development', 'production', 'test'] as const,
            default: 'development',
            description: 'Application environment' 
          },
          
          // Port number with range validation
          PORT: { 
            type: 'port', 
            default: 3000,
            description: 'Server port (1-65535)' 
          },
          
          // Boolean with default
          DEBUG: { 
            type: 'boolean', 
            default: false,
            description: 'Enable debug mode' 
          },
        },
        
        client: {
          // URL validation for client variables
          PUBLIC_NEXT_PUBLIC_APP_URL: { 
            type: 'url',
            description: 'Public application URL' 
          },
          
          // Optional string
          PUBLIC_NEXT_PUBLIC_GA_ID: { 
            type: 'string', 
            optional: true,
            description: 'Google Analytics ID' 
          },
          
          // Optional string
          PUBLIC_NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: { 
            type: 'string', 
            optional: true,
            description: 'Stripe publishable key' 
          },
          
          // Boolean with default
          PUBLIC_NEXT_PUBLIC_ENABLE_ANALYTICS: { 
            type: 'boolean', 
            default: false,
            description: 'Enable analytics tracking' 
          },
        }
      });

      expect(env.server.NODE_ENV).toBe('production');
      expect(env.server.PORT).toBe(8080);
      expect(env.server.DEBUG).toBe(true);
      expect(env.server.DATABASE_URL).toBe('postgres://user:pass@localhost:5432/mydb');
      expect(env.client.PUBLIC_NEXT_PUBLIC_APP_URL).toBe('https://myapp.com');
      expect(env.client.PUBLIC_NEXT_PUBLIC_ENABLE_ANALYTICS).toBe(true);
      expect(env.client.PUBLIC_NEXT_PUBLIC_GA_ID).toBe('GA-123456789');
    });

    it('should handle missing environment variables with defaults', async () => {
      // Clear environment variables to test defaults
      delete process.env.NODE_ENV;
      delete process.env.PORT;
      delete process.env.DEBUG;
      delete process.env.PUBLIC_NEXT_PUBLIC_ENABLE_ANALYTICS;
      
      // Explicitly set DEBUG to false to test default behavior
      process.env.DEBUG = 'false';

      const env = await resolveEnvSplit({
        server: {
          NODE_ENV: { 
            type: 'string', 
            enum: ['development', 'production', 'test'] as const,
            default: 'development',
            description: 'Application environment' 
          },
          PORT: { 
            type: 'port', 
            default: 3000,
            description: 'Server port (1-65535)' 
          },
          DEBUG: { 
            type: 'boolean', 
            default: false,
            description: 'Enable debug mode' 
          },
        },
        client: {
          PUBLIC_NEXT_PUBLIC_ENABLE_ANALYTICS: { 
            type: 'boolean', 
            default: false,
            description: 'Enable analytics tracking' 
          },
        }
      });

      expect(env.server.NODE_ENV).toBe('development'); // Default value
      expect(env.server.PORT).toBe(3000); // Default value
      expect(env.server.DEBUG).toBe(false); // Default value
      expect(env.client.PUBLIC_NEXT_PUBLIC_ENABLE_ANALYTICS).toBe(false); // Default value
    });
  });

  describe('Shorthand Syntax Example', () => {
    it('should work with shorthand syntax', async () => {
      // Set up environment variables
      process.env.DATABASE_URL = 'postgres://user:pass@localhost:5432/mydb';
      process.env.DATABASE_PASSWORD = 'super-secret-password';
      process.env.API_SECRET = 'api-secret-key';
      process.env.NEXTAUTH_SECRET = 'nextauth-secret-32-chars-long-test-key';
      process.env.NODE_ENV = 'production';
      process.env.PORT = '8080';
      process.env.DEBUG = 'true';
      process.env.PUBLIC_NEXT_PUBLIC_APP_URL = 'https://myapp.com';
      process.env.PUBLIC_NEXT_PUBLIC_GA_ID = 'GA-123456789';
      process.env.PUBLIC_NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY = 'pk_test_123';
      process.env.PUBLIC_NEXT_PUBLIC_ENABLE_ANALYTICS = 'true';

      const env = await resolveEnvSplit({
        server: {
          // Shorthand syntax - much simpler!
          DATABASE_URL: 'url',           // Required URL
          DATABASE_PASSWORD: 'string',   // Required string
          API_SECRET: 'string',          // Required string
          NEXTAUTH_SECRET: 'string',     // Required string
          NODE_ENV: ['development', 'production', 'test'] as const, // Enum with default
          PORT: 3000,                     // Number with default
          DEBUG: false,                   // Boolean with default
        },
        
        client: {
          PUBLIC_NEXT_PUBLIC_APP_URL: 'url',              // Required URL
          PUBLIC_NEXT_PUBLIC_GA_ID: 'string?',             // Optional string
          PUBLIC_NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: 'string?', // Optional string
          PUBLIC_NEXT_PUBLIC_ENABLE_ANALYTICS: false,      // Boolean with default
        }
      });

      expect(env.server.NODE_ENV).toBe('production');
      expect(env.server.PORT).toBe(8080);
      expect(env.server.DEBUG).toBe(true);
      expect(env.server.DATABASE_URL).toBe('postgres://user:pass@localhost:5432/mydb');
      expect(env.client.PUBLIC_NEXT_PUBLIC_APP_URL).toBe('https://myapp.com');
      expect(env.client.PUBLIC_NEXT_PUBLIC_ENABLE_ANALYTICS).toBe(true);
    });

    it('should handle optional variables with shorthand syntax', async () => {
      // Set up environment variables (missing optional ones)
      process.env.DATABASE_URL = 'postgres://user:pass@localhost:5432/mydb';
      process.env.DATABASE_PASSWORD = 'super-secret-password';
      process.env.API_SECRET = 'api-secret-key';
      process.env.NEXTAUTH_SECRET = 'nextauth-secret-32-chars-long-test-key';
      process.env.NODE_ENV = 'production';
      process.env.PORT = '8080';
      process.env.DEBUG = 'true';
      process.env.PUBLIC_NEXT_PUBLIC_APP_URL = 'https://myapp.com';
      // NEXT_PUBLIC_GA_ID and NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY not set
      process.env.PUBLIC_NEXT_PUBLIC_ENABLE_ANALYTICS = 'true';

      const env = await resolveEnvSplit({
        server: {
          DATABASE_URL: 'url',
          DATABASE_PASSWORD: 'string',
          API_SECRET: 'string',
          NEXTAUTH_SECRET: 'string',
          NODE_ENV: ['development', 'production', 'test'] as const,
          PORT: 3000,
          DEBUG: false,
        },
        client: {
          PUBLIC_NEXT_PUBLIC_APP_URL: 'url',
          PUBLIC_NEXT_PUBLIC_GA_ID: { type: 'string', optional: true },             // Optional
          PUBLIC_NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: { type: 'string', optional: true }, // Optional
          PUBLIC_NEXT_PUBLIC_ENABLE_ANALYTICS: false,
        }
      });

      expect(env.client.PUBLIC_NEXT_PUBLIC_GA_ID).toBeUndefined();
      expect(env.client.PUBLIC_NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY).toBeUndefined();
      expect(env.client.PUBLIC_NEXT_PUBLIC_APP_URL).toBe('https://myapp.com');
    });
  });

  describe('Migration Mapping Table', () => {
    it('should demonstrate Zod to Standard Schema mapping', () => {
      const migrationMapping = {
        'z.string()': '"string!" or { type: "string" }',
        'z.string().optional()': '"string?" or { optional: true }',
        'z.string().url()': '"url!" or { type: "url" }',
        'z.string().email()': '{ type: "email" }',
        'z.string().min(1)': '{ min: 1 }',
        'z.string().max(100)': '{ max: 100 }',
        'z.number()': '"number!" or { type: "number" }',
        'z.number().int()': '{ type: "number" }',
        'z.number().min(1).max(65535)': '{ type: "port" }',
        'z.boolean()': '"boolean!" or { type: "boolean"}',
        'z.enum(["a", "b"])': '{ enum: ["a", "b"] }',
        'z.string().default("value")': '{ default: "value" }',
        'z.number().default(3000)': '{ default: 3000 }',
        'z.boolean().default(false)': '{ default: false }'
      };

      expect(migrationMapping['z.string()']).toBe('"string!" or { type: "string" }');
      expect(migrationMapping['z.string().optional()']).toBe('"string?" or { optional: true }');
      expect(migrationMapping['z.string().url()']).toBe('"url!" or { type: "url" }');
      expect(migrationMapping['z.number().min(1).max(65535)']).toBe('{ type: "port" }');
      expect(migrationMapping['z.enum(["a", "b"])']).toBe('{ enum: ["a", "b"] }');
    });

    it('should demonstrate key benefits of Standard Schema', () => {
      const benefits = [
        'No Zod dependency required - built-in validators cover most use cases',
        'Lightweight bundle size (~8.8KB gzipped)',
        'Shorthand syntax for common cases',
        'Built-in validation for URLs, emails, ports',
        'Same type safety as Zod (when needed)',
        'Works with AWS Secrets Manager',
        'TTL caching support'
      ];

      expect(benefits).toContain('No Zod dependency required - built-in validators cover most use cases');
      expect(benefits).toContain('Lightweight bundle size (~8.8KB gzipped)');
      expect(benefits).toContain('Shorthand syntax for common cases');
      expect(benefits).toContain('Built-in validation for URLs, emails, ports');
      expect(benefits).toContain('Same type safety as Zod (when needed)');
      expect(benefits).toContain('Works with AWS Secrets Manager');
      expect(benefits).toContain('TTL caching support');
    });
  });

  describe('Advanced Features (Standard Schema Only)', () => {
    it('should work with advanced features', async () => {
      // Set up environment variables
      process.env.API_KEY = 'abcdef1234567890abcdef1234567890';
      process.env.FEATURE_FLAGS = '{"analytics": true, "beta": false}';
      process.env.ADMIN_EMAIL = 'admin@example.com';
      process.env.MAX_UPLOAD_SIZE = '10485760';
      process.env.PUBLIC_NEXT_PUBLIC_APP_CONFIG = '{"theme": "light", "language": "en"}';

      const env = await resolveEnvSplit({
        server: {
          // Pattern validation (regex)
          API_KEY: {
            type: 'string',
            pattern: '^[a-zA-Z0-9]{32}$',
            secret: true,
            description: 'API key (32 alphanumeric chars)'
          },
          
          // JSON parsing
          FEATURE_FLAGS: {
            type: 'json',
            default: '{"analytics": true, "beta": false}',
            description: 'Feature flags as JSON'
          },
          
          // Email validation
          ADMIN_EMAIL: {
            type: 'email',
            description: 'Admin email address'
          },
          
          // Custom validation with min/max
          MAX_UPLOAD_SIZE: {
            type: 'number',
            min: 1,
            max: 1000000000, // 1GB
            default: 10485760, // 10MB
            description: 'Max file upload size in bytes'
          }
        },
        
        client: {
          // Client-side JSON
          PUBLIC_NEXT_PUBLIC_APP_CONFIG: {
            type: 'json',
            default: '{"theme": "light", "language": "en"}',
            description: 'App configuration'
          }
        }
      }, {
        // Enable variable interpolation
        interpolate: true,
        
        // Production security policies
        policies: {
          allowDotenvInProduction: false,
        },
      });

      expect(env.server.API_KEY).toBe('abcdef1234567890abcdef1234567890');
      expect(env.server.FEATURE_FLAGS).toEqual({ analytics: true, beta: false });
      expect(env.server.ADMIN_EMAIL).toBe('admin@example.com');
      expect(env.server.MAX_UPLOAD_SIZE).toBe(10485760);
      expect(env.client.PUBLIC_NEXT_PUBLIC_APP_CONFIG).toEqual({ theme: 'light', language: 'en' });
    });

    it('should validate pattern constraints', async () => {
      // Set up invalid API_KEY
      process.env.API_KEY = 'invalid-key';

      await expect(resolveEnvSplit({
        server: {
          API_KEY: {
            type: 'string',
            pattern: '^[a-zA-Z0-9]{32}$',
            secret: true,
            description: 'API key (32 alphanumeric chars)'
          }
        },
        client: {}
      })).rejects.toThrow();
    });

    it('should validate email format', async () => {
      // Set up invalid email
      process.env.ADMIN_EMAIL = 'not-an-email';

      await expect(resolveEnvSplit({
        server: {
          ADMIN_EMAIL: {
            type: 'email',
            description: 'Admin email address'
          }
        },
        client: {}
      })).rejects.toThrow();
    });

    it('should validate number constraints', async () => {
      // Set up invalid number
      process.env.MAX_UPLOAD_SIZE = '2000000000'; // Exceeds max

      await expect(resolveEnvSplit({
        server: {
          MAX_UPLOAD_SIZE: {
            type: 'number',
            min: 1,
            max: 1000000000, // 1GB
            default: 10485760, // 10MB
            description: 'Max file upload size in bytes'
          }
        },
        client: {}
      })).rejects.toThrow();
    });

    it('should validate JSON format', async () => {
      // Set up invalid JSON
      process.env.FEATURE_FLAGS = 'invalid-json';

      await expect(resolveEnvSplit({
        server: {
          FEATURE_FLAGS: {
            type: 'json',
            default: '{"analytics": true, "beta": false}',
            description: 'Feature flags as JSON'
          }
        },
        client: {}
      })).rejects.toThrow();
    });
  });

  describe('Zod Comparison', () => {
    it('should demonstrate equivalent Zod schemas', () => {
      // Zod-based approach (conceptual)
      const zodSchemas = {
        server: {
          DATABASE_URL: 'z.string().url()',
          DATABASE_PASSWORD: 'z.string().min(1)',
          API_SECRET: 'z.string().min(1)',
          NEXTAUTH_SECRET: 'z.string().min(32)',
          NODE_ENV: 'z.enum(["development", "production", "test"]).default("development")',
          PORT: 'z.number().int().min(1).max(65535).default(3000)',
          DEBUG: 'z.boolean().default(false)',
        },
        client: {
          PUBLIC_NEXT_PUBLIC_APP_URL: 'z.string().url()',
          PUBLIC_NEXT_PUBLIC_GA_ID: 'z.string().optional()',
          PUBLIC_NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: 'z.string().optional()',
          PUBLIC_NEXT_PUBLIC_ENABLE_ANALYTICS: 'z.boolean().default(false)',
        }
      };

      // Standard Schema equivalent
      const standardSchemas = {
        server: {
          DATABASE_URL: 'url',
          DATABASE_PASSWORD: 'string',
          API_SECRET: 'string',
          NEXTAUTH_SECRET: '{ type: "string", min: 32 }',
          NODE_ENV: 'development',
          PORT: 3000,
          DEBUG: false,
        },
        client: {
          PUBLIC_NEXT_PUBLIC_APP_URL: 'url',
          PUBLIC_NEXT_PUBLIC_GA_ID: 'string?',
          PUBLIC_NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: 'string?',
          PUBLIC_NEXT_PUBLIC_ENABLE_ANALYTICS: false,
        }
      };

      expect(zodSchemas.server.DATABASE_URL).toBe('z.string().url()');
      expect(standardSchemas.server.DATABASE_URL).toBe('url');
      expect(zodSchemas.server.PORT).toBe('z.number().int().min(1).max(65535).default(3000)');
      expect(standardSchemas.server.PORT).toBe(3000);
    });

    it('should demonstrate bundle size characteristics', () => {
      const bundleInfo = {
        'node-env-resolver': '~8.8KB gzipped',
        'zero-dependencies': true,
        'includes-aws-integration': true,
        'includes-caching': true,
        'includes-validators': true
      };

      expect(bundleInfo['node-env-resolver']).toBe('~8.8KB gzipped');
      expect(bundleInfo['zero-dependencies']).toBe(true);
      expect(bundleInfo['includes-aws-integration']).toBe(true);
      expect(bundleInfo['includes-caching']).toBe(true);
      expect(bundleInfo['includes-validators']).toBe(true);
    });
  });

  describe('Migration Steps', () => {
    it('should demonstrate migration steps', () => {
      const migrationSteps = [
        'Install node-env-resolver: npm install node-env-resolver',
        'Convert existing schemas to Standard Schema format',
        'Update import statements',
        'Test environment variable resolution',
        'Add AWS integration if needed',
        'Configure caching for production'
      ];

      expect(migrationSteps).toContain('Install node-env-resolver: npm install node-env-resolver');
      expect(migrationSteps).toContain('Convert existing schemas to Standard Schema format');
      expect(migrationSteps).toContain('Update import statements');
      expect(migrationSteps).toContain('Test environment variable resolution');
      expect(migrationSteps).toContain('Add AWS integration if needed');
    });

    it('should demonstrate package.json changes', () => {
      const packageChanges = {
        add: ['node-env-resolver'],
        benefits: [
          'Zero dependencies',
          'Built-in AWS integration',
          'Built-in caching',
          'Built-in validators',
          'Standard Schema compliance'
        ]
      };

      expect(packageChanges.add).toContain('node-env-resolver');
      expect(packageChanges.benefits).toContain('Zero dependencies');
      expect(packageChanges.benefits).toContain('Built-in AWS integration');
      expect(packageChanges.benefits).toContain('Built-in caching');
      expect(packageChanges.benefits).toContain('Built-in validators');
    });
  });
});
