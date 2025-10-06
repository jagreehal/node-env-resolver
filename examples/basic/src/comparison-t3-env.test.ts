/**
 * Comparison: node-env-resolver vs t3-env Tests
 * Demonstrates equivalent functionality and additional features
 */
import { describe, it, expect, vi } from 'vitest';
import { resolve, dotenv, cached, TTL, awsCache, processEnv } from 'node-env-resolver';
import type { Provider } from 'node-env-resolver';

// Mock AWS Secrets Manager for testing
const mockAwsSecretsProvider = (secrets: Record<string, string>): Provider => ({
  name: 'mock-aws-secrets',
  async load() {
    return secrets;
  },
});

describe('Comparison: node-env-resolver vs t3-env', () => {
  it('should resolve environment variables with node-env-resolver, simulating t3-env use case', async () => {
    // Mock process.env for client-side variables
    process.env.NODE_ENV = 'development';
    process.env.NEXT_PUBLIC_APP_URL = 'https://public-app.example.com';
    process.env.NEXT_PUBLIC_ANALYTICS_ID = 'UA-12345';

    const mockSecrets = {
      DATABASE_URL: 'postgres://comp-user:comp-pass@comp-host:5432/comp-db',
      DATABASE_PASSWORD: 'comp-db-password',
      API_SECRET: 'comp-api-secret',
    };

    const config = await resolve({
      DATABASE_URL: { type: 'url', secret: true, description: 'Database connection URL' },
      DATABASE_PASSWORD: { type: 'string', secret: true, description: 'Database password' },
      API_SECRET: { type: 'string', secret: true, description: 'API secret key' },
      NODE_ENV: { type: 'string', enum: ['development', 'production', 'test'] as const, default: 'development', description: 'Application environment' },
      PORT: { type: 'port', default: 3000, description: 'Server port (1-65535)' },
      DEBUG: { type: 'boolean', default: false, description: 'Enable debug mode' },
      NEXT_PUBLIC_APP_URL: { type: 'url', description: 'Public app URL' },
      NEXT_PUBLIC_ANALYTICS_ID: { type: 'string', optional: true, description: 'Analytics tracking ID' }
    }, {
      resolvers: [
        processEnv(),
        cached(
          mockAwsSecretsProvider(mockSecrets),
          awsCache({
            ttl: TTL.minutes5,
            staleWhileRevalidate: true
          })
        ),
      ],
      interpolate: true,
      policies: {
        allowDotenvInProduction: false,
      },
    });

    expect(config.NODE_ENV).toBe('development');
    expect(config.PORT).toBe(3000);
    expect(config.DEBUG).toBe(false);
    expect(config.DATABASE_URL).toBe('postgres://comp-user:comp-pass@comp-host:5432/comp-db');
    expect(config.DATABASE_PASSWORD).toBe('comp-db-password');
    expect(config.API_SECRET).toBe('comp-api-secret');
    expect(config.NEXT_PUBLIC_APP_URL).toBe('https://public-app.example.com');
    expect(config.NEXT_PUBLIC_ANALYTICS_ID).toBe('UA-12345');

    // Clean up
    delete process.env.NEXT_PUBLIC_APP_URL;
    delete process.env.NEXT_PUBLIC_ANALYTICS_ID;
  });

  it('should demonstrate advanced features not available in t3-env', async () => {
    const mockSecrets = {
      JWT_SECRET: 'jwt-secret-123',
      ENCRYPTION_KEY: 'encryption-key-456',
    };

    // Multi-provider composition with caching
    const config = await resolve.with(
      [processEnv(), {
        NODE_ENV: ['development', 'production', 'test'] as const,
        PORT: 3000,
      }],
      [
        cached(
          mockAwsSecretsProvider(mockSecrets),
          {
            ttl: TTL.minutes5,
            staleWhileRevalidate: true,
            key: 'jwt-secrets'
          }
        ),
        {
          JWT_SECRET: 'string',
          ENCRYPTION_KEY: 'string',
        }
      ]
    );

    expect(config.NODE_ENV).toBe('development');
    expect(config.PORT).toBe(3000);
    expect(config.JWT_SECRET).toBe('jwt-secret-123');
    expect(config.ENCRYPTION_KEY).toBe('encryption-key-456');
  });

  it('should handle complex validation rules', async () => {
    const mockSecrets = {
      API_KEY: 'sk_test_fake_api_key_for_testing_only',
      EMAIL: 'admin@example.com',
      MAX_UPLOAD_SIZE: '50000000',
    };

    const config = await resolve({
      API_KEY: { 
        type: 'string', 
        secret: true, 
        pattern: '^sk_(live|test)_[a-zA-Z0-9]{32,}$',
        description: 'Stripe API key'
      },
      EMAIL: { 
        type: 'email', 
        description: 'Admin email address' 
      },
      MAX_UPLOAD_SIZE: { 
        type: 'number', 
        min: 1, 
        max: 1000000000, 
        default: 10485760,
        description: 'Max file upload size in bytes' 
      },
    }, {
      resolvers: [mockAwsSecretsProvider(mockSecrets)],
      strict: true,
    });

    expect(config.API_KEY).toBe('sk_test_fake_api_key_for_testing_only');
    expect(config.EMAIL).toBe('admin@example.com');
    expect(config.MAX_UPLOAD_SIZE).toBe(50000000);
  });
});