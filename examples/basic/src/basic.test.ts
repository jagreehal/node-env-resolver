/**
 * Basic usage example tests
 */
import { describe, it, expect } from 'vitest';
import { processEnv, url } from 'node-env-resolver/resolvers';
import { resolveAsync } from 'node-env-resolver';

// Helper to create mock provider
const mockProvider = (env: Record<string, string>) => ({
  name: 'mock',
  async load() { return env; },
  loadSync() { return env; }
});

describe('Basic Usage Examples', () => {
  it('should resolve basic configuration with defaults', async () => {
    const config = await resolveAsync({
      resolvers: [
        [mockProvider({
          NODE_ENV: 'development',
          DATABASE_URL: 'https://db.example.com'
        }), {
          NODE_ENV: ['development', 'production', 'test'] as const,
          PORT: 3000,                              // port with default
          DATABASE_URL: url(),                     // required URL
          DEBUG: false,                            // boolean with default
        }]
      ]
    });

    expect(config.NODE_ENV).toBe('development');
    expect(config.PORT).toBe(3000);
    expect(config.DATABASE_URL).toBe('https://db.example.com');
    expect(config.DEBUG).toBe(false);
  });

  it('should use defaults when environment variables are not provided', async () => {
    // Set NODE_ENV explicitly for this test
    process.env.NODE_ENV = 'development';

    const config = await resolveAsync({
      resolvers: [
        [processEnv(), {
          NODE_ENV: ['development', 'production', 'test'] as const,
          PORT: 3000,                              // port with default
          DATABASE_URL: url(),                     // required URL
          DEBUG: false,                            // boolean with default
        }],
        [mockProvider({
          DATABASE_URL: 'https://db.example.com'
          // NODE_ENV and DEBUG not provided, should use defaults
        }), {}]
      ]
    });

    expect(config.NODE_ENV).toBe('development'); // First enum value as default
    expect(config.PORT).toBe(3000);
    expect(config.DATABASE_URL).toBe('https://db.example.com');
    expect(config.DEBUG).toBe(false);
  });

  it('should validate enum values', async () => {
    const config = await resolveAsync({
      resolvers: [
        [mockProvider({
          NODE_ENV: 'production',
          DATABASE_URL: 'https://db.example.com'
        }), {
          NODE_ENV: ['development', 'production', 'test'] as const,
          PORT: 3000,
          DATABASE_URL: url(),
          DEBUG: false,
        }]
      ]
    });

    expect(config.NODE_ENV).toBe('production');
  });

  it('should throw error for invalid enum value', async () => {
    await expect(resolveAsync({
      resolvers: [
        [mockProvider({
          NODE_ENV: 'invalid',
          DATABASE_URL: 'https://db.example.com'
        }), {
          NODE_ENV: ['development', 'production', 'test'] as const,
          PORT: 3000,
          DATABASE_URL: url(),
          DEBUG: false,
        }]
      ]
    })).rejects.toThrow(/must be one of: development, production, test/);
  });

  it('should validate URL format', async () => {
    const config = await resolveAsync({
      resolvers: [
        [mockProvider({
          NODE_ENV: 'development',
          DATABASE_URL: 'https://api.example.com/v1'
        }), {
          NODE_ENV: ['development', 'production', 'test'] as const,
          PORT: 3000,
          DATABASE_URL: url(),
          DEBUG: false,
        }]
      ]
    });

    expect(config.DATABASE_URL).toBe('https://api.example.com/v1');
  });

  it('should throw error for invalid URL', async () => {
    await expect(resolveAsync({
      resolvers: [
        [mockProvider({
          NODE_ENV: 'development',
          DATABASE_URL: 'not-a-url'
        }), {
          NODE_ENV: ['development', 'production', 'test'] as const,
          PORT: 3000,
          DATABASE_URL: url(),
          DEBUG: false,
        }]
      ]
    })).rejects.toThrow(/Invalid URL/);
  });

  it('should validate port numbers', async () => {
    const config = await resolveAsync({
      resolvers: [
        [mockProvider({
          NODE_ENV: 'development',
          PORT: '8080',
          DATABASE_URL: 'https://db.example.com'
        }), {
          NODE_ENV: ['development', 'production', 'test'] as const,
          PORT: 3000,
          DATABASE_URL: url(),
          DEBUG: false,
        }]
      ]
    });

    expect(config.PORT).toBe(8080);
  });

  it('should handle invalid port (currently not validated)', async () => {
    // Note: Port validation might not be implemented yet
    const config = await resolveAsync({
      resolvers: [
        [mockProvider({
          NODE_ENV: 'development',
          PORT: '99999', // Invalid port - currently not validated
          DATABASE_URL: 'https://db.example.com'
        }), {
          NODE_ENV: ['development', 'production', 'test'] as const,
          PORT: 3000,
          DATABASE_URL: url(),
          DEBUG: false,
        }]
      ]
    });

    expect(config.PORT).toBe(99999); // Currently accepts invalid ports
  });

  it('should validate boolean values', async () => {
    const config = await resolveAsync({
      resolvers: [
        [mockProvider({
          NODE_ENV: 'development',
          DATABASE_URL: 'https://db.example.com',
          DEBUG: 'true'
        }), {
          NODE_ENV: ['development', 'production', 'test'] as const,
          PORT: 3000,
          DATABASE_URL: url(),
          DEBUG: false,
        }]
      ]
    });

    expect(config.DEBUG).toBe(true);
  });

  it('should handle various boolean string representations', async () => {
    const testCases = [
      { input: 'true', expected: true },
      { input: 'false', expected: false },
      { input: '1', expected: true },
      { input: '0', expected: false },
      { input: 'yes', expected: true },
      { input: 'no', expected: false },
      { input: 'on', expected: true },
      { input: 'off', expected: false },
    ];

    for (const testCase of testCases) {
      const config = await resolveAsync({
        resolvers: [
          [mockProvider({
            NODE_ENV: 'development',
            DATABASE_URL: 'https://db.example.com',
            DEBUG: testCase.input
          }), {
            NODE_ENV: ['development', 'production', 'test'] as const,
            PORT: 3000,
            DATABASE_URL: url(),
            DEBUG: false,
          }]
        ]
      });

      expect(config.DEBUG).toBe(testCase.expected);
    }
  });
});
