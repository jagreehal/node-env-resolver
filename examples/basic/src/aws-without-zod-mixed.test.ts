/**
 * AWS Secrets - Mixed Syntax Tests
 * Combining shorthand and full object syntax for flexibility
 */
import { describe, it, expect } from 'vitest';
import { resolve, cached, awsCache, processEnv } from 'node-env-resolver';
import type { Resolver } from 'node-env-resolver';

// Mock resolvers for testing
const mockDotenvProvider = (env: Record<string, string>): Resolver => ({
  name: 'mock-dotenv',
  async load() { return env; },
});

const mockAwsSecretsProvider = (secrets: Record<string, string>): Resolver => ({
  name: 'mock-aws-secrets',
  async load() { return secrets; },
});

describe('AWS Secrets - Mixed Syntax', () => {
  it('should resolve configuration with mixed syntax', async () => {
    const mockDotenv = {
      NODE_ENV: 'production',
      PORT: '8080',
      DEBUG: 'true',
      SESSION_TIMEOUT: '7200',
    };

    const mockSecrets = {
      DATABASE_PASSWORD: 'mixed-syntax-db-password',
      API_KEY: 'sk-live-mixed-syntax-key',
      JWT_SECRET: 'jwt-secret-mixed-syntax',
      DATABASE_URL: 'postgres://user:pass@mixed-db.example.com:5432/myapp',
      REDIS_URL: 'redis://mixed-redis.example.com:6379',
      MAX_CONNECTIONS: '200',
      LOG_LEVEL: 'warn',
    };

    const config = await resolve({
      // Shorthand syntax for simple cases
      NODE_ENV: ['development', 'production', 'test'] as const,
      PORT: 3000,
      DEBUG: false,
      DATABASE_PASSWORD: 'string',
      API_KEY: 'string?',
      JWT_SECRET: 'string',
      
      // Full object syntax for complex validation
      DATABASE_URL: { type: 'url', secret: true },
      REDIS_URL: { type: 'url', optional: true },
      MAX_CONNECTIONS: { type: 'number', default: 100, min: 1, max: 1000 },
      LOG_LEVEL: { type: 'string', enum: ['debug', 'info', 'warn', 'error'] as const, default: 'info' },
      SESSION_TIMEOUT: { type: 'number', default: 3600, min: 60, max: 86400 },
    }, {
      resolvers: [
        mockDotenvProvider(mockDotenv),
        cached(
          mockAwsSecretsProvider(mockSecrets),
          awsCache({
            ttl: 5 * 60 * 1000,
            staleWhileRevalidate: true
          })
        ),
      ],
      interpolate: true,
    });

    expect(config.NODE_ENV).toBe('production');
    expect(config.PORT).toBe(8080);
    expect(config.DEBUG).toBe(true);
    expect(config.LOG_LEVEL).toBe('warn');
    expect(config.MAX_CONNECTIONS).toBe(200);
    expect(config.SESSION_TIMEOUT).toBe(7200);
    expect(config.DATABASE_URL).toBe('postgres://user:pass@mixed-db.example.com:5432/myapp');
    expect(config.REDIS_URL).toBe('redis://mixed-redis.example.com:6379');
    expect(config.DATABASE_PASSWORD).toBe('mixed-syntax-db-password');
    expect(config.API_KEY).toBe('sk-live-mixed-syntax-key');
    expect(config.JWT_SECRET).toBe('jwt-secret-mixed-syntax');
  });

  it('should handle environment-specific configurations', async () => {
    const mockSecrets = {
      DATABASE_PASSWORD: 'env-specific-password',
      API_KEY: 'sk-abcdefghijklmnopqrstuvwxyz1234567890',
    };

    // Test development environment
    process.env.NODE_ENV = 'development';
    const devConfig = await resolve({
      NODE_ENV: ['development', 'production', 'test'] as const,
      PORT: 3000,
      DATABASE_PASSWORD: 'string',
      API_KEY: 'string?',
    }, {
      resolvers: [processEnv(), mockAwsSecretsProvider(mockSecrets)],
    });

    expect(devConfig.NODE_ENV).toBe('development');
    expect(devConfig.PORT).toBe(3000);
    expect(devConfig.DATABASE_PASSWORD).toBe('env-specific-password');
    expect(devConfig.API_KEY).toBe('sk-abcdefghijklmnopqrstuvwxyz1234567890');

    // Test production environment
    process.env.NODE_ENV = 'production';
    const prodConfig = await resolve({
      NODE_ENV: ['development', 'production', 'test'] as const,
      PORT: 8080,
      DATABASE_PASSWORD: { type: 'string', secret: true, min: 10 },
      API_KEY: { type: 'string', secret: true, pattern: '^sk-[a-zA-Z0-9]{20,}$' },
    }, {
      resolvers: [processEnv(), mockAwsSecretsProvider(mockSecrets)],
      strict: true,
    });

    expect(prodConfig.NODE_ENV).toBe('production');
    expect(prodConfig.PORT).toBe(8080);
    expect(prodConfig.DATABASE_PASSWORD).toBe('env-specific-password');
    expect(prodConfig.API_KEY).toBe('sk-abcdefghijklmnopqrstuvwxyz1234567890');
  });

  it('should demonstrate flexible validation rules', async () => {
    const mockSecrets = {
      SIMPLE_STRING: 'simple-value',
      COMPLEX_STRING: 'complex-value-with-validation',
      OPTIONAL_STRING: 'optional-value',
    };

    const config = await resolve({
      // Simple validation
      SIMPLE_STRING: 'string',
      
      // Complex validation
      COMPLEX_STRING: { 
        type: 'string', 
        min: 5, 
        max: 50, 
        pattern: '^[a-z-]+$' 
      },
      
      // Optional with default
      OPTIONAL_STRING: { 
        type: 'string', 
        optional: true, 
        default: 'default-value' 
      },
    }, {
      resolvers: [mockAwsSecretsProvider(mockSecrets)],
    });

    expect(config.SIMPLE_STRING).toBe('simple-value');
    expect(config.COMPLEX_STRING).toBe('complex-value-with-validation');
    expect(config.OPTIONAL_STRING).toBe('optional-value');
  });
});