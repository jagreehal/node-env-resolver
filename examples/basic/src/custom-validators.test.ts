/**
 * Custom Validator Functions Examples
 * 
 * Demonstrates the infinite flexibility of custom validator functions
 * without needing external libraries like Zod.
 */

import { describe, it, expect } from 'vitest';
import { resolve } from 'node-env-resolver';
import { processEnv } from 'node-env-resolver';

// Helper to create mock provider
const mockProvider = (env: Record<string, string>) => ({
  name: 'mock',
  async load() { return env; },
  loadSync() { return env; }
});

describe('Custom Validator Functions', () => {
  describe('Basic Custom Validators', () => {
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

      const schema = {
        CUSTOM_PORT: positiveNumber,
        CUSTOM_NAME: uppercaseString,
        REGULAR_URL: 'url'  // Mix with built-in validators
      };

      const config = await resolve.with(
        [mockProvider({
          CUSTOM_PORT: '8080',
          CUSTOM_NAME: 'hello',
          REGULAR_URL: 'https://example.com'
        }), schema]
      );

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

      const schema = {
        USER_DATA: customValidator
      };

      const config = await resolve.with(
        [mockProvider({
          USER_DATA: '123:john'
        }), schema]
      );

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

      const schema = {
        SCORE: strictNumber
      };

      await expect(resolve.with(
        [mockProvider({
          SCORE: '150'  // Invalid: too high
        }), schema]
      )).rejects.toThrow('Number must be between 0 and 100');

      await expect(resolve.with(
        [mockProvider({
          SCORE: 'invalid'  // Invalid: not a number
        }), schema]
      )).rejects.toThrow('Invalid number format');
    });

    it('should work with synchronous resolve', async () => {
      const customValidator = (value: string): boolean => {
        return value.toLowerCase() === 'true';
      };

      const schema = {
        ENABLED: customValidator
      };

      const config = await resolve.with(
        [mockProvider({
          ENABLED: 'true'
        }), schema]
      );

      expect(config.ENABLED).toBe(true);
    });
  });

  describe('Advanced Custom Validators', () => {
    it('should handle complex object validation', async () => {
      const configValidator = (value: string): { host: string; port: number; ssl: boolean } => {
        try {
          const parsed = JSON.parse(value);
          if (!parsed.host || typeof parsed.host !== 'string') {
            throw new Error('host is required and must be a string');
          }
          if (!parsed.port || typeof parsed.port !== 'number') {
            throw new Error('port is required and must be a number');
          }
          if (typeof parsed.ssl !== 'boolean') {
            throw new Error('ssl must be a boolean');
          }
          return parsed;
        } catch (error) {
          throw new Error(`Invalid config JSON: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      };

      const schema = {
        APP_CONFIG: configValidator
      };

      const config = await resolve.with(
        [mockProvider({
          APP_CONFIG: '{"host": "localhost", "port": 5432, "ssl": true}'
        }), schema]
      );

      expect(config.APP_CONFIG).toEqual({ host: 'localhost', port: 5432, ssl: true });
    });

    it('should handle array validation and transformation', async () => {
      const tagsValidator = (value: string): string[] => {
        const tags = value.split(',').map(tag => tag.trim()).filter(tag => tag.length > 0);
        if (tags.length === 0) {
          throw new Error('At least one tag is required');
        }
        if (tags.length > 10) {
          throw new Error('Maximum 10 tags allowed');
        }
        return tags;
      };

      const schema = {
        TAGS: tagsValidator
      };

      const config = await resolve.with(
        [mockProvider({
          TAGS: 'react,typescript,node,api'
        }), schema]
      );

      expect(config.TAGS).toEqual(['react', 'typescript', 'node', 'api']);
    });

    it('should handle enum-like validation with transformation', async () => {
      const environmentValidator = (value: string): 'development' | 'staging' | 'production' => {
        const env = value.toLowerCase();
        if (!['development', 'staging', 'production'].includes(env)) {
          throw new Error('Environment must be one of: development, staging, production');
        }
        return env as 'development' | 'staging' | 'production';
      };

      const schema = {
        ENVIRONMENT: environmentValidator
      };

      const config = await resolve.with(
        [mockProvider({
          ENVIRONMENT: 'PRODUCTION'  // Should be transformed to lowercase
        }), schema]
      );

      expect(config.ENVIRONMENT).toBe('production');
    });

    it('should handle complex business logic validation', async () => {
      const apiKeyValidator = (value: string): { key: string; type: 'public' | 'private'; expires?: Date } => {
        if (!value.startsWith('sk_') && !value.startsWith('pk_')) {
          throw new Error('API key must start with sk_ or pk_');
        }
        
        const type = value.startsWith('sk_') ? 'private' : 'public';
        const key = value.slice(3); // Remove prefix
        
        if (key.length < 20) {
          throw new Error('API key must be at least 20 characters after prefix');
        }
        
        // For demo purposes, add expiration for private keys
        const expires = type === 'private' ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) : undefined;
        
        return { key, type, expires };
      };

      const schema = {
        API_KEY: apiKeyValidator
      };

      const config = await resolve.with(
        [mockProvider({
          API_KEY: 'sk_1234567890abcdef1234567890abcdef'
        }), schema]
      );

      expect(config.API_KEY.type).toBe('private');
      expect(config.API_KEY.key).toBe('1234567890abcdef1234567890abcdef');
      expect(config.API_KEY.expires).toBeInstanceOf(Date);
    });
  });

  describe('Integration with Built-in Features', () => {
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

    it('should work with processEnv provider', async () => {
      const portValidator = (value: string): number => {
        const port = parseInt(value, 10);
        if (isNaN(port) || port < 1 || port > 65535) {
          throw new Error('Port must be between 1 and 65535');
        }
        return port;
      };

      // Set environment variable
      process.env.CUSTOM_PORT = '8080';

      const schema = {
        CUSTOM_PORT: portValidator,
        NODE_ENV: 'string'
      };

      const config = await resolve.with(
        [processEnv(), schema]
      );

      expect(config.CUSTOM_PORT).toBe(8080);
      expect(config.NODE_ENV).toBe('test'); // Vitest sets NODE_ENV=test

      // Clean up
      delete process.env.CUSTOM_PORT;
    });

    it('should mix custom validators with built-in validators and defaults', async () => {
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

      const schema = {
        APP_CONFIG: configValidator,
        PORT: 3000,  // Mix with default values
        DATABASE_URL: 'url'  // Mix with built-in validators
      };

      const config = await resolve.with(
        [mockProvider({
          APP_CONFIG: '{"theme": "dark", "size": "16"}',
          DATABASE_URL: 'postgres://localhost:5432/mydb'
        }), schema]
      );

      expect(config.APP_CONFIG).toEqual({ theme: 'dark', size: 16 });
      expect(config.PORT).toBe(3000);
      expect(config.DATABASE_URL).toBe('postgres://localhost:5432/mydb');
    });
  });

  describe('Error Handling', () => {
    it('should provide helpful error messages', async () => {
      const emailValidator = (value: string): string => {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(value)) {
          throw new Error(`"${value}" is not a valid email address`);
        }
        return value.toLowerCase();
      };

      const schema = {
        EMAIL: emailValidator
      };

      await expect(resolve.with(
        [mockProvider({
          EMAIL: 'invalid-email'
        }), schema]
      )).rejects.toThrow('"invalid-email" is not a valid email address');
    });

    it('should handle multiple validation errors', async () => {
      const strictValidator = (value: string): number => {
        const num = parseFloat(value);
        if (isNaN(num)) {
          throw new Error('Must be a number');
        }
        if (num < 0) {
          throw new Error('Must be positive');
        }
        if (num > 1000) {
          throw new Error('Must be less than 1000');
        }
        return num;
      };

      const schema = {
        VALUE1: strictValidator,
        VALUE2: strictValidator
      };

      await expect(resolve.with(
        [mockProvider({
          VALUE1: 'invalid',
          VALUE2: '2000'
        }), schema]
      )).rejects.toThrow('Must be a number');
    });
  });

  describe('Real-world Examples', () => {
    it('should handle database connection string validation', async () => {
      const dbConnectionValidator = (value: string): { host: string; port: number; database: string; ssl: boolean } => {
        const url = new URL(value);
        if (!['postgres:', 'mysql:', 'mongodb:'].includes(url.protocol)) {
          throw new Error('Unsupported database protocol');
        }
        
        return {
          host: url.hostname,
          port: parseInt(url.port) || (url.protocol === 'postgres:' ? 5432 : 3306),
          database: url.pathname.slice(1),
          ssl: url.searchParams.get('ssl') === 'true'
        };
      };

      const schema = {
        DATABASE_CONNECTION: dbConnectionValidator
      };

      const config = await resolve.with(
        [mockProvider({
          DATABASE_CONNECTION: 'postgres://user:pass@localhost:5432/mydb?ssl=true'
        }), schema]
      );

      expect(config.DATABASE_CONNECTION).toEqual({
        host: 'localhost',
        port: 5432,
        database: 'mydb',
        ssl: true
      });
    });

    it('should handle JWT secret validation', async () => {
      const jwtSecretValidator = (value: string): string => {
        if (value.length < 32) {
          throw new Error('JWT secret must be at least 32 characters long');
        }
        if (value.length > 256) {
          throw new Error('JWT secret must be less than 256 characters');
        }
        // Check for common weak secrets
        if (['secret', 'password', '123456'].includes(value.toLowerCase())) {
          throw new Error('JWT secret is too weak');
        }
        return value;
      };

      const schema = {
        JWT_SECRET: jwtSecretValidator
      };

      const config = await resolve.with(
        [mockProvider({
          JWT_SECRET: 'super-secret-jwt-key-that-is-long-enough-and-secure'
        }), schema]
      );

      expect(config.JWT_SECRET).toBe('super-secret-jwt-key-that-is-long-enough-and-secure');
    });

    it('should handle feature flag validation', async () => {
      const featureFlagValidator = (value: string): { name: string; enabled: boolean; rollout?: number } => {
        const parts = value.split(':');
        if (parts.length < 2) {
          throw new Error('Feature flag must be in format "name:enabled" or "name:enabled:rollout"');
        }
        
        const [name, enabledStr, rolloutStr] = parts;
        const enabled = enabledStr === 'true';
        
        if (!enabled && enabledStr !== 'false') {
          throw new Error('Enabled must be "true" or "false"');
        }
        
        const rollout = rolloutStr ? parseInt(rolloutStr, 10) : undefined;
        if (rollout !== undefined && (isNaN(rollout) || rollout < 0 || rollout > 100)) {
          throw new Error('Rollout must be a number between 0 and 100');
        }
        
        return { name, enabled, rollout };
      };

      const schema = {
        FEATURE_FLAG: featureFlagValidator
      };

      const config = await resolve.with(
        [mockProvider({
          FEATURE_FLAG: 'new-ui:true:25'
        }), schema]
      );

      expect(config.FEATURE_FLAG).toEqual({
        name: 'new-ui',
        enabled: true,
        rollout: 25
      });
    });
  });
});
