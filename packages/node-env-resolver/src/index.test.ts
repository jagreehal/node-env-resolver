import { describe, it, expect } from 'vitest';
import { resolve, resolveSync } from './index';import { resolveEnvWithZod } from './zod';import {
  validateWithStandardSchema,
  toStandardSchema,
  schemaToStandardSchema
} from './standard-schema';
// Helper to create mock provider
const mockProvider = (env: Record<string, string>) => ({
  name: 'mock',
  async load() { return env; },
  loadSync() { return env; }
});

describe('Simplified resolve() API', () => {
  it('handles shorthand syntax for types', async () => {
    const config = await resolve({
      PORT: 3000,                    // number with default
      DATABASE_URL: 'url',          // required secret url
      API_KEY: 'string?',            // optional string
      NODE_ENV: ['dev', 'prod'],     // enum
      DEBUG: false,                  // boolean with default
    }, {
      resolvers: [
        {
          name: 'mock',
          async load() {
            return { 
              DATABASE_URL: 'https://db.example.com',
              NODE_ENV: 'dev'
            } as Record<string, string>;
          },
        },
      ],
    });

    expect(config.PORT).toBe(3000);
    expect(config.DATABASE_URL).toBe('https://db.example.com');
    expect(config.API_KEY).toBeUndefined();
    expect(config.NODE_ENV).toBe('dev');
    expect(config.DEBUG).toBe(false);
  });

  it('parses shorthand with defaults correctly', async () => {
    const config = await resolve({
      PORT: 'port:8080',              // port type with default
      HOST: 'string:localhost',       // string with default
      ENABLED: 'boolean:true',        // boolean with default string
    }, {
      resolvers: [
        {
          name: 'mock',
          async load() {
            return {} as Record<string, string>;
          },
        },
      ],
    });

    expect(config.PORT).toBe(8080);
    expect(config.HOST).toBe('localhost');
    expect(config.ENABLED).toBe(true);
  });

  it('handles secret and optional modifiers', async () => {
    const config = await resolve({
      SECRET_KEY: 'string',         // required secret
      OPTIONAL_VAR: 'string?',       // optional
      BOTH: 'string!?',              // secret and optional
    }, {
      resolvers: [
        {
          name: 'mock',
          async load() {
            return { 
              SECRET_KEY: 'secret123'
            } as Record<string, string>;
          },
        },
      ],
    });

    expect(config.SECRET_KEY).toBe('secret123');
    expect(config.OPTIONAL_VAR).toBeUndefined();
    expect(config.BOTH).toBeUndefined();
  });

  it('handles regex patterns in shorthand', async () => {
    const config = await resolve({
      DATABASE_URL: 'string:/^postgres:\\/\\//',  // pattern validation
    }, {
      resolvers: [
        {
          name: 'mock',
          async load() {
            return { 
              DATABASE_URL: 'postgres://user:pass@host/db'
            } as Record<string, string>;
          },
        },
      ],
    });

    expect(config.DATABASE_URL).toBe('postgres://user:pass@host/db');
  });

  it('throws on invalid pattern match', async () => {
    await expect(resolve({
      DATABASE_URL: 'string:/^postgres:\\/\\//',
    }, {
      resolvers: [
        {
          name: 'mock',
          async load() {
            return { 
              DATABASE_URL: 'mysql://host/db'
            } as Record<string, string>;
          },
        },
      ],
    })).rejects.toThrow(/does not match required pattern/);
  });

  it('uses smart defaults when no resolvers specified', async () => {
    const prevEnv = process.env.TEST_VAR;
    process.env.TEST_VAR = 'from-process-env';
    
    const config = await resolve({
      TEST_VAR: 'string',
    });

    expect(config.TEST_VAR).toBe('from-process-env');
    
    if (prevEnv !== undefined) {
      process.env.TEST_VAR = prevEnv;
    } else {
      delete process.env.TEST_VAR;
    }
  });

  it('validates required variables', async () => {
    await expect(resolve({
      REQUIRED_VAR: 'string',  // required, no default
    }, {
      resolvers: [
        {
          name: 'mock',
          async load() {
            return {} as Record<string, string>;
          },
        },
      ],
    })).rejects.toThrow(/Missing required environment variable: REQUIRED_VAR/);
  });

  it('handles enum validation', async () => {
    const config = await resolve({
      ENV_MODE: ['dev', 'staging', 'prod'],
    }, {
      resolvers: [
        {
          name: 'mock',
          async load() {
            return { ENV_MODE: 'staging' } as Record<string, string>;
          },
        },
      ],
    });

    expect(config.ENV_MODE).toBe('staging');
  });

  it('throws on invalid enum value', async () => {
    await expect(resolve({
      ENV_MODE: ['dev', 'staging', 'prod'],
    }, {
      resolvers: [
        {
          name: 'mock',
          async load() {
            return { ENV_MODE: 'invalid' } as Record<string, string>;
          },
        },
      ],
    })).rejects.toThrow(/must be one of: dev, staging, prod/);
  });

  it('handles email type validation', async () => {
    const config = await resolve({
      CONTACT_EMAIL: 'email',
      SUPPORT_EMAIL: 'email?',
    }, {
      resolvers: [
        {
          name: 'mock',
          async load() {
            return {
              CONTACT_EMAIL: 'user@example.com'
            } as Record<string, string>;
          },
        },
      ],
    });

    expect(config.CONTACT_EMAIL).toBe('user@example.com');
    expect(config.SUPPORT_EMAIL).toBeUndefined();
  });

  it('throws on invalid email', async () => {
    await expect(resolve({
      EMAIL: 'email',
    }, {
      resolvers: [
        {
          name: 'mock',
          async load() {
            return { EMAIL: 'not-an-email' } as Record<string, string>;
          },
        },
      ],
    })).rejects.toThrow(/Invalid email/);
  });

  it('handles json type validation', async () => {
    const config = await resolve({
      FEATURE_FLAGS: 'json',
      CONFIG: 'json?',
    }, {
      resolvers: [
        {
          name: 'mock',
          async load() {
            return {
              FEATURE_FLAGS: '{"analytics":true,"beta":false}'
            } as Record<string, string>;
          },
        },
      ],
    });

    expect(config.FEATURE_FLAGS).toEqual({ analytics: true, beta: false });
    expect(config.CONFIG).toBeUndefined();
  });

  it('throws on invalid json', async () => {
    await expect(resolve({
      CONFIG: 'json',
    }, {
      resolvers: [
        {
          name: 'mock',
          async load() {
            return { CONFIG: '{invalid json}' } as Record<string, string>;
          },
        },
      ],
    })).rejects.toThrow(/Invalid JSON/);
  });

  it('handles email with default value', async () => {
    const config = await resolve({
      ADMIN_EMAIL: 'email:admin@example.com',
    }, {
      resolvers: [
        {
          name: 'mock',
          async load() {
            return {} as Record<string, string>;
          },
        },
      ],
    });

    expect(config.ADMIN_EMAIL).toBe('admin@example.com');
  });

  it('handles json with default value', async () => {
    const config = await resolve({
      SETTINGS: 'json:{"theme":"dark"}',
    }, {
      resolvers: [
        {
          name: 'mock',
          async load() {
            return {} as Record<string, string>;
          },
        },
      ],
    });

    expect(config.SETTINGS).toEqual({ theme: 'dark' });
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
    const env = await resolveEnvWithZod(schema, {
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

  it('works with Standard Schema V1', async () => {
    // Create a proper Standard Schema using node-env-resolver's helper
    const nodeEnvSchema = {
      type: 'string' as const,
      default: 'development'
    };
    
    const standardSchema = toStandardSchema('NODE_ENV', nodeEnvSchema);
    
    // Test individual validation
    const result = await validateWithStandardSchema(standardSchema, 'test');
    expect((result as { value: string }).value).toBe('test');
    
    // Test schema conversion
    const schema = {
      NODE_ENV: nodeEnvSchema
    };
    const standardSchemaMap = schemaToStandardSchema(schema);
    expect(standardSchemaMap.NODE_ENV['~standard'].vendor).toBe('node-env-resolver');
  });
});

describe('resolveSync() - Synchronous environment resolver', () => {
  it('handles basic sync functionality', () => {
    // Set test environment variables
    process.env.TEST_STRING = 'hello';
    process.env.TEST_NUMBER = '42';
    process.env.TEST_BOOLEAN = 'true';
    
    const config = resolveSync({
      TEST_STRING: 'string',
      TEST_NUMBER: 'number',
      TEST_BOOLEAN: 'boolean'
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
    const config = resolveSync({
      PORT: 3000,                    // number default
      DEBUG: false,                  // boolean default
      API_URL: 'url:https://api.example.com',  // url with default
      MISSING_OPTIONAL: 'string?'    // optional string
    });
    
    expect(config.PORT).toBe(3000);
    expect(config.DEBUG).toBe(false);
    expect(config.API_URL).toBe('https://api.example.com');
    expect(config.MISSING_OPTIONAL).toBeUndefined();
  });

  it('validates enums in sync mode', () => {
    process.env.NODE_ENV = 'development';
    
    const config = resolveSync({
      NODE_ENV: ['development', 'production', 'test']
    });
    
    expect(config.NODE_ENV).toBe('development');
    
    // Clean up
    delete process.env.NODE_ENV;
  });

  it('throws errors for invalid values in sync mode', () => {
    process.env.INVALID_ENV = 'invalid';
    
    expect(() => {
      resolveSync({
        INVALID_ENV: ['valid1', 'valid2']
      });
    }).toThrow('Environment validation failed');
    
    // Clean up
    delete process.env.INVALID_ENV;
  });

  it('works with custom sync resolvers', () => {
    const customProvider = {
      name: 'custom-sync',
      async load() {
        return { CUSTOM_VALUE: 'from-custom-provider' };
      },
      loadSync() {
        return { CUSTOM_VALUE: 'from-custom-provider' };
      }
    };
    
    const config = resolveSync({
      CUSTOM_VALUE: 'string'
    }, {
      resolvers: [customProvider]
    });
    
    expect(config.CUSTOM_VALUE).toBe('from-custom-provider');
  });

  it('throws error for async-only resolvers in strict mode', () => {
    const asyncProvider = {
      name: 'async-only',
      async load() {
        return { ASYNC_VALUE: 'async' };
      }
      // No loadSync method
    };
    
    expect(() => {
      resolveSync({
        ASYNC_VALUE: 'string'
      }, {
        resolvers: [asyncProvider],
        strict: true
      });
    }).toThrow('Resolver async-only has no loadSync() method');
  });

  it('skips async-only resolvers in non-strict mode', () => {
    const asyncProvider = {
      name: 'async-only',
      async load() {
        return { ASYNC_VALUE: 'async' };
      }
      // No loadSync method
    };

    // This should not throw and should work with other resolvers
    const config = resolveSync({
      PORT: 3000  // Use default from process.env (which has loadSync)
    }, {
      resolvers: [asyncProvider],
      strict: false
    });

    expect(config.PORT).toBe(3000);
  });

  it('throws error when using Standard Schema validators with resolveSync', () => {
    // Create a mock Standard Schema object
    const zodLikeSchema = {
      '~standard': {
        version: 1,
        vendor: 'zod',
        validate: async () => ({ value: 'test' })
      }
    };

    expect(() => {
      resolveSync({
        // @ts-expect-error - Testing runtime behavior
        DATABASE_URL: zodLikeSchema
      });
    }).toThrow(/resolveSync\(\) cannot be used with async validators/);

    expect(() => {
      resolveSync({
        // @ts-expect-error - Testing runtime behavior
        DATABASE_URL: zodLikeSchema
      });
    }).toThrow(/Use resolve\(\) instead/);
  });
});

describe('Connection String Types', () => {
  describe('postgres / postgresql', () => {
    it('validates postgres:// protocol', async () => {
      const config = await resolve({
        DB_URL: 'postgres'
      }, { resolvers: [mockProvider({ DB_URL: 'postgres://user:pass@localhost:5432/mydb' })] });

      expect(config.DB_URL).toBe('postgres://user:pass@localhost:5432/mydb');
    });

    it('validates postgresql:// protocol', async () => {
      const config = await resolve({
        DB_URL: 'postgresql'
      }, { resolvers: [mockProvider({ DB_URL: 'postgresql://user:pass@localhost:5432/mydb' })] });

      expect(config.DB_URL).toBe('postgresql://user:pass@localhost:5432/mydb');
    });

    it('accepts minimal postgres URL', async () => {
      const config = await resolve({
        DB_URL: 'postgres'
      }, { resolvers: [mockProvider({ DB_URL: 'postgres://localhost' })] });

      expect(config.DB_URL).toBe('postgres://localhost');
    });

    it('accepts full postgres URL with all parts', async () => {
      const config = await resolve({
        DB_URL: 'postgres'
      }, { resolvers: [mockProvider({ DB_URL: 'postgres://user:password@host.example.com:5432/database?sslmode=require' })] });

      expect(config.DB_URL).toBe('postgres://user:password@host.example.com:5432/database?sslmode=require');
    });

    it('rejects non-postgres protocols', async () => {
      await expect(resolve({
        DB_URL: 'postgres'
      }, { resolvers: [mockProvider({ DB_URL: 'http://localhost' })] })).rejects.toThrow(/Invalid PostgreSQL URL/);
    });

    it('rejects invalid URLs', async () => {
      await expect(resolve({
        DB_URL: 'postgres'
      }, { resolvers: [mockProvider({ DB_URL: 'postgres://' })] })).rejects.toThrow(/Invalid PostgreSQL URL/);
    });
  });

  describe('mysql', () => {
    it('validates mysql:// protocol', async () => {
      const config = await resolve({
        DB_URL: 'mysql'
      }, { resolvers: [mockProvider({ DB_URL: 'mysql://user:pass@localhost:3306/mydb' })] });

      expect(config.DB_URL).toBe('mysql://user:pass@localhost:3306/mydb');
    });

    it('accepts minimal mysql URL', async () => {
      const config = await resolve({
        DB_URL: 'mysql'
      }, { resolvers: [mockProvider({ DB_URL: 'mysql://localhost' })] });

      expect(config.DB_URL).toBe('mysql://localhost');
    });

    it('accepts mysql URL with options', async () => {
      const config = await resolve({
        DB_URL: 'mysql'
      }, { resolvers: [mockProvider({ DB_URL: 'mysql://user:pass@host:3306/db?charset=utf8mb4' })] });

      expect(config.DB_URL).toBe('mysql://user:pass@host:3306/db?charset=utf8mb4');
    });

    it('rejects non-mysql protocols', async () => {
      await expect(resolve({
        DB_URL: 'mysql'
      }, { resolvers: [mockProvider({ DB_URL: 'postgres://localhost' })] })).rejects.toThrow(/Invalid MySQL URL/);
    });
  });

  describe('mongodb', () => {
    it('validates mongodb:// protocol', async () => {
      const config = await resolve({
        DB_URL: 'mongodb'
      }, { resolvers: [mockProvider({ DB_URL: 'mongodb://user:pass@localhost:27017/mydb' })] });

      expect(config.DB_URL).toBe('mongodb://user:pass@localhost:27017/mydb');
    });

    it('validates mongodb+srv:// protocol', async () => {
      const config = await resolve({
        DB_URL: 'mongodb'
      }, { resolvers: [mockProvider({ DB_URL: 'mongodb+srv://user:pass@cluster.mongodb.net/mydb' })] });

      expect(config.DB_URL).toBe('mongodb+srv://user:pass@cluster.mongodb.net/mydb');
    });

    it('accepts minimal mongodb URL', async () => {
      const config = await resolve({
        DB_URL: 'mongodb'
      }, { resolvers: [mockProvider({ DB_URL: 'mongodb://localhost' })] });

      expect(config.DB_URL).toBe('mongodb://localhost');
    });

    it('accepts mongodb URL with replica set', async () => {
      const config = await resolve({
        DB_URL: 'mongodb'
      }, { resolvers: [mockProvider({ DB_URL: 'mongodb://host1:27017,host2:27017,host3:27017/mydb?replicaSet=rs0' })] });

      expect(config.DB_URL).toBe('mongodb://host1:27017,host2:27017,host3:27017/mydb?replicaSet=rs0');
    });

    it('rejects non-mongodb protocols', async () => {
      await expect(resolve({
        DB_URL: 'mongodb'
      }, { resolvers: [mockProvider({ DB_URL: 'http://localhost' })] })).rejects.toThrow(/Invalid MongoDB URL/);
    });
  });

  describe('redis', () => {
    it('validates redis:// protocol', async () => {
      const config = await resolve({
        CACHE_URL: 'redis'
      }, { resolvers: [mockProvider({ CACHE_URL: 'redis://localhost:6379' })] });

      expect(config.CACHE_URL).toBe('redis://localhost:6379');
    });

    it('validates rediss:// protocol (TLS)', async () => {
      const config = await resolve({
        CACHE_URL: 'redis'
      }, { resolvers: [mockProvider({ CACHE_URL: 'rediss://user:pass@localhost:6380' })] });

      expect(config.CACHE_URL).toBe('rediss://user:pass@localhost:6380');
    });

    it('accepts redis URL with database number', async () => {
      const config = await resolve({
        CACHE_URL: 'redis'
      }, { resolvers: [mockProvider({ CACHE_URL: 'redis://localhost:6379/0' })] });

      expect(config.CACHE_URL).toBe('redis://localhost:6379/0');
    });

    it('accepts redis URL with auth', async () => {
      const config = await resolve({
        CACHE_URL: 'redis'
      }, { resolvers: [mockProvider({ CACHE_URL: 'redis://:password@localhost:6379' })] });

      expect(config.CACHE_URL).toBe('redis://:password@localhost:6379');
    });

    it('rejects non-redis protocols', async () => {
      await expect(resolve({
        CACHE_URL: 'redis'
      }, { resolvers: [mockProvider({ CACHE_URL: 'http://localhost' })] })).rejects.toThrow(/Invalid Redis URL/);
    });
  });

  describe('http', () => {
    it('validates http:// protocol', async () => {
      const config = await resolve({
        API_URL: 'http'
      }, { resolvers: [mockProvider({ API_URL: 'http://api.example.com' })] });

      expect(config.API_URL).toBe('http://api.example.com');
    });

    it('validates https:// protocol', async () => {
      const config = await resolve({
        API_URL: 'http'
      }, { resolvers: [mockProvider({ API_URL: 'https://api.example.com' })] });

      expect(config.API_URL).toBe('https://api.example.com');
    });

    it('accepts HTTP URL with path and query', async () => {
      const config = await resolve({
        API_URL: 'http'
      }, { resolvers: [mockProvider({ API_URL: 'https://api.example.com/v1/users?limit=10' })] });

      expect(config.API_URL).toBe('https://api.example.com/v1/users?limit=10');
    });

    it('accepts HTTP URL with port', async () => {
      const config = await resolve({
        API_URL: 'http'
      }, { resolvers: [mockProvider({ API_URL: 'http://localhost:8080/api' })] });

      expect(config.API_URL).toBe('http://localhost:8080/api');
    });

    it('rejects non-http protocols', async () => {
      await expect(resolve({
        API_URL: 'http'
      }, { resolvers: [mockProvider({ API_URL: 'ftp://example.com' })] })).rejects.toThrow(/Invalid HTTP URL/);
    });
  });

  describe('https (strict)', () => {
    it('validates https:// protocol', async () => {
      const config = await resolve({
        API_URL: 'https'
      }, { resolvers: [mockProvider({ API_URL: 'https://api.example.com' })] });

      expect(config.API_URL).toBe('https://api.example.com');
    });

    it('accepts HTTPS URL with all parts', async () => {
      const config = await resolve({
        API_URL: 'https'
      }, { resolvers: [mockProvider({ API_URL: 'https://user:pass@api.example.com:443/v1?key=value#section' })] });

      expect(config.API_URL).toBe('https://user:pass@api.example.com:443/v1?key=value#section');
    });

    it('rejects http:// protocol (not secure)', async () => {
      await expect(resolve({
        API_URL: 'https'
      }, { resolvers: [mockProvider({ API_URL: 'http://api.example.com' })] })).rejects.toThrow(/Invalid HTTPS URL/);
    });

    it('rejects other protocols', async () => {
      await expect(resolve({
        API_URL: 'https'
      }, { resolvers: [mockProvider({ API_URL: 'ftp://example.com' })] })).rejects.toThrow(/Invalid HTTPS URL/);
    });
  });

  describe('type inference', () => {
    it('infers string type for all connection string types', async () => {
      const config = await resolve({
        POSTGRES: 'postgres',
        MYSQL: 'mysql',
        MONGODB: 'mongodb',
        REDIS: 'redis',
        HTTP: 'http',
        HTTPS: 'https'
      }, {
        resolvers: [mockProvider({
          POSTGRES: 'postgres://localhost',
          MYSQL: 'mysql://localhost',
          MONGODB: 'mongodb://localhost',
          REDIS: 'redis://localhost',
          HTTP: 'http://localhost',
          HTTPS: 'https://localhost'
        })]
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
    it('validates connection strings synchronously', () => {
      const config = resolveSync({
        DB_URL: 'postgres',
        CACHE_URL: 'redis',
        API_URL: 'https'
      }, {
        resolvers: [mockProvider({
          DB_URL: 'postgres://localhost:5432/db',
          CACHE_URL: 'redis://localhost:6379',
          API_URL: 'https://api.example.com'
        })]
      });

      expect(config.DB_URL).toBe('postgres://localhost:5432/db');
      expect(config.CACHE_URL).toBe('redis://localhost:6379');
      expect(config.API_URL).toBe('https://api.example.com');
    });

    it('rejects invalid connection strings synchronously', () => {
      expect(() => resolveSync({
        DB_URL: 'postgres'
      }, { resolvers: [mockProvider({ DB_URL: 'http://localhost' })] })).toThrow(/Invalid PostgreSQL URL/);
    });
  });

  describe('edge cases', () => {
    it('handles optional connection strings', async () => {
      const config = await resolve({
        DB_URL: 'postgres?',
        CACHE_URL: 'redis?'
      }, { resolvers: [mockProvider({})] });

      expect(config.DB_URL).toBeUndefined();
      expect(config.CACHE_URL).toBeUndefined();
    });

    it('handles connection strings with defaults', async () => {
      const config = await resolve({
        DB_URL: 'postgres:postgres://localhost:5432/defaultdb'
      }, { resolvers: [mockProvider({})] });

      expect(config.DB_URL).toBe('postgres://localhost:5432/defaultdb');
    });

    it('validates malformed URLs', async () => {
      await expect(resolve({
        DB_URL: 'postgres'
      }, { resolvers: [mockProvider({ DB_URL: 'postgres://host with spaces' })] })).rejects.toThrow(/Invalid PostgreSQL URL/);
    });

    it('handles empty protocol part', async () => {
      await expect(resolve({
        DB_URL: 'postgres'
      }, { resolvers: [mockProvider({ DB_URL: 'not-a-url' })] })).rejects.toThrow(/Invalid PostgreSQL URL/);
    });
  });

  describe('Date and Timestamp Types', () => {
    describe('date', () => {
      it('validates ISO 8601 date (YYYY-MM-DD)', async () => {
        const config = await resolve({
          EXPIRY_DATE: 'date'
        }, { resolvers: [mockProvider({ EXPIRY_DATE: '2025-12-31' })] });
        expect(config.EXPIRY_DATE).toBe('2025-12-31');
      });

      it('validates ISO 8601 datetime with time', async () => {
        const config = await resolve({
          CREATED_AT: 'date'
        }, { resolvers: [mockProvider({ CREATED_AT: '2025-10-02T14:30:00Z' })] });
        expect(config.CREATED_AT).toBe('2025-10-02T14:30:00Z');
      });

      it('validates ISO 8601 datetime with milliseconds', async () => {
        const config = await resolve({
          UPDATED_AT: 'date'
        }, { resolvers: [mockProvider({ UPDATED_AT: '2025-10-02T14:30:00.123Z' })] });
        expect(config.UPDATED_AT).toBe('2025-10-02T14:30:00.123Z');
      });

      it('supports required date with !', async () => {
        await expect(resolve({
          REQUIRED_DATE: 'date!'
        }, { resolvers: [mockProvider({})] })).rejects.toThrow(/Missing required environment variable/);
      });

      it('supports optional date with ?', async () => {
        const config = await resolve({
          OPTIONAL_DATE: 'date?'
        }, { resolvers: [mockProvider({})] });
        expect(config.OPTIONAL_DATE).toBeUndefined();
      });

      it('supports default date', async () => {
        const config = await resolve({
          TRIAL_END: 'date:2025-12-31'
        }, { resolvers: [mockProvider({})] });
        expect(config.TRIAL_END).toBe('2025-12-31');
      });

      it('throws on invalid date format', async () => {
        await expect(resolve({
          BAD_DATE: 'date'
        }, { resolvers: [mockProvider({ BAD_DATE: '12/31/2025' })] })).rejects.toThrow(/Date must be in ISO 8601 format/);
      });

      it('throws on invalid date value', async () => {
        await expect(resolve({
          BAD_DATE: 'date'
        }, { resolvers: [mockProvider({ BAD_DATE: '2025-13-32' })] })).rejects.toThrow(/cannot parse date value/);
      });

      it('throws on non-date string', async () => {
        await expect(resolve({
          BAD_DATE: 'date'
        }, { resolvers: [mockProvider({ BAD_DATE: 'not-a-date' })] })).rejects.toThrow(/cannot parse date value/);
      });
    });

    describe('timestamp', () => {
      it('validates Unix timestamp', async () => {
        const config = await resolve({
          SESSION_EXPIRES: 'timestamp'
        }, { resolvers: [mockProvider({ SESSION_EXPIRES: '1735689600' })] });
        expect(config.SESSION_EXPIRES).toBe(1735689600);
      });

      it('validates timestamp 0 (epoch)', async () => {
        const config = await resolve({
          EPOCH: 'timestamp'
        }, { resolvers: [mockProvider({ EPOCH: '0' })] });
        expect(config.EPOCH).toBe(0);
      });

      it('validates large timestamp', async () => {
        const config = await resolve({
          FAR_FUTURE: 'timestamp'
        }, { resolvers: [mockProvider({ FAR_FUTURE: '253402300799' })] }); // Year 9999
        expect(config.FAR_FUTURE).toBe(253402300799);
      });

      it('supports required timestamp with !', async () => {
        await expect(resolve({
          REQUIRED_TS: 'timestamp!'
        }, { resolvers: [mockProvider({})] })).rejects.toThrow(/Missing required environment variable/);
      });

      it('supports optional timestamp with ?', async () => {
        const config = await resolve({
          OPTIONAL_TS: 'timestamp?'
        }, { resolvers: [mockProvider({})] });
        expect(config.OPTIONAL_TS).toBeUndefined();
      });

      it('supports default timestamp', async () => {
        const config = await resolve({
          TIMEOUT: 'timestamp:1735689600'
        }, { resolvers: [mockProvider({})] });
        expect(config.TIMEOUT).toBe(1735689600);
      });

      it('throws on negative timestamp', async () => {
        await expect(resolve({
          BAD_TS: 'timestamp'
        }, { resolvers: [mockProvider({ BAD_TS: '-1' })] })).rejects.toThrow(/Invalid timestamp/);
      });

      it('throws on timestamp too large', async () => {
        await expect(resolve({
          BAD_TS: 'timestamp'
        }, { resolvers: [mockProvider({ BAD_TS: '999999999999' })] })).rejects.toThrow(/Timestamp too large/);
      });

      it('throws on non-numeric timestamp', async () => {
        await expect(resolve({
          BAD_TS: 'timestamp'
        }, { resolvers: [mockProvider({ BAD_TS: 'not-a-number' })] })).rejects.toThrow(/Invalid timestamp/);
      });

      it('throws on decimal timestamp', async () => {
        await expect(resolve({
          BAD_TS: 'timestamp'
        }, { resolvers: [mockProvider({ BAD_TS: '1735689600.5' })] })).rejects.toThrow(/Invalid timestamp/);
      });
    });
  });

  describe('resolve.with() tuple API', () => {
    it('resolves with single provider tuple', async () => {
      const provider1 = mockProvider({ FOO: 'bar', PORT: '3000' });

      const config = await resolve.with(
        [provider1, { FOO: 'string', PORT: 'number' }]
      );

      expect(config.FOO).toBe('bar');
      expect(config.PORT).toBe(3000);
    });

    it('merges multiple provider tuples with last-wins', async () => {
      const provider1 = mockProvider({ FOO: 'first', BAR: '100' });
      const provider2 = mockProvider({ FOO: 'second', QUX: 'value' });

      const config = await resolve.with(
        [provider1, { FOO: 'string', BAR: 'number' }],
        [provider2, { FOO: 'string', QUX: 'string' }]
      );

      expect(config.FOO).toBe('second'); // Last provider wins
      expect(config.BAR).toBe(100);      // From first provider
      expect(config.QUX).toBe('value');  // From second provider
    });

    it('supports options as last argument', async () => {
      const provider1 = mockProvider({ REQUIRED: 'value' });

      const config = await resolve.with(
        [provider1, { REQUIRED: 'string', OPTIONAL: 'string?' }],
        { strict: true }
      );

      expect(config.REQUIRED).toBe('value');
      expect(config.OPTIONAL).toBeUndefined();
    });
  });

  describe('resolveSync.with() tuple API', () => {
    it('resolves synchronously with tuples', () => {
      const provider1 = mockProvider({ FOO: 'bar' });

      const config = resolveSync.with(
        [provider1, { FOO: 'string' }]
      );

      expect(config.FOO).toBe('bar');
    });

    it('merges multiple resolvers with last-wins', () => {
      const provider1 = mockProvider({ FOO: 'first' });
      const provider2 = mockProvider({ FOO: 'second', BAR: '42' });

      const config = resolveSync.with(
        [provider1, { FOO: 'string' }],
        [provider2, { FOO: 'string', BAR: 'number' }]
      );

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

      const config = await resolve({
        CUSTOM_PORT: positiveNumber,
        CUSTOM_NAME: uppercaseString,
        REGULAR_URL: 'url'  // Mix with built-in validators
      }, {
        resolvers: [mockProvider({
          CUSTOM_PORT: '8080',
          CUSTOM_NAME: 'hello',
          REGULAR_URL: 'https://example.com'
        })]
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

      const config = await resolve({
        USER_DATA: customValidator
      }, {
        resolvers: [mockProvider({
          USER_DATA: '123:john'
        })]
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

      await expect(resolve({
        SCORE: strictNumber
      }, {
        resolvers: [mockProvider({
          SCORE: '150'  // Invalid: too high
        })]
      })).rejects.toThrow('Number must be between 0 and 100');

      await expect(resolve({
        SCORE: strictNumber
      }, {
        resolvers: [mockProvider({
          SCORE: 'invalid'  // Invalid: not a number
        })]
      })).rejects.toThrow('Invalid number format');
    });

    it('should work with synchronous resolve', () => {
      const customValidator = (value: string): boolean => {
        return value.toLowerCase() === 'true';
      };

      const config = resolveSync({
        ENABLED: customValidator
      }, {
        resolvers: [mockProvider({
          ENABLED: 'true'
        })]
      });

      expect(config.ENABLED).toBe(true);
    });

    it('should work with provider composition', async () => {
      const customValidator = (value: string): string[] => {
        return value.split(',').map(s => s.trim());
      };

      const config = await resolve.with(
        [mockProvider({ TAGS: 'react,typescript,node' }), {
          TAGS: customValidator
        }]
      );

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

      const config = await resolve({
        APP_CONFIG: configValidator,
        PORT: 3000  // Mix with default values
      }, {
        resolvers: [mockProvider({
          APP_CONFIG: '{"theme": "dark", "size": "16"}'
        })]
      });

      expect(config.APP_CONFIG).toEqual({ theme: 'dark', size: 16 });
      expect(config.PORT).toBe(3000);
    });
  });
});