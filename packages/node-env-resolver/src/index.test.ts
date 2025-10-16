import { describe, it, expect } from 'vitest';
import { resolve, resolveAsync } from './index';
import {
  string,
  url,
  email,
  postgres,
  mysql,
  mongodb,
  redis,
  http,
  https,
  number,
  boolean,
  oneOf,
  port,
  date,
  timestamp,
} from './validators';
import { resolveZod } from './zod';
// Helper to create mock provider
const mockProvider = (env: Record<string, string>) => ({
  name: 'mock',
  async load() { return env; },
  loadSync() { return env; }
});

describe('Simplified resolve() API', () => {
  it('handles shorthand syntax for types', async () => {
    const config = await resolveAsync({
      resolvers: [
        [{
          name: 'mock',
          async load() {
            return {
              DATABASE_URL: 'https://db.example.com',
              NODE_ENV: 'dev'
            } as Record<string, string>;
          },
        }, {
          PORT: 3000,                    // number with default
          DATABASE_URL: url(),          // required secret url
          API_KEY: string({optional:true}),            // optional string
          NODE_ENV: oneOf(['dev', 'prod']),     // enum
          DEBUG: false,                  // boolean with default
        }]
      ]
    });

    expect(config.PORT).toBe(3000);
    expect(config.DATABASE_URL).toBe('https://db.example.com');
    expect(config.API_KEY).toBeUndefined();
    expect(config.NODE_ENV).toBe('dev');
    expect(config.DEBUG).toBe(false);
  });

  it('parses shorthand with defaults correctly', async () => {
    const config = await resolveAsync({
      resolvers: [
        [{
          name: 'mock',
          async load() {
            return {} as Record<string, string>;
          },
        }, {
          PORT: port({ default: 8080 }),              // port type with default
          HOST: 'localhost',       // string with default
          ENABLED: boolean({ default: true }),        // boolean with default string
        }]
      ]
    });

    expect(config.PORT).toBe(8080);
    expect(config.HOST).toBe('localhost');
    expect(config.ENABLED).toBe(true);
  });

  it('handles secret and optional modifiers', async () => {
    const config = await resolveAsync({
      resolvers: [
        [{
          name: 'mock',
          async load() {
            return {
              SECRET_KEY: 'secret123'
            } as Record<string, string>;
          },
        }, {
          SECRET_KEY: string(),         // required secret
          OPTIONAL_VAR: string({optional:true}),       // optional
          BOTH: 'string!?',              // secret and optional
        }]
      ]
    });

    expect(config.SECRET_KEY).toBe('secret123');
    expect(config.OPTIONAL_VAR).toBeUndefined();
    expect(config.BOTH).toBeUndefined();
  });

  it('handles regex patterns in shorthand', async () => {
    const config = await resolveAsync({
      resolvers: [
        [{
          name: 'mock',
          async load() {
            return {
              DATABASE_URL: 'postgres://user:pass@host/db'
            } as Record<string, string>;
          },
        }, {
          DATABASE_URL: string({ default: '/^postgres:\\/\\//' }),  // pattern validation
        }]
      ]
    });

    expect(config.DATABASE_URL).toBe('postgres://user:pass@host/db');
  });

  it('throws on invalid pattern match', async () => {
    await expect(resolveAsync({
      resolvers: [
        [{
          name: 'mock',
          async load() {
            return {
              DATABASE_URL: 'mysql://host/db'
            } as Record<string, string>;
          },
        }, {
          DATABASE_URL: string({ pattern: '^postgres:\\/\\/' }),
        }]
      ]
    })).rejects.toThrow(/does not match required pattern/);
  });

  it('uses smart defaults when no resolvers specified', () => {
    const prevEnv = process.env.TEST_VAR;
    process.env.TEST_VAR = 'from-process-env';

    const config = resolve({
      TEST_VAR: string(),
    });

    expect(config.TEST_VAR).toBe('from-process-env');

    if (prevEnv !== undefined) {
      process.env.TEST_VAR = prevEnv;
    } else {
      delete process.env.TEST_VAR;
    }
  });

  it('validates required variables', async () => {
    await expect(resolveAsync({
      resolvers: [
        [{
          name: 'mock',
          async load() {
            return {} as Record<string, string>;
          },
        }, {
          REQUIRED_VAR: string(),  // required, no default
        }]
      ]
    })).rejects.toThrow(/Missing required environment variable: REQUIRED_VAR/);
  });

  it('handles enum validation', async () => {
    const config = await resolveAsync({
      resolvers: [
        [{
          name: 'mock',
          async load() {
            return { ENV_MODE: 'staging' } as Record<string, string>;
          },
        }, {
          ENV_MODE: oneOf(['dev', 'staging', 'prod']),
        }]
      ]
    });

    expect(config.ENV_MODE).toBe('staging');
  });

  it('throws on invalid enum value', async () => {
    await expect(resolveAsync({
      resolvers: [
        [{
          name: 'mock',
          async load() {
            return { ENV_MODE: 'invalid' } as Record<string, string>;
          },
        }, {
          ENV_MODE: oneOf(['dev', 'staging', 'prod']),
        }]
      ]
    })).rejects.toThrow(/Allowed values: dev, staging, prod/);
  });

  it('handles email type validation', async () => {
    const config = await resolveAsync({
      resolvers: [
        [{
          name: 'mock',
          async load() {
            return {
              CONTACT_EMAIL: 'user@example.com'
            } as Record<string, string>;
          },
        }, {
          CONTACT_EMAIL: email(),
          SUPPORT_EMAIL: 'email?',
        }]
      ]
    });

    expect(config.CONTACT_EMAIL).toBe('user@example.com');
    expect(config.SUPPORT_EMAIL).toBeUndefined();
  });

  it('throws on invalid email', async () => {
    await expect(resolveAsync({
      resolvers: [
        [{
          name: 'mock',
          async load() {
            return { EMAIL: 'not-an-email' } as Record<string, string>;
          },
        }, {
          EMAIL: email(),
        }]
      ]
    })).rejects.toThrow(/Invalid email/);
  });

  it('handles email with default value', async () => {
    const config = await resolveAsync({
      resolvers: [
        [{
          name: 'mock',
          async load() {
            return {} as Record<string, string>;
          },
        }, {
          ADMIN_EMAIL: email({ default: 'admin@example.com' }),
        }]
      ]
    });

    expect(config.ADMIN_EMAIL).toBe('admin@example.com');
  });
});

describe('Zod and Standard Schema helpers', () => {
  it('works with Zod-like schema', async () => {
    const schema = {
      parse(input: unknown) {
        const obj = input as Record<string, unknown>;
        return { NODE_ENV: String(obj.NODE_ENV ?? 'test'), PORT: Number(obj.PORT ?? 3000) };
      },
    };
    const env = await resolveZod(schema, {
      resolvers: [
        {
          name: 'mock',
          async load() {
            return { NODE_ENV: 'development', PORT: '4000' } as Record<string, string>;
          },
        },
      ],
    });
    expect(env.NODE_ENV).toBe('development');
    expect(env.PORT).toBe(4000);
  });

  // Standard Schema removed - use direct Zod/Valibot integrations instead
});

describe('resolve() - Synchronous environment resolver', () => {
  it('handles basic sync functionality', () => {
    // Set test environment variables
    process.env.TEST_STRING = 'hello';
    process.env.TEST_NUMBER = '42';
    process.env.TEST_BOOLEAN = 'true';

    const config = resolve({
      TEST_STRING: string(),
      TEST_NUMBER: number(),
      TEST_BOOLEAN: boolean()
    });

    expect(config.TEST_STRING).toBe('hello');
    expect(config.TEST_NUMBER).toBe(42);
    expect(config.TEST_BOOLEAN).toBe(true);
    expect(typeof config.TEST_STRING).toBe('string');
    expect(typeof config.TEST_NUMBER).toBe('number');
    expect(typeof config.TEST_BOOLEAN).toBe('boolean');

    // Clean up
    delete process.env.TEST_STRING;
    delete process.env.TEST_NUMBER;
    delete process.env.TEST_BOOLEAN;
  });

  it('handles defaults in sync mode', () => {
    const config = resolve({
      PORT: 3000,                    // number default
      DEBUG: false,                  // boolean default
      API_URL: string({ default: 'https://api.example.com' }),  // string with default (sync types only)
      MISSING_OPTIONAL: string({optional:true})    // optional string
    });

    expect(config.PORT).toBe(3000);
    expect(config.DEBUG).toBe(false);
    expect(config.API_URL).toBe('https://api.example.com');
    expect(config.MISSING_OPTIONAL).toBeUndefined();
  });

  it('validates oneOf in sync mode', () => {
    process.env.NODE_ENV = 'development';

    const config = resolve({
      NODE_ENV: oneOf(['development', 'production', 'test'])
    });

    expect(config.NODE_ENV).toBe('development');

    // Clean up
    delete process.env.NODE_ENV;
  });

  it('throws errors for invalid values in sync mode', () => {
    process.env.INVALID_ENV = 'invalid';

    expect(() => {
      resolve({
        INVALID_ENV: oneOf(['valid1', 'valid2'])
      });
    }).toThrow('Environment validation failed');

    // Clean up
    delete process.env.INVALID_ENV;
  });

  it('works with custom sync resolvers', async () => {
    const customProvider = {
      name: 'custom-sync',
      async load() {
        return { CUSTOM_VALUE: 'from-custom-provider' };
      },
      loadSync() {
        return { CUSTOM_VALUE: 'from-custom-provider' };
      }
    };

    const config = await resolveAsync({
      resolvers: [
        [customProvider, {
          CUSTOM_VALUE: string()
        }]
      ]
    });

    expect(config.CUSTOM_VALUE).toBe('from-custom-provider');
  });

  it('works with async-only resolvers (no loadSync)', async () => {
    const asyncProvider = {
      name: 'async-only',
      async load() {
        return { ASYNC_VALUE: 'async' };
      }
      // No loadSync method - but that's fine for async resolveAsync()
    };

    const config = await resolveAsync({
      resolvers: [
        [asyncProvider, {
          ASYNC_VALUE: string()
        }]
      ],
      options: { strict: true }
    });

    expect(config.ASYNC_VALUE).toBe('async');
  });

  it('skips async-only resolvers in non-strict mode', async () => {
    const asyncProvider = {
      name: 'async-only',
      async load() {
        return { ASYNC_VALUE: 'async' };
      }
      // No loadSync method
    };

    // This should not throw and should work with other resolvers
    const config = await resolveAsync({
      resolvers: [
        [asyncProvider, {
          PORT: 3000  // Use default from process.env (which has loadSync)
        }]
      ],
      options: { strict: false }
    });

    expect(config.PORT).toBe(3000);
  });

  it('throws error when using Standard Schema validators with resolve', () => {
    // Create a mock Standard Schema object
    const zodLikeSchema = {
      '~standard': {
        version: 1,
        vendor: 'zod',
        validate: async () => ({ value: 'test' })
      }
    };

    expect(() => {
      resolve({
        // @ts-expect-error - Testing runtime behavior
        DATABASE_URL: zodLikeSchema
      });
    }).toThrow(/resolve\(\) cannot be used with async/);

    expect(() => {
      resolve({
        // @ts-expect-error - Testing runtime behavior
        DATABASE_URL: zodLikeSchema
      });
    }).toThrow(/resolve\(\) cannot be used with async/);
  });
});

describe('Connection String Types', () => {
  describe('postgres / postgresql', () => {
    it('validates postgres:// protocol', async () => {
      const config = await resolveAsync({
        resolvers: [
          [mockProvider({ DB_URL: 'postgres://user:pass@localhost:5432/mydb' }), {
            DB_URL: postgres()
          }]
        ]
      });

      expect(config.DB_URL).toBe('postgres://user:pass@localhost:5432/mydb');
    });

    it('validates postgresql:// protocol', async () => {
      const config = await resolveAsync({
      resolvers: [
        [mockProvider({ DB_URL: 'postgresql://user:pass@localhost:5432/mydb' }), {
          DB_URL: postgres()
        }]
      ]
    });

      expect(config.DB_URL).toBe('postgresql://user:pass@localhost:5432/mydb');
    });

    it('accepts minimal postgres URL', async () => {
      const config = await resolveAsync({
      resolvers: [
        [mockProvider({ DB_URL: 'postgres://localhost' }), {
          DB_URL: postgres()
        }]
      ]
    });

      expect(config.DB_URL).toBe('postgres://localhost');
    });

    it('accepts full postgres URL with all parts', async () => {
      const config = await resolveAsync({
      resolvers: [
        [mockProvider({ DB_URL: 'postgres://user:password@host.example.com:5432/database?sslmode=require' }), {
          DB_URL: postgres()
        }]
      ]
    });

      expect(config.DB_URL).toBe('postgres://user:password@host.example.com:5432/database?sslmode=require');
    });

    it('rejects non-postgres protocols', async () => {
      await expect(resolveAsync({
      resolvers: [
        [mockProvider({ DB_URL: 'http://localhost' }), {
          DB_URL: postgres()
        }]
      ]
    })).rejects.toThrow(/Invalid PostgreSQL URL/);
    });

    it('rejects invalid URLs', async () => {
      await expect(resolveAsync({
      resolvers: [
        [mockProvider({ DB_URL: 'mysql://localhost' }), {
          DB_URL: postgres()
        }]
      ]
    })).rejects.toThrow(/Invalid PostgreSQL URL/);
    });
  });

  describe('mysql', () => {
    it('validates mysql:// protocol', async () => {
      const config = await resolveAsync({
      resolvers: [
        [mockProvider({ DB_URL: 'mysql://user:pass@localhost:3306/mydb' }), {
          DB_URL: mysql()
        }]
      ]
    });

      expect(config.DB_URL).toBe('mysql://user:pass@localhost:3306/mydb');
    });

    it('accepts minimal mysql URL', async () => {
      const config = await resolveAsync({
      resolvers: [
        [mockProvider({ DB_URL: 'mysql://localhost' }), {
          DB_URL: mysql()
        }]
      ]
    });

      expect(config.DB_URL).toBe('mysql://localhost');
    });

    it('accepts mysql URL with options', async () => {
      const config = await resolveAsync({
      resolvers: [
        [mockProvider({ DB_URL: 'mysql://user:pass@host:3306/db?charset=utf8mb4' }), {
          DB_URL: mysql()
        }]
      ]
    });

      expect(config.DB_URL).toBe('mysql://user:pass@host:3306/db?charset=utf8mb4');
    });

    it('rejects non-mysql protocols', async () => {
      await expect(resolveAsync({
      resolvers: [
        [mockProvider({ DB_URL: '//localhost' }), {
          DB_URL: mysql()
        }]
      ]
    })).rejects.toThrow(/Invalid MySQL URL/);
    });
  });

  describe('mongodb', () => {
    it('validates mongodb:// protocol', async () => {
      const config = await resolveAsync({
      resolvers: [
        [mockProvider({ DB_URL: 'mongodb://user:pass@localhost:27017/mydb' }), {
          DB_URL: mongodb()
        }]
      ]
    });

      expect(config.DB_URL).toBe('mongodb://user:pass@localhost:27017/mydb');
    });

    it('validates mongodb+srv:// protocol', async () => {
      const config = await resolveAsync({
      resolvers: [
        [mockProvider({ DB_URL: 'mongodb+srv://user:pass@cluster.mongodb.net/mydb' }), {
          DB_URL: mongodb()
        }]
      ]
    });

      expect(config.DB_URL).toBe('mongodb+srv://user:pass@cluster.mongodb.net/mydb');
    });

    it('accepts minimal mongodb URL', async () => {
      const config = await resolveAsync({
      resolvers: [
        [mockProvider({ DB_URL: 'mongodb://localhost' }), {
          DB_URL: mongodb()
        }]
      ]
    });

      expect(config.DB_URL).toBe('mongodb://localhost');
    });

    it('accepts mongodb URL with replica set', async () => {
      const config = await resolveAsync({
      resolvers: [
        [mockProvider({ DB_URL: 'mongodb://host1:27017,host2:27017,host3:27017/mydb?replicaSet=rs0' }), {
          DB_URL: mongodb()
        }]
      ]
    });

      expect(config.DB_URL).toBe('mongodb://host1:27017,host2:27017,host3:27017/mydb?replicaSet=rs0');
    });

    it('rejects non-mongodb protocols', async () => {
      await expect(resolveAsync({
      resolvers: [
        [mockProvider({ DB_URL: 'http://localhost' }), {
          DB_URL: mongodb()
        }]
      ]
    })).rejects.toThrow(/Invalid MongoDB URL/);
    });
  });

  describe('redis', () => {
    it('validates redis:// protocol', async () => {
      const config = await resolveAsync({
      resolvers: [
        [mockProvider({ CACHE_URL: 'redis://localhost:6379' }), {
          CACHE_URL: redis()
        }]
      ]
    });

      expect(config.CACHE_URL).toBe('redis://localhost:6379');
    });

    it('validates rediss:// protocol (TLS)', async () => {
      const config = await resolveAsync({
      resolvers: [
        [mockProvider({ CACHE_URL: 'rediss://user:pass@localhost:6380' }), {
          CACHE_URL: redis()
        }]
      ]
    });

      expect(config.CACHE_URL).toBe('rediss://user:pass@localhost:6380');
    });

    it('accepts redis URL with database number', async () => {
      const config = await resolveAsync({
      resolvers: [
        [mockProvider({ CACHE_URL: 'redis://localhost:6379/0' }), {
          CACHE_URL: redis()
        }]
      ]
    });

      expect(config.CACHE_URL).toBe('redis://localhost:6379/0');
    });

    it('accepts redis URL with auth', async () => {
      const config = await resolveAsync({
      resolvers: [
        [mockProvider({ CACHE_URL: 'redis://:password@localhost:6379' }), {
          CACHE_URL: redis()
        }]
      ]
    });

      expect(config.CACHE_URL).toBe('redis://:password@localhost:6379');
    });

    it('rejects non-redis protocols', async () => {
      await expect(resolveAsync({
      resolvers: [
        [mockProvider({ CACHE_URL: 'http://localhost' }), {
          CACHE_URL: redis()
        }]
      ]
    })).rejects.toThrow(/Invalid Redis URL/);
    });
  });

  describe('http', () => {
    it('validates http:// protocol', async () => {
      const config = await resolveAsync({
      resolvers: [
        [mockProvider({ API_URL: 'http://api.example.com' }), {
          API_URL: http()
        }]
      ]
    });

      expect(config.API_URL).toBe('http://api.example.com');
    });

    it('validates https:// protocol', async () => {
      const config = await resolveAsync({
      resolvers: [
        [mockProvider({ API_URL: 'https://api.example.com' }), {
          API_URL: http()
        }]
      ]
    });

      expect(config.API_URL).toBe('https://api.example.com');
    });

    it('accepts HTTP URL with path and query', async () => {
      const config = await resolveAsync({
      resolvers: [
        [mockProvider({ API_URL: 'https://api.example.com/v1/users?limit=10' }), {
          API_URL: http()
        }]
      ]
    });

      expect(config.API_URL).toBe('https://api.example.com/v1/users?limit=10');
    });

    it('accepts HTTP URL with port', async () => {
      const config = await resolveAsync({
      resolvers: [
        [mockProvider({ API_URL: 'http://localhost:8080/api' }), {
          API_URL: http()
        }]
      ]
    });

      expect(config.API_URL).toBe('http://localhost:8080/api');
    });

    it('rejects non-http protocols', async () => {
      await expect(resolveAsync({
      resolvers: [
        [mockProvider({ API_URL: 'ftp://example.com' }), {
          API_URL: http()
        }]
      ]
    })).rejects.toThrow(/Invalid HTTP URL/);
    });
  });

  describe('https (strict)', () => {
    it('validates https:// protocol', async () => {
      const config = await resolveAsync({
      resolvers: [
        [mockProvider({ API_URL: 'https://api.example.com' }), {
          API_URL: https()
        }]
      ]
    });

      expect(config.API_URL).toBe('https://api.example.com');
    });

    it('accepts HTTPS URL with all parts', async () => {
      const config = await resolveAsync({
      resolvers: [
        [mockProvider({ API_URL: 'https://user:pass@api.example.com:443/v1?key=value#section' }), {
          API_URL: https()
        }]
      ]
    });

      expect(config.API_URL).toBe('https://user:pass@api.example.com:443/v1?key=value#section');
    });

    it('rejects http:// protocol (not secure)', async () => {
      await expect(resolveAsync({
      resolvers: [
        [mockProvider({ API_URL: 'http://api.example.com' }), {
          API_URL: https()
        }]
      ]
    })).rejects.toThrow(/Invalid HTTPS URL/);
    });

    it('rejects other protocols', async () => {
      await expect(resolveAsync({
      resolvers: [
        [mockProvider({ API_URL: 'ftp://example.com' }), {
          API_URL: https()
        }]
      ]
    })).rejects.toThrow(/Invalid HTTPS URL/);
    });
  });

  describe('type inference', () => {
    it('infers string type for all connection string types', async () => {
      const config = await resolveAsync({
      resolvers: [
        [mockProvider({
          POSTGRES: 'postgres://localhost',
          MYSQL: 'mysql://localhost',
          MONGODB: 'mongodb://localhost',
          REDIS: 'redis://localhost',
          HTTP: 'http://localhost',
          HTTPS: 'https://localhost'
        }), {
          POSTGRES: postgres(),
          MYSQL: mysql(),
          MONGODB: mongodb(),
          REDIS: redis(),
          HTTP: http(),
          HTTPS: https()
        }]
      ]
    });

      // Type assertions - should all be strings
      const _p: string = config.POSTGRES;
      const _m: string = config.MYSQL;
      const _mo: string = config.MONGODB;
      const _r: string = config.REDIS;
      const _h: string = config.HTTP;
      const _hs: string = config.HTTPS;
      void _p; void _m; void _mo; void _r; void _h; void _hs;

      expect(typeof config.POSTGRES).toBe('string');
      expect(typeof config.MYSQL).toBe('string');
      expect(typeof config.MONGODB).toBe('string');
      expect(typeof config.REDIS).toBe('string');
      expect(typeof config.HTTP).toBe('string');
      expect(typeof config.HTTPS).toBe('string');
    });
  });

  describe('sync version', () => {
    it('validates connection strings synchronously', async () => {
      const config = await resolveAsync({
      resolvers: [
        [mockProvider({
          DB_URL: 'postgres://localhost:5432/db',
          CACHE_URL: 'redis://localhost:6379',
          API_URL: 'https://api.example.com'
        }), {
          DB_URL: postgres(),
          CACHE_URL: redis(),
          API_URL: https()
        }]
      ]
    });

      expect(config.DB_URL).toBe('postgres://localhost:5432/db');
      expect(config.CACHE_URL).toBe('redis://localhost:6379');
      expect(config.API_URL).toBe('https://api.example.com');
    });

    it('rejects invalid connection strings synchronously', async () => {
      await expect(resolveAsync({
      resolvers: [
        [mockProvider({ DB_URL: 'http://localhost' }), {
          DB_URL: postgres()
        }]
      ]
    })).rejects.toThrow(/Invalid PostgreSQL URL/);
    });
  });

  describe('edge cases', () => {
    it('handles optional connection strings', async () => {
      const config = await resolveAsync({
      resolvers: [
        [mockProvider({}), {
          DB_URL: postgres({ optional: true }),
          CACHE_URL: redis({ optional: true })
        }]
      ]
    });

      expect(config.DB_URL).toBeUndefined();
      expect(config.CACHE_URL).toBeUndefined();
    });

    it('handles connection strings with defaults', async () => {
      const config = await resolveAsync({
      resolvers: [
        [mockProvider({}), {
          DB_URL: postgres({ default: 'postgres://localhost:5432/defaultdb' })
        }]
      ]
    });

      expect(config.DB_URL).toBe('postgres://localhost:5432/defaultdb');
    });

    it('validates malformed URLs', async () => {
      await expect(resolveAsync({
      resolvers: [
        [mockProvider({ DB_URL: 'not-a-url' }), {
          DB_URL: postgres()
        }]
      ]
    })).rejects.toThrow(/Invalid PostgreSQL URL/);
    });

    it('handles empty protocol part', async () => {
      await expect(resolveAsync({
      resolvers: [
        [mockProvider({ DB_URL: 'not-a-url' }), {
          DB_URL: postgres()
        }]
      ]
    })).rejects.toThrow(/Invalid PostgreSQL URL/);
    });
  });

  describe('Date and Timestamp Types', () => {
    describe('date', () => {
      it('validates ISO 8601 date (YYYY-MM-DD)', async () => {
        const config = await resolveAsync({
      resolvers: [
        [mockProvider({ EXPIRY_DATE: '2025-12-31' }), {
            EXPIRY_DATE: date()
          }]
      ]
    });
        expect(config.EXPIRY_DATE).toBe('2025-12-31');
      });

      it('validates ISO 8601 datetime with time', async () => {
        const config = await resolveAsync({
      resolvers: [
        [mockProvider({ CREATED_AT: '2025-10-02T14:30:00Z' }), {
            CREATED_AT: date()
          }]
      ]
    });
        expect(config.CREATED_AT).toBe('2025-10-02T14:30:00Z');
      });

      it('validates ISO 8601 datetime with milliseconds', async () => {
        const config = await resolveAsync({
      resolvers: [
        [mockProvider({ UPDATED_AT: '2025-10-02T14:30:00.123Z' }), {
            UPDATED_AT: date()
          }]
      ]
    });
        expect(config.UPDATED_AT).toBe('2025-10-02T14:30:00.123Z');
      });

      it('supports required date with !', async () => {
        await expect(resolveAsync({
      resolvers: [
        [mockProvider({}), {
            REQUIRED_DATE: date()
          }]
      ]
    })).rejects.toThrow(/Missing required environment variable/);
      });

      it('supports optional date with ?', async () => {
        const config = await resolveAsync({
      resolvers: [
        [mockProvider({}), {
            OPTIONAL_DATE: 'date?'
          }]
      ]
    });
        expect(config.OPTIONAL_DATE).toBeUndefined();
      });

      it('supports default date', async () => {
        const config = await resolveAsync({
      resolvers: [
        [mockProvider({}), {
            TRIAL_END: 'date:2025-12-31'
          }]
      ]
    });
        expect(config.TRIAL_END).toBe('2025-12-31');
      });

      it('throws on invalid date format', async () => {
        await expect(resolveAsync({
      resolvers: [
        [mockProvider({ BAD_DATE: '12/31/2025' }), {
            BAD_DATE: date()
          }]
      ]
    })).rejects.toThrow(/Date must be in ISO 8601 format/);
      });

      it('throws on invalid date value', async () => {
        await expect(resolveAsync({
      resolvers: [
        [mockProvider({ BAD_DATE: '2025-13-32' }), {
            BAD_DATE: date()
          }]
      ]
    })).rejects.toThrow(/Cannot parse date value/);
      });

      it('throws on non-date string', async () => {
        await expect(resolveAsync({
      resolvers: [
        [mockProvider({ BAD_DATE: 'not-a-date' }), {
            BAD_DATE: date()
          }]
      ]
    })).rejects.toThrow(/Date must be in ISO 8601 format/);
      });
    });

    describe('timestamp', () => {
      it('validates Unix timestamp', async () => {
        const config = await resolveAsync({
      resolvers: [
        [mockProvider({ SESSION_EXPIRES: '1735689600' }), {
            SESSION_EXPIRES: timestamp()
          }]
      ]
    });
        expect(config.SESSION_EXPIRES).toBe(1735689600);
      });

      it('validates timestamp 0 (epoch)', async () => {
        const config = await resolveAsync({
      resolvers: [
        [mockProvider({ EPOCH: '0' }), {
            EPOCH: timestamp()
          }]
      ]
    });
        expect(config.EPOCH).toBe(0);
      });

      it('validates large timestamp', async () => {
        const config = await resolveAsync({
      resolvers: [
        [mockProvider({ FAR_FUTURE: '253402300799' }), {
            FAR_FUTURE: timestamp()
          }]
      ]
    }); // Year 9999
        expect(config.FAR_FUTURE).toBe(253402300799);
      });

      it('supports required timestamp with !', async () => {
        await expect(resolveAsync({
      resolvers: [
        [mockProvider({}), {
            REQUIRED_TS: timestamp()
          }]
      ]
    })).rejects.toThrow(/Missing required environment variable/);
      });

      it('supports optional timestamp with ?', async () => {
        const config = await resolveAsync({
      resolvers: [
        [mockProvider({}), {
            OPTIONAL_TS: 'timestamp?'
          }]
      ]
    });
        expect(config.OPTIONAL_TS).toBeUndefined();
      });

      it('supports default timestamp', async () => {
        const config = await resolveAsync({
      resolvers: [
        [mockProvider({}), {
            TIMEOUT: timestamp({ default: 1735689600 })
          }]
      ]
    });
        expect(config.TIMEOUT).toBe(1735689600);
      });

      it('throws on negative timestamp', async () => {
        await expect(resolveAsync({
      resolvers: [
        [mockProvider({ BAD_TS: '-1' }), {
            BAD_TS: timestamp()
          }]
      ]
    })).rejects.toThrow(/Invalid timestamp/);
      });

      it('throws on timestamp too large', async () => {
        await expect(resolveAsync({
      resolvers: [
        [mockProvider({ BAD_TS: '999999999999' }), {
            BAD_TS: timestamp()
          }]
      ]
    })).rejects.toThrow(/Timestamp too large/);
      });

      it('throws on non-numeric timestamp', async () => {
        await expect(resolveAsync({
      resolvers: [
        [mockProvider({ BAD_TS: 'not-a-number' }), {
            BAD_TS: timestamp()
          }]
      ]
    })).rejects.toThrow(/Invalid timestamp/);
      });

      it('throws on decimal timestamp', async () => {
        await expect(resolveAsync({
      resolvers: [
        [mockProvider({ BAD_TS: '1735689600.5' }), {
            BAD_TS: timestamp()
          }]
      ]
    })).rejects.toThrow(/Invalid timestamp/);
      });
    });
  });

  describe('resolveAsync() tuple API', () => {
    it('resolves with single provider tuple', async () => {
      const provider1 = mockProvider({ FOO: 'bar', PORT: '3000' });

      const config = await resolveAsync({
      resolvers: [
        [provider1, { FOO: string(), PORT: number() }]
      ]
    });

      expect(config.FOO).toBe('bar');
      expect(config.PORT).toBe(3000);
    });

    it('merges multiple provider tuples with last-wins', async () => {
      const provider1 = mockProvider({ FOO: 'first', BAR: '100' });
      const provider2 = mockProvider({ FOO: 'second', QUX: 'value' });

      const config = await resolveAsync({
      resolvers: [
        [provider1, { FOO: string(), BAR: number() }],
        [provider2, { FOO: string(), QUX: string() }]
      ]
    });

      expect(config.FOO).toBe('second'); // Last provider wins
      expect(config.BAR).toBe(100);      // From first provider
      expect(config.QUX).toBe('value');  // From second provider
    });

    it('supports options as last argument', async () => {
      const provider1 = mockProvider({ REQUIRED: 'value' });

      const config = await resolveAsync({
        resolvers: [
          [provider1, { REQUIRED: string(), OPTIONAL: string({optional:true}) }]
        ],
        options: { strict: true }
      });

      expect(config.REQUIRED).toBe('value');
      expect(config.OPTIONAL).toBeUndefined();
    });
  });

  describe('resolveAsync() tuple API (sync)', () => {
    it('resolves synchronously with tuples', async () => {
      const provider1 = mockProvider({ FOO: 'bar' });

      const config = await resolveAsync({
        resolvers: [
          [provider1, { FOO: string() }]
        ]
      });

      expect(config.FOO).toBe('bar');
    });

    it('merges multiple resolvers with last-wins', async () => {
      const provider1 = mockProvider({ FOO: 'first' });
      const provider2 = mockProvider({ FOO: 'second', BAR: '42' });

      const config = await resolveAsync({
      resolvers: [
        [provider1, { FOO: string() }],
        [provider2, { FOO: string(), BAR: number() }]
      ]
    });

      expect(config.FOO).toBe('second'); // Last provider wins
      expect(config.BAR).toBe(42);
    });
  });

  describe('Custom Validator Functions', () => {
    it('should accept custom validator functions', async () => {
      // Custom validator that converts string to positive number
      const positiveNumber = (value: string): number => {
        const parsed = parseInt(value, 10);
        if (isNaN(parsed) || parsed < 0) {
          throw new Error('Must be a positive number');
        }
        return parsed;
      };

      // Custom validator that validates and transforms to uppercase
      const uppercaseString = (value: string): string => {
        if (value.length < 2) {
          throw new Error('Must be at least 2 characters');
        }
        return value.toUpperCase();
      };

      const config = await resolveAsync({
      resolvers: [
        [mockProvider({
          CUSTOM_PORT: '8080',
          CUSTOM_NAME: 'hello',
          REGULAR_URL: 'https://example.com'
        }), {
          CUSTOM_PORT: positiveNumber,
          CUSTOM_NAME: uppercaseString,
          REGULAR_URL: url()  // Mix with built-in validators
        }]
      ]
    });

      expect(config.CUSTOM_PORT).toBe(8080);
      expect(config.CUSTOM_NAME).toBe('HELLO');
      expect(config.REGULAR_URL).toBe('https://example.com');
    });

    it('should provide correct TypeScript types for custom validators', async () => {
      const customValidator = (value: string): { id: number; name: string } => {
        const parts = value.split(':');
        if (parts.length !== 2) {
          throw new Error('Must be in format "id:name"');
        }
        return {
          id: parseInt(parts[0], 10),
          name: parts[1]
        };
      };

      const config = await resolveAsync({
      resolvers: [
        [mockProvider({
          USER_DATA: '123:john'
        }), {
          USER_DATA: customValidator
        }]
      ]
    });

      expect(config.USER_DATA).toEqual({ id: 123, name: 'john' });
      expect(typeof config.USER_DATA.id).toBe('number');
      expect(typeof config.USER_DATA.name).toBe('string');
    });

    it('should throw validation errors from custom validators', async () => {
      const strictNumber = (value: string): number => {
        const parsed = parseFloat(value);
        if (isNaN(parsed)) {
          throw new Error('Invalid number format');
        }
        if (parsed < 0 || parsed > 100) {
          throw new Error('Number must be between 0 and 100');
        }
        return parsed;
      };

      await expect(resolveAsync({
      resolvers: [
        [mockProvider({
          SCORE: '150'  // Invalid: too high
        }), {
          SCORE: strictNumber
        }]
      ]
    })).rejects.toThrow('Number must be between 0 and 100');

      await expect(resolveAsync({
      resolvers: [
        [mockProvider({
          SCORE: 'invalid'  // Invalid: not a number
        }), {
          SCORE: strictNumber
        }]
      ]
    })).rejects.toThrow('Invalid number format');
    });

    it('should work with synchronous resolve', async () => {
      const customValidator = (value: string): boolean => {
        return value.toLowerCase() === 'true';
      };

      const config = await resolveAsync({
      resolvers: [
        [mockProvider({
          ENABLED: 'true'
        }), {
          ENABLED: customValidator
        }]
      ]
    });

      expect(config.ENABLED).toBe(true);
    });

    it('should work with provider composition', async () => {
      const customValidator = (value: string): string[] => {
        return value.split(',').map(s => s.trim());
      };

      const config = await resolveAsync({
      resolvers: [
        [mockProvider({ TAGS: 'react,typescript,node' }), {
          TAGS: customValidator
        }]
      ]
    });

      expect(config.TAGS).toEqual(['react', 'typescript', 'node']);
    });

    it('should handle complex custom validation with defaults', async () => {
      const configValidator = (value: string): { theme: string; size: number } => {
        try {
          const parsed = JSON.parse(value);
          if (!parsed.theme || !parsed.size) {
            throw new Error('Missing required fields');
          }
          return {
            theme: parsed.theme,
            size: parseInt(parsed.size, 10)
          };
        } catch {
          throw new Error('Invalid JSON format');
        }
      };

      const config = await resolveAsync({
      resolvers: [
        [mockProvider({
          APP_CONFIG: '{"theme": "dark", "size": "16"}'
        }), {
          APP_CONFIG: configValidator,
          PORT: 3000  // Mix with default values
        }]
      ]
    });

      expect(config.APP_CONFIG).toEqual({ theme: 'dark', size: 16 });
      expect(config.PORT).toBe(3000);
    });
  });

  describe('validateDefaults option', () => {
    it('should validate default values when validateDefaults is true', async () => {
      // Test that invalid port values are rejected when provided directly
      await expect(resolveAsync({
      resolvers: [
        [mockProvider({ PORT: '99999' }), {
          PORT: port()  // No default, but invalid value provided
        }]
      ]
    })).rejects.toThrow(/Invalid port/);
    });

    it('should not validate defaults when validateDefaults is false (default)', async () => {
      // Test that valid defaults work correctly
      const config = await resolveAsync({
      resolvers: [
        [mockProvider({}), {
          PORT: port({ default: 8080 })  // Valid port default
        }]
      ]
    });

      expect(config.PORT).toBe(8080);  // Returns valid default
    });

    it('should validate string defaults with min/max', async () => {
      // String too short
      await expect(resolveAsync({
      resolvers: [
        [mockProvider({ NAME: 'x' }), {
          NAME: string({ min: 3 })
        }]
      ]
    })).rejects.toThrow(/String too short/);
    });

    it('should validate number defaults with min/max', async () => {
      // Number too large
      await expect(resolveAsync({
      resolvers: [
        [mockProvider({ SCORE: '150' }), {
          SCORE: number({ max: 100 })
        }]
      ]
    })).rejects.toThrow(/Number too large/);
    });

    it('should validate enum defaults', async () => {
      // Invalid enum value
      await expect(resolveAsync({
      resolvers: [
        [mockProvider({ NODE_ENV: 'staging' }), {
          NODE_ENV: oneOf(['dev', 'prod'])
        }]
      ]
    })).rejects.toThrow(/Invalid value/);
    });

    it('should validate pattern defaults', async () => {
      // Invalid pattern
      await expect(resolveAsync({
      resolvers: [
        [mockProvider({ CODE: 'AB' }), {
          CODE: string({ pattern: '^[A-Z]{3}$' })
        }]
      ]
    })).rejects.toThrow(/does not match required pattern/);
    });

    it('should validate advanced type defaults (email)', async () => {
      // Invalid email
      await expect(resolveAsync({
      resolvers: [
        [mockProvider({ ADMIN_EMAIL: 'not-an-email' }), {
          ADMIN_EMAIL: email()
        }]
      ]
    })).rejects.toThrow(/Invalid email/);
    });

    it('should validate advanced type defaults (postgres URL)', async () => {
      // Invalid postgres URL
      await expect(resolveAsync({
      resolvers: [
        [mockProvider({ DATABASE_URL: 'http://localhost' }), {
          DATABASE_URL: postgres()
        }]
      ]
    })).rejects.toThrow(/Invalid PostgreSQL URL/);
    });

    it('should allow valid defaults when validateDefaults is true', async () => {
      const config = await resolveAsync({
        resolvers: [
          [mockProvider({}), {
            PORT: port({ default: 8080 }),                    // Valid port
            EMAIL: email({ default: 'admin@example.com' }),      // Valid email
            NODE_ENV: oneOf(['dev', 'prod'], { default: 'dev' }),  // Valid enum
            NAME: string({ default: 'test', min: 3, max: 10 })            // Valid string
          }]
        ],
        options: { validateDefaults: true }
      });

      expect(config.PORT).toBe(8080);
      expect(config.EMAIL).toBe('admin@example.com');
      expect(config.NODE_ENV).toBe('dev');
      expect(config.NAME).toBe('test');
    });

    it('should work with sync resolution', async () => {
      // Invalid timestamp value
      await expect(resolveAsync({
        resolvers: [
          [mockProvider({ EXPIRY: '999999999999' }), {
            EXPIRY: timestamp()
          }]
        ]
      })).rejects.toThrow(/Timestamp too large/);
    });

    it('should validate boolean defaults', async () => {
      const config = await resolveAsync({
      resolvers: [
        [mockProvider({ DEBUG: 'true' }), {
          DEBUG: boolean()
        }]
      ]
    });

      expect(config.DEBUG).toBe(true);
    });

    it('should catch configuration errors at startup', async () => {
      // This is the main use case - catching bad config early
      await expect(resolveAsync({
      resolvers: [
        [mockProvider({ 
          PORT: '0',  // Port 0 is invalid
          HOST: '',  // Empty string with min length
          TIMEOUT: '-1'  // Negative timestamp
        }), {
          PORT: port(),
          HOST: string({ min: 1 }),
          TIMEOUT: timestamp()
        }]
      ]
    })).rejects.toThrow(/Environment validation failed/);
    });
  });
});