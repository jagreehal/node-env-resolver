import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { resolve } from './index';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('Advanced Features', () => {
  let testDir: string;

  beforeEach(() => {
    // Create temp directory for file tests
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'env-test-'));
  });

  afterEach(() => {
    // Cleanup temp directory
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
    
    // Cleanup env vars
    delete process.env.TAGS;
    delete process.env.PORTS;
    delete process.env.URLS;
    delete process.env.TIMEOUT;
    delete process.env.CACHE_TTL;
    delete process.env.SECRET_PATH;
    delete process.env.API_KEY;
    delete process.env.ALLOWED_ORIGINS;
    delete process.env.DB_PASSWORD_FILE;
    delete process.env.API_KEY_FILE;
    delete process.env.SESSION_TIMEOUT;
    delete process.env.RETRY_BACKOFF;
    delete process.env.SECRET_FILE;
    delete process.env.FEATURE_FLAGS;
  });

  describe('Array support - string[]', () => {
    it('should parse comma-separated strings', () => {
      process.env.TAGS = 'tag1,tag2,tag3';
      
      const config = resolve({
        TAGS: 'string[]'
      });
      
      expect(config.TAGS).toEqual(['tag1', 'tag2', 'tag3']);
    });

    it('should trim whitespace from array items', () => {
      process.env.TAGS = 'tag1, tag2 , tag3';
      
      const config = resolve({
        TAGS: 'string[]'
      });
      
      expect(config.TAGS).toEqual(['tag1', 'tag2', 'tag3']);
    });

    it('should support custom separator', () => {
      process.env.TAGS = 'tag1|tag2|tag3';
      
      const config = resolve({
        TAGS: { type: 'string[]', separator: '|' }
      });
      
      expect(config.TAGS).toEqual(['tag1', 'tag2', 'tag3']);
    });

    it('should handle single value', () => {
      process.env.TAGS = 'single';
      
      const config = resolve({
        TAGS: 'string[]'
      });
      
      expect(config.TAGS).toEqual(['single']);
    });
  });

  describe('Array support - number[]', () => {
    it('should parse comma-separated numbers', () => {
      process.env.PORTS = '3000,8080,9000';
      
      const config = resolve({
        PORTS: 'number[]'
      });
      
      expect(config.PORTS).toEqual([3000, 8080, 9000]);
    });

    it('should trim whitespace and parse', () => {
      process.env.PORTS = '3000, 8080 , 9000';
      
      const config = resolve({
        PORTS: 'number[]'
      });
      
      expect(config.PORTS).toEqual([3000, 8080, 9000]);
    });

    it('should error on invalid number in array', () => {
      process.env.PORTS = '3000,invalid,9000';
      
      expect(() => resolve({
        PORTS: 'number[]'
      })).toThrow('Invalid number in array');
    });

    it('should support custom separator', () => {
      process.env.PORTS = '3000|8080|9000';
      
      const config = resolve({
        PORTS: { type: 'number[]', separator: '|' }
      });
      
      expect(config.PORTS).toEqual([3000, 8080, 9000]);
    });
  });

  describe('Array support - url[]', () => {
    it('should parse and validate multiple URLs', async () => {
      process.env.URLS = 'https://api.example.com,https://cdn.example.com,http://localhost:3000';
      
      const config = await resolve.with([
        { name: 'test', load: () => Promise.resolve(process.env as Record<string, string>) },
        {
          URLS: 'url[]'
        }
      ]);
      
      expect(config.URLS).toEqual([
        'https://api.example.com',
        'https://cdn.example.com',
        'http://localhost:3000'
      ]);
    });

    it('should error on invalid URL in array', async () => {
      process.env.URLS = 'https://valid.com,not-a-url,https://another.com';
      
      try {
        await resolve.with([
          { name: 'test', load: () => Promise.resolve(process.env as Record<string, string>) },
          {
            URLS: 'url[]'
          }
        ]);
        throw new Error('Should have thrown');
      } catch (error) {
        expect((error as Error).message).toContain('Invalid URL in array');
      }
    });
  });

  describe('Duration support', () => {
    it('should parse seconds', async () => {
      process.env.TIMEOUT = '5s';
      
      const config = await resolve.with([
        { name: 'test', load: () => Promise.resolve(process.env as Record<string, string>) },
        {
          TIMEOUT: 'duration'
        }
      ]);
      
      expect(config.TIMEOUT).toBe(5000);
    });

    it('should parse minutes', async () => {
      process.env.TIMEOUT = '2m';
      
      const config = await resolve.with([
        { name: 'test', load: () => Promise.resolve(process.env as Record<string, string>) },
        {
          TIMEOUT: 'duration'
        }
      ]);
      
      expect(config.TIMEOUT).toBe(120000);
    });

    it('should parse hours', async () => {
      process.env.TIMEOUT = '1h';
      
      const config = await resolve.with([
        { name: 'test', load: () => Promise.resolve(process.env as Record<string, string>) },
        {
          TIMEOUT: 'duration'
        }
      ]);
      
      expect(config.TIMEOUT).toBe(3600000);
    });
  });

  describe('File reading support', () => {
    it('should read secret from file', async () => {
      const secretFile = path.join(testDir, 'secret.txt');
      fs.writeFileSync(secretFile, 'my-secret-value');
      process.env.SECRET_PATH = secretFile;
      
      const config = await resolve.with([
        { name: 'test', load: () => Promise.resolve(process.env as Record<string, string>) },
        {
          SECRET_PATH: 'file'
        }
      ]);
      
      expect(config.SECRET_PATH).toBe('my-secret-value');
    });

    it('should trim whitespace from file content', async () => {
      const secretFile = path.join(testDir, 'secret.txt');
      fs.writeFileSync(secretFile, '  my-secret-value  \n');
      process.env.SECRET_PATH = secretFile;
      
      const config = await resolve.with([
        { name: 'test', load: () => Promise.resolve(process.env as Record<string, string>) },
        {
          SECRET_PATH: 'file'
        }
      ]);
      
      expect(config.SECRET_PATH).toBe('my-secret-value');
    });
  });

  describe('Empty string handling (secure by default)', () => {
    it('should reject empty string by default (secure)', () => {
      process.env.API_KEY = '';
      
      expect(() => resolve({
        API_KEY: 'string'
      })).toThrow('cannot be empty');
    });

    it('should treat empty as missing for optional fields', () => {
      process.env.API_KEY = '';
      
      const config = resolve({
        API_KEY: 'string?'
      });
      
      expect(config.API_KEY).toBeUndefined();
    });

    it('should use default when empty', () => {
      process.env.PORT = '';
      
      const config = resolve({
        PORT: 3000
      });
      
      expect(config.PORT).toBe(3000);
    });

    it('should allow empty strings when explicitly enabled', () => {
      process.env.ALLOW_EMPTY_FIELD = '';
      
      const config = resolve({
        ALLOW_EMPTY_FIELD: { type: 'string', allowEmpty: true }
      });
      
      expect(config.ALLOW_EMPTY_FIELD).toBe('');
    });

    it('should reject whitespace-only strings by default', () => {
      process.env.API_KEY = '   ';
      
      const config = resolve({
        API_KEY: 'string'
      });
      
      // Whitespace is preserved (not trimmed) but valid
      expect(config.API_KEY).toBe('   ');
    });
  });

  describe('Real-world patterns', () => {
    it('should handle feature flags as string array', () => {
      process.env.FEATURE_FLAGS = 'analytics,caching,monitoring';

      const config = resolve({
        FEATURE_FLAGS: 'string[]'
      });

      expect(config.FEATURE_FLAGS).toEqual(['analytics', 'caching', 'monitoring']);
    });

    it('should handle Docker/K8s secrets from files', async () => {
      const secretsDir = path.join(testDir, 'secrets');
      fs.mkdirSync(secretsDir, { recursive: true });

      fs.writeFileSync(path.join(secretsDir, 'db_password'), 'super-secret-password');
      fs.writeFileSync(path.join(secretsDir, 'api_key'), 'api-key-value');

      process.env.DB_PASSWORD_FILE = path.join(secretsDir, 'db_password');
      process.env.API_KEY_FILE = path.join(secretsDir, 'api_key');

      const config = await resolve.with([
        { name: 'test', load: () => Promise.resolve(process.env as Record<string, string>) },
        {
          DB_PASSWORD_FILE: 'file',
          API_KEY_FILE: 'file'
        }
      ]);

      expect(config.DB_PASSWORD_FILE).toBe('super-secret-password');
      expect(config.API_KEY_FILE).toBe('api-key-value');
    });
  });

  describe('SecretsDir support', () => {
    it('should read from secretsDir when no env var provided (global option)', async () => {
      const secretsDir = path.join(testDir, 'secrets');
      fs.mkdirSync(secretsDir, { recursive: true });
      fs.writeFileSync(path.join(secretsDir, 'db-password'), 'password-from-secrets-dir');

      const config = await resolve.with([
        { name: 'test', load: () => Promise.resolve({}) },
        {
          DB_PASSWORD: 'file'
        }
      ], { secretsDir });

      expect(config.DB_PASSWORD).toBe('password-from-secrets-dir');
    });

    it('should read from secretsDir when no env var provided (per-field option)', async () => {
      const secretsDir = path.join(testDir, 'secrets');
      fs.mkdirSync(secretsDir, { recursive: true });
      fs.writeFileSync(path.join(secretsDir, 'api-key'), 'api-key-from-secrets-dir');

      const config = await resolve.with([
        { name: 'test', load: () => Promise.resolve({}) },
        {
          API_KEY: { type: 'file', secretsDir }
        }
      ]);

      expect(config.API_KEY).toBe('api-key-from-secrets-dir');
    });

    it('should prefer env var path over secretsDir', async () => {
      const secretsDir = path.join(testDir, 'secrets');
      fs.mkdirSync(secretsDir, { recursive: true });
      fs.writeFileSync(path.join(secretsDir, 'db-password-file'), 'password-from-secrets-dir');

      const customFile = path.join(testDir, 'custom.txt');
      fs.writeFileSync(customFile, 'custom-password');

      process.env.DB_PASSWORD_FILE = customFile;

      const config = await resolve.with([
        { name: 'test', load: () => Promise.resolve(process.env as Record<string, string>) },
        {
          DB_PASSWORD_FILE: 'file'
        }
      ], { secretsDir });

      expect(config.DB_PASSWORD_FILE).toBe('custom-password');
    });

    it('should error when no path provided and no secretsDir configured', async () => {
      try {
        await resolve.with([
          { name: 'test', load: () => Promise.resolve({}) },
          {
            DB_PASSWORD: 'file'
          }
        ]);
        throw new Error('Should have thrown');
      } catch (error) {
        expect((error as Error).message).toContain('Missing required environment variable: DB_PASSWORD');
      }
    });

    it('should use per-field secretsDir over global secretsDir', async () => {
      const globalSecretsDir = path.join(testDir, 'secrets-global');
      const fieldSecretsDir = path.join(testDir, 'secrets-field');
      fs.mkdirSync(globalSecretsDir, { recursive: true });
      fs.mkdirSync(fieldSecretsDir, { recursive: true });

      fs.writeFileSync(path.join(globalSecretsDir, 'api-key'), 'global-key');
      fs.writeFileSync(path.join(fieldSecretsDir, 'api-key'), 'field-key');

      const config = await resolve.with([
        { name: 'test', load: () => Promise.resolve({}) },
        {
          API_KEY: { type: 'file', secretsDir: fieldSecretsDir }
        }
      ], { secretsDir: globalSecretsDir });

      expect(config.API_KEY).toBe('field-key');
    });

    it('should convert SCREAMING_SNAKE_CASE to kebab-case for K8s', async () => {
      const secretsDir = path.join(testDir, 'secrets');
      fs.mkdirSync(secretsDir, { recursive: true });
      fs.writeFileSync(path.join(secretsDir, 'my-secret-key'), 'kebab-case-file-name');

      const config = await resolve.with([
        { name: 'test', load: () => Promise.resolve({}) },
        {
          MY_SECRET_KEY: 'file'
        }
      ], { secretsDir });

      expect(config.MY_SECRET_KEY).toBe('kebab-case-file-name');
    });
  });
});
