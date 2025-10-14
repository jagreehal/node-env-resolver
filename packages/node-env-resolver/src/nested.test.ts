/**
 * Tests for nested delimiter functionality
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { resolve, safeResolve } from './index';

describe('Nested Delimiter', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Clear process.env
    for (const key in process.env) {
      delete process.env[key];
    }
  });

  afterEach(() => {
    // Restore original env
    process.env = { ...originalEnv };
  });

  it('should transform flat keys with delimiter into nested objects', () => {
    process.env.DATABASE__HOST = 'localhost';
    process.env.DATABASE__PORT = '5432';
    process.env.DATABASE__NAME = 'mydb';

    const config = resolve({
      DATABASE__HOST: 'string',
      DATABASE__PORT: 'port',
      DATABASE__NAME: 'string'
    }, { nestedDelimiter: '__' });

    expect(config).toHaveProperty('database');
    expect((config as Record<string, unknown>).database).toEqual({
      host: 'localhost',
      port: 5432,
      name: 'mydb'
    });
  });

  it('should handle multiple levels of nesting', () => {
    process.env.APP__DATABASE__CONFIG__HOST = 'localhost';
    process.env.APP__DATABASE__CONFIG__PORT = '5432';
    process.env.APP__API__ENDPOINT__URL = 'https://api.example.com';

    const config = resolve({
      APP__DATABASE__CONFIG__HOST: 'string',
      APP__DATABASE__CONFIG__PORT: 'port',
      APP__API__ENDPOINT__URL: 'url'
    }, { nestedDelimiter: '__' });

    const appConfig = (config as Record<string, unknown>).app as Record<string, unknown>;
    const database = appConfig.database as Record<string, unknown>;
    const dbConfig = database.config as Record<string, unknown>;
    const api = appConfig.api as Record<string, unknown>;
    const endpoint = api.endpoint as Record<string, unknown>;

    expect(dbConfig.host).toBe('localhost');
    expect(dbConfig.port).toBe(5432);
    expect(endpoint.url).toBe('https://api.example.com');
  });

  it('should keep keys without delimiter as-is', () => {
    process.env.PORT = '3000';
    process.env.DATABASE__HOST = 'localhost';
    process.env.DEBUG = 'true';

    const config = resolve({
      PORT: 'port',
      DATABASE__HOST: 'string',
      DEBUG: 'boolean'
    }, { nestedDelimiter: '__' });

    expect(config.PORT).toBe(3000);
    expect(config.DEBUG).toBe(true);
    expect((config as Record<string, unknown>).database).toEqual({
      host: 'localhost'
    });
  });

  it('should work with different delimiters', () => {
    process.env.DATABASE_HOST = 'localhost';
    process.env.DATABASE_PORT = '5432';

    const config = resolve({
      DATABASE_HOST: 'string',
      DATABASE_PORT: 'port'
    }, { nestedDelimiter: '_' });

    expect((config as Record<string, unknown>).database).toEqual({
      host: 'localhost',
      port: 5432
    });
  });

  it('should work with custom delimiter in uppercase keys', () => {
    process.env.DATABASE_DOT_HOST = 'localhost';
    process.env.DATABASE_DOT_PORT = '5432';

    const config = resolve({
      DATABASE_DOT_HOST: 'string',
      DATABASE_DOT_PORT: 'port'
    }, { nestedDelimiter: '_DOT_' });

    expect((config as Record<string, unknown>).database).toEqual({
      host: 'localhost',
      port: 5432
    });
  });

  it('should lowercase nested keys', () => {
    process.env.DATABASE__HOST = 'localhost';
    process.env.DATABASE__PORT = '5432';

    const config = resolve({
      DATABASE__HOST: 'string',
      DATABASE__PORT: 'port'
    }, { nestedDelimiter: '__' });

    const database = (config as Record<string, unknown>).database as Record<string, unknown>;
    expect(database).toHaveProperty('host'); // Lowercase
    expect(database).toHaveProperty('port'); // Lowercase
    expect(database).not.toHaveProperty('HOST'); // Not uppercase
    expect(database).not.toHaveProperty('PORT');
  });

  it('should work with async resolve.async()', async () => {
    process.env.APP__NAME = 'MyApp';
    process.env.APP__VERSION = '1.0.0';

    const config = await resolve.async(
      [
        {
          name: 'test-resolver',
          async load() {
            return {
              APP__NAME: 'MyApp',
              APP__VERSION: '1.0.0'
            };
          }
        },
        {
          APP__NAME: 'string',
          APP__VERSION: 'string'
        }
      ],
      { nestedDelimiter: '__' }
    );

    expect((config as Record<string, unknown>).app).toEqual({
      name: 'MyApp',
      version: '1.0.0'
    });
  });

  it('should work with safeResolve', () => {
    process.env.DATABASE__HOST = 'localhost';
    process.env.DATABASE__PORT = '5432';

    const result = safeResolve({
      DATABASE__HOST: 'string',
      DATABASE__PORT: 'port'
    }, { nestedDelimiter: '__' });

    expect(result.success).toBe(true);
    if (result.success) {
      expect((result.data as Record<string, unknown>).database).toEqual({
        host: 'localhost',
        port: 5432
      });
    }
  });

  it('should validate before transforming', () => {
    process.env.DATABASE__PORT = 'invalid-port';

    expect(() => {
      resolve({
        DATABASE__PORT: 'port'
      }, { nestedDelimiter: '__' });
    }).toThrow('Invalid port');
  });

  it('should work with optional fields', () => {
    process.env.DATABASE__HOST = 'localhost';

    const config = resolve({
      DATABASE__HOST: 'string',
      DATABASE__PORT: 'port?'
    }, { nestedDelimiter: '__' });

    expect((config as Record<string, unknown>).database).toEqual({
      host: 'localhost',
      port: undefined
    });
  });

  it('should work with default values', () => {
    process.env.DATABASE__HOST = 'localhost';

    const config = resolve({
      DATABASE__HOST: 'string',
      DATABASE__PORT: 5432
    }, { nestedDelimiter: '__' });

    expect((config as Record<string, unknown>).database).toEqual({
      host: 'localhost',
      port: 5432
    });
  });

  it('should not transform when delimiter is not specified', () => {
    process.env.DATABASE__HOST = 'localhost';
    process.env.DATABASE__PORT = '5432';

    const config = resolve({
      DATABASE__HOST: 'string',
      DATABASE__PORT: 'port'
    });

    expect(config.DATABASE__HOST).toBe('localhost');
    expect(config.DATABASE__PORT).toBe(5432);
    expect((config as Record<string, unknown>).database).toBeUndefined();
  });
});
