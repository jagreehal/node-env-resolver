import { describe, it, expect } from 'vitest';
import { resolve, resolveAsync } from './index';
import { httpValidator, jsonValidator } from './validators';
import { string, number, boolean, postgres, port, custom, enums, stringArray, numberArray } from './resolvers';

describe('Builder Functions', () => {
  it('should handle literal default values without ambiguity', async () => {
    // Mock environment
    const mockProvider = {
      name: 'mock',
      async load() {
        return {
          // Provide required fields
          NAME: 'John',
          USERNAME: 'johndoe',
          DATABASE_URL: 'postgres://localhost/mydb',
          FORMAT: 'postgres://localhost/mydb',
          DB_TYPE: 'postgres',
          PROTOCOL: 'https://api.example.com',
          JSON_TYPE: '{"key": "value"}',
          LOG_LEVEL: 'info'
        };
      },
      loadSync() {
        return {
          NAME: 'John',
          USERNAME: 'johndoe',
          DATABASE_URL: 'postgres://localhost/mydb',
          FORMAT: 'postgres://localhost/mydb',
          DB_TYPE: 'postgres',
          PROTOCOL: 'https://api.example.com',
          JSON_TYPE: '{"key": "value"}',
          LOG_LEVEL: 'info'
        };
      }
    };

    const config = await resolveAsync([mockProvider, {
      // These use builder functions for type validation
      LOG_LEVEL: string({ default: 'info' }),
      FORMAT: postgres(),
      DB_TYPE: string(),
      PROTOCOL: httpValidator(),
      JSON_TYPE: jsonValidator(),
      NAME: string(),
      USERNAME: string({ min: 3, max: 20 }),
      DATABASE_URL: postgres(),
    }]);

    // Literal values work as defaults
    expect(config.LOG_LEVEL).toBe('info');
    expect(config.FORMAT).toBe('postgres://localhost/mydb');
    expect(config.DB_TYPE).toBe('postgres');
    expect(config.PROTOCOL).toBe('https://api.example.com');
    expect(config.JSON_TYPE).toEqual({ key: 'value' });

    // Type validated value from environment
    expect(config.NAME).toBe('John');
  });

  it('should validate string types with constraints', async () => {
    const mockProvider = {
      name: 'mock',
      async load() {
        return {
          USERNAME: 'ab',  // Too short
        };
      },
    };

    await expect(resolveAsync([mockProvider, {
      USERNAME: string({ min: 3, max: 20 }),
    }])).rejects.toThrow(/String too short/);
  });

  it('should validate number types with constraints', async () => {
    const mockProvider = {
      name: 'mock',
      async load() {
        return {
          PORT: '99999',  // Out of range
        };
      },
    };

    await expect(resolveAsync([mockProvider, {
      PORT: port(),
    }])).rejects.toThrow(/Invalid port/);
  });

  it('should handle optional fields', async () => {
    const mockProvider = {
      name: 'mock',
      async load() {
        return {
          DEBUG: 'false',
          PORT: '3000'
        };
      },
    };

    const config = await resolveAsync([mockProvider, {
      API_KEY: string({ optional: true }),
      DEBUG: boolean({ default: false }),
      PORT: number({ default: 3000 }),
    }]);

    expect(config.API_KEY).toBeUndefined();
    expect(config.DEBUG).toBe(false);
    expect(config.PORT).toBe(3000);
  });

  it('should handle custom validators', async () => {
    const mockProvider = {
      name: 'mock',
      async load() {
        return {
          CUSTOM_PORT: '8080',
          CUSTOM_EMAIL: 'admin@example.com',
        };
      },
    };

    // Define custom validators as builder functions
    const portValidator = custom((value: string): number => {
      const port = parseInt(value, 10);
      if (isNaN(port) || port < 1 || port > 65535) {
        throw new Error('Port must be between 1 and 65535');
      }
      return port;
    });

    const emailValidator = custom((value: string): string => {
      if (!value.includes('@')) {
        throw new Error('Invalid email address');
      }
      return value.toLowerCase();
    });


    const config = await resolveAsync([mockProvider, {
      CUSTOM_PORT: portValidator,
      CUSTOM_EMAIL: emailValidator,
    }]);

    expect(config.CUSTOM_PORT).toBe(8080);
    expect(config.CUSTOM_EMAIL).toBe('admin@example.com');
  });

  it('should handle enum builder', async () => {
    const mockProvider = {
      name: 'mock',
      async load() {
        return {
          NODE_ENV: 'production',
        };
      },
    };

    const config = await resolveAsync([mockProvider, {
      NODE_ENV: enums(['development', 'production', 'test'] as const),
    }]);

    expect(config.NODE_ENV).toBe('production');
  });

  it('should handle arrays still working directly', async () => {
    const mockProvider = {
      name: 'mock',
      async load() {
        return {
          NODE_ENV: 'production',
        };
      },
    };

    const config = await resolveAsync([mockProvider, {
      // Arrays still work for enums (backward compatible)
      NODE_ENV: enums(['development', 'production', 'test']),
    }]);

    expect(config.NODE_ENV).toBe('production');
  });

  it('should handle array type builders', async () => {
    const mockProvider = {
      name: 'mock',
      async load() {
        return {
          TAGS: 'frontend,backend,mobile',
          PORTS: '3000,8080,9000',
        };
      },
    };

    const config = await resolveAsync([mockProvider, {
      TAGS: stringArray(),
      PORTS: numberArray(),
    }]);

    expect(config.TAGS).toEqual(['frontend', 'backend', 'mobile']);
    expect(config.PORTS).toEqual([3000, 8080, 9000]);
  });

  it('should work with synchronous resolution', () => {
    process.env.TEST_NAME = 'Alice';
    process.env.TEST_PORT = '8080';
    process.env.TEST_DEBUG = 'true';
    process.env.LOG_LEVEL = 'warn';

    const config = resolve({
      // Type validators
      TEST_NAME: string(),
      TEST_PORT: port(),
      TEST_DEBUG: boolean(),
      LOG_LEVEL: string({ default: 'warn' }),
    });

    expect(config.LOG_LEVEL).toBe('warn');
    expect(config.TEST_NAME).toBe('Alice');
    expect(config.TEST_PORT).toBe(8080);
    expect(config.TEST_DEBUG).toBe(true);

    // Cleanup
    delete process.env.TEST_NAME;
    delete process.env.TEST_PORT;
    delete process.env.TEST_DEBUG;
  });

  it('should export validators from validators subpath', async () => {
    // Import from validators subpath should work
    const resolversModule = await import('./resolvers');
    expect(resolversModule.string).toBeDefined();
    expect(typeof resolversModule.string).toBe('function');
    expect(resolversModule.number).toBeDefined();
    expect(typeof resolversModule.number).toBe('function');
    expect(resolversModule.postgres).toBeDefined();
    expect(typeof resolversModule.postgres).toBe('function');
  });
});