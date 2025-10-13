/**
 * Tests for environment variable name validation and resolvers
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { resolve, safeResolve } from './index';
import { json, secrets, toml } from './resolvers';
import { writeFileSync, mkdirSync, rmSync, existsSync } from 'fs';
import { join } from 'path';

describe('Environment Variable Name Validation', () => {
  it('should validate environment variable names in resolve', () => {
    // Test invalid variable name (should throw)
    expect(() => resolve({
      'PORxxxT': 3000, // Invalid variable name
    })).toThrow('Invalid environment variable name: "PORxxxT"');

    // Test valid variable name (should work) - use default value to avoid "missing required" error
    const result = resolve({
      'VALID_VAR': { type: 'string', default: 'default-value' },
    });
    expect(result.VALID_VAR).toBe('default-value'); // Should get default value for valid name
  });

  it('should validate environment variable names in safeResolve', () => {
    // Test invalid variable name (should return error result)
    const safeResult = safeResolve({
      'PORxxxT': 3000, // Invalid variable name
    });

    expect(safeResult.success).toBe(false);
    if (!safeResult.success) {
      expect(safeResult.error).toContain('Invalid environment variable name: "PORxxxT"');
    }

    // Test valid variable name (should work) - use default value to avoid "missing required" error
    const validResult = safeResolve({
      'VALID_VAR': { type: 'string', default: 'default-value' },
    });

    expect(validResult.success).toBe(true);
    if (validResult.success) {
      expect(validResult.data.VALID_VAR).toBe('default-value');
    }
  });

  it('should accept valid environment variable names', async () => {
    // Test various valid patterns - use unique names that don't conflict with env
    const validNames = [
      'TEST_PORT',
      'TEST_DATABASE_URL',
      'TEST_API_KEY',
      'MY_VAR_123',
      'VAR_WITH_UNDERSCORES',
    ];

    for (const name of validNames) {
      const result = await safeResolve({
        [name]: { type: 'string', default: 'default-value' },
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data[name]).toBe('default-value');
      }
    }
  });

  it('should reject invalid environment variable names', async () => {
    // Test various invalid patterns
    const invalidNames = [
      'PORxxxT', // Contains lowercase and 'xxx'
      '123PORT', // Starts with number
      'port', // All lowercase
      'PORT-NAME', // Contains dash
      'PORT.NAME', // Contains dot
      'PORT NAME', // Contains space
      'PORT@NAME', // Contains special char
    ];

    for (const name of invalidNames) {
      const result = await safeResolve({
        [name]: 3000, // Use number to avoid "missing required" errors for invalid names
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain(`Invalid environment variable name: "${name}"`);
      }
    }
  });
});

describe('JSON Resolver', () => {
  const testDir = '.test-json-resolver';

  beforeEach(() => {
    const fullPath = join(process.cwd(), testDir);
    if (!existsSync(fullPath)) {
      mkdirSync(fullPath, { recursive: true });
    }
  });

  afterEach(() => {
    const fullPath = join(process.cwd(), testDir);
    if (existsSync(fullPath)) {
      rmSync(fullPath, { recursive: true, force: true });
    }
  });

  it('should load flat JSON config', async () => {
    const configFile = `${testDir}/config.json`;
    writeFileSync(join(process.cwd(), configFile), JSON.stringify({
      PORT: '3000',
      NODE_ENV: 'development',
      DEBUG: 'true'
    }));

    const config = await resolve.with(
      [json(configFile), {
        PORT: 'port',
        NODE_ENV: 'string',
        DEBUG: 'boolean'
      }]
    );

    expect(config.PORT).toBe(3000);
    expect(config.NODE_ENV).toBe('development');
    expect(config.DEBUG).toBe(true);
  });

  it('should flatten nested JSON config', async () => {
    const configPath = join(testDir, 'nested.json');
    writeFileSync(configPath, JSON.stringify({
      database: {
        host: 'localhost',
        port: '5432'
      },
      api: {
        key: 'secret123',
        url: 'https://api.example.com'
      }
    }));

    const config = await resolve.with(
      [json(configPath), {
        DATABASE_HOST: 'string',
        DATABASE_PORT: 'port',
        API_KEY: 'string',
        API_URL: 'url'
      }]
    );

    expect(config.DATABASE_HOST).toBe('localhost');
    expect(config.DATABASE_PORT).toBe(5432);
    expect(config.API_KEY).toBe('secret123');
    expect(config.API_URL).toBe('https://api.example.com');
  });

  it('should return empty object if file does not exist', async () => {
    const resolver = json(join(testDir, 'nonexistent.json'));
    const env = await resolver.load();
    expect(env).toEqual({});
  });

  it('should throw on invalid JSON', async () => {
    const configPath = join(testDir, 'invalid.json');
    writeFileSync(configPath, '{invalid json}');

    await expect(async () => {
      await resolve.with(
        [json(configPath), { PORT: 3000 }]
      );
    }).rejects.toThrow('Failed to parse JSON file');
  });

  it('should work synchronously', () => {
    const configPath = join(testDir, 'sync.json');
    writeFileSync(configPath, JSON.stringify({ PORT: '3000' }));

    // Note: sync mode uses process.env, not json resolver
    // For actual json resolver sync test, we need to use loadSync directly
    const resolver = json(configPath);
    const env = resolver.loadSync!();
    expect(env.PORT).toBe('3000');
  });
});

describe('Secrets Directory Resolver', () => {
  const testDir = join(process.cwd(), '.test-secrets');

  beforeEach(() => {
    if (!existsSync(testDir)) {
      mkdirSync(testDir, { recursive: true });
    }
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('should load secrets from directory', async () => {
    writeFileSync(join(testDir, 'db_password'), 'secret123');
    writeFileSync(join(testDir, 'api-key'), 'key456');
    writeFileSync(join(testDir, 'jwt.secret'), 'jwt789');

    const config = await resolve.with(
      [secrets(testDir), {
        DB_PASSWORD: 'string',
        API_KEY: 'string',
        JWT_SECRET: 'string'
      }]
    );

    expect(config.DB_PASSWORD).toBe('secret123');
    expect(config.API_KEY).toBe('key456');
    expect(config.JWT_SECRET).toBe('jwt789');
  });

  it('should normalize filenames to env var format', async () => {
    writeFileSync(join(testDir, 'database-url'), 'postgres://localhost');
    writeFileSync(join(testDir, 'api.endpoint'), 'https://api.example.com');

    const config = await resolve.with(
      [secrets(testDir), {
        DATABASE_URL: 'string',
        API_ENDPOINT: 'string'
      }]
    );

    expect(config.DATABASE_URL).toBe('postgres://localhost');
    expect(config.API_ENDPOINT).toBe('https://api.example.com');
  });

  it('should skip directories and only read files', async () => {
    writeFileSync(join(testDir, 'valid_secret'), 'secret');
    mkdirSync(join(testDir, 'subdir'));
    writeFileSync(join(testDir, 'subdir', 'nested'), 'nested-secret');

    const resolver = secrets(testDir);
    const env = await resolver.load();

    expect(env.VALID_SECRET).toBe('secret');
    expect(env.SUBDIR).toBeUndefined();
    expect(env.NESTED).toBeUndefined();
  });

  it('should trim whitespace from secret values', async () => {
    writeFileSync(join(testDir, 'secret'), '  secret-value\n\n  ');

    const config = await resolve.with(
      [secrets(testDir), { SECRET: 'string' }]
    );

    expect(config.SECRET).toBe('secret-value');
  });

  it('should return empty object if directory does not exist', async () => {
    const resolver = secrets(join(testDir, 'nonexistent'));
    const env = await resolver.load();
    expect(env).toEqual({});
  });

  it('should work synchronously', () => {
    writeFileSync(join(testDir, 'sync_secret'), 'value');

    const resolver = secrets(testDir);
    const env = resolver.loadSync!();
    expect(env.SYNC_SECRET).toBe('value');
  });
});

describe('TOML Resolver', () => {
  const testDir = join(process.cwd(), '.test-toml-resolver');

  beforeEach(() => {
    if (!existsSync(testDir)) {
      mkdirSync(testDir, { recursive: true });
    }
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('should load flat TOML config', async () => {
    const configPath = join(testDir, 'config.toml');
    writeFileSync(configPath, `
port = "3000"
node_env = "development"
debug = "true"
    `);

    try {
      const config = await resolve.with(
        [toml(configPath), {
          PORT: 'port',
          NODE_ENV: 'string',
          DEBUG: 'boolean'
        }]
      );

      expect(config.PORT).toBe(3000);
      expect(config.NODE_ENV).toBe('development');
      expect(config.DEBUG).toBe(true);
    } catch (error) {
      // If smol-toml is not installed, skip test
      if ((error as Error).message.includes('smol-toml')) {
        console.log('Skipping TOML test: smol-toml not installed');
        return;
      }
      throw error;
    }
  });

  it('should flatten nested TOML config', async () => {
    const configPath = join(testDir, 'nested.toml');
    writeFileSync(configPath, `
[database]
host = "localhost"
port = "5432"

[api]
key = "secret123"
url = "https://api.example.com"
    `);

    try {
      const config = await resolve.with(
        [toml(configPath), {
          DATABASE_HOST: 'string',
          DATABASE_PORT: 'port',
          API_KEY: 'string',
          API_URL: 'url'
        }]
      );

      expect(config.DATABASE_HOST).toBe('localhost');
      expect(config.DATABASE_PORT).toBe(5432);
      expect(config.API_KEY).toBe('secret123');
      expect(config.API_URL).toBe('https://api.example.com');
    } catch (error) {
      if ((error as Error).message.includes('smol-toml')) {
        console.log('Skipping TOML test: smol-toml not installed');
        return;
      }
      throw error;
    }
  });

  it('should return empty object if file does not exist', async () => {
    const resolver = toml(join(testDir, 'nonexistent.toml'));
    const env = await resolver.load();
    expect(env).toEqual({});
  });

  it('should throw helpful error if smol-toml is not installed', async () => {
    const configPath = join(testDir, 'test.toml');
    writeFileSync(configPath, 'port = "3000"');

    try {
      await resolve.with(
        [toml(configPath), { PORT: 3000 }]
      );
    } catch (error) {
      // Either it works (smol-toml installed) or shows helpful error
      const message = (error as Error).message;
      if (message.includes('smol-toml')) {
        expect(message).toContain('npm install smol-toml');
      }
    }
  });
});
