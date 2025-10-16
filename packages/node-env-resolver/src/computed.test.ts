import { describe, it, expect } from 'vitest';
import { withComputed } from './utils';
import { resolve } from './index';
import { oneOf, number, string } from './validators';

describe('withComputed utility', () => {
  describe('basic functionality', () => {
    it('should add computed properties to config', () => {
      const config = { HOST: 'localhost', PORT: 3000 };
      
      const result = withComputed(config, {
        url: (c) => `http://${c.HOST}:${c.PORT}`,
      });
      
      expect(result.url).toBe('http://localhost:3000');
      expect(result.HOST).toBe('localhost');
      expect(result.PORT).toBe(3000);
    });

    it('should support multiple computed properties', () => {
      const config = {
        HOST: 'localhost',
        PORT: 3000,
        NODE_ENV: 'development'
      };
      
      const result = withComputed(config, {
        url: (c) => `http://${c.HOST}:${c.PORT}`,
        isDev: (c) => c.NODE_ENV === 'development',
        isProd: (c) => c.NODE_ENV === 'production',
        isSecure: (c) => c.HOST !== 'localhost'
      });
      
      expect(result.url).toBe('http://localhost:3000');
      expect(result.isDev).toBe(true);
      expect(result.isProd).toBe(false);
      expect(result.isSecure).toBe(false);
    });

    it('should compute values lazily using getters', () => {
      let computeCount = 0;
      const config = { value: 10 };
      
      const result = withComputed(config, {
        doubled: (c) => {
          computeCount++;
          return c.value * 2;
        }
      });
      
      expect(computeCount).toBe(0); // Not computed yet
      
      expect(result.doubled).toBe(20);
      expect(computeCount).toBe(1);
      
      expect(result.doubled).toBe(20);
      expect(computeCount).toBe(2); // Computed again (getters don't cache)
    });
  });

  describe('type inference', () => {
    it('should infer correct types for computed properties', () => {
      const config = {
        PORT: 3000,
        HOST: 'localhost',
        ENABLED: true
      };
      
      const result = withComputed(config, {
        url: (c) => `http://${c.HOST}:${c.PORT}`,
        portString: (c) => c.PORT.toString(),
        isReady: (c) => c.ENABLED && c.PORT > 0
      });
      
      // TypeScript should infer these types
      const url: string = result.url;
      const portString: string = result.portString;
      const isReady: boolean = result.isReady;
      
      expect(url).toBe('http://localhost:3000');
      expect(portString).toBe('3000');
      expect(isReady).toBe(true);
    });
  });

  describe('integration with resolve', () => {
    it('should work with resolve() output', () => {
      process.env.HOST = 'api.example.com';
      process.env.PORT = '443';
      process.env.NODE_ENV = 'production';
      
      const config = resolve({
        HOST: string(),
        PORT: number(),
        NODE_ENV: oneOf(['development', 'production', 'test'])
      });
      
      const configWithComputed = withComputed(config, {
        url: (c) => `https://${c.HOST}:${c.PORT}`,
        isDev: (c) => c.NODE_ENV === 'development',
        isProd: (c) => c.NODE_ENV === 'production'
      });
      
      expect(configWithComputed.url).toBe('https://api.example.com:443');
      expect(configWithComputed.isDev).toBe(false);
      expect(configWithComputed.isProd).toBe(true);
      
      delete process.env.HOST;
      delete process.env.PORT;
      delete process.env.NODE_ENV;
    });

    it('should handle optional fields in computed properties', () => {
      process.env.HOST = 'localhost';
      process.env.PORT = '3000';
      
      const config = resolve({
        HOST: string(),
        PORT: number(),
        BASE_PATH: string({optional:true})
      });
      
      const result = withComputed(config, {
        url: (c) => {
          const base = `http://${c.HOST}:${c.PORT}`;
          return c.BASE_PATH ? `${base}${c.BASE_PATH}` : base;
        }
      });
      
      expect(result.url).toBe('http://localhost:3000');
      
      delete process.env.HOST;
      delete process.env.PORT;
    });
  });

  describe('real-world use cases', () => {
    it('should build database connection objects', () => {
      const config = {
        DB_HOST: 'localhost',
        DB_PORT: 5432,
        DB_USER: 'admin',
        DB_PASSWORD: 'secret',
        DB_NAME: 'myapp'
      };
      
      const result = withComputed(config, {
        databaseUrl: (c) => 
          `postgres://${c.DB_USER}:${c.DB_PASSWORD}@${c.DB_HOST}:${c.DB_PORT}/${c.DB_NAME}`,
        connectionConfig: (c) => ({
          host: c.DB_HOST,
          port: c.DB_PORT,
          user: c.DB_USER,
          password: c.DB_PASSWORD,
          database: c.DB_NAME
        })
      });
      
      expect(result.databaseUrl).toBe('postgres://admin:secret@localhost:5432/myapp');
      expect(result.connectionConfig).toEqual({
        host: 'localhost',
        port: 5432,
        user: 'admin',
        password: 'secret',
        database: 'myapp'
      });
    });

    it('should compute feature flags', () => {
      const config = {
        NODE_ENV: 'development',
        ENABLE_ANALYTICS: false,
        ENABLE_CACHING: true,
        CACHE_TTL: 300
      };
      
      const result = withComputed(config, {
        features: (c) => ({
          analytics: c.ENABLE_ANALYTICS,
          caching: c.ENABLE_CACHING,
          debug: c.NODE_ENV === 'development'
        }),
        cacheConfig: (c) => c.ENABLE_CACHING ? {
          enabled: true,
          ttl: c.CACHE_TTL
        } : {
          enabled: false
        }
      });
      
      expect(result.features).toEqual({
        analytics: false,
        caching: true,
        debug: true
      });
      expect(result.cacheConfig).toEqual({
        enabled: true,
        ttl: 300
      });
    });

    it('should derive API endpoints from base URL', () => {
      const config = {
        API_BASE_URL: 'https://api.example.com',
        API_VERSION: 'v1'
      };
      
      const result = withComputed(config, {
        endpoints: (c) => ({
          users: `${c.API_BASE_URL}/${c.API_VERSION}/users`,
          posts: `${c.API_BASE_URL}/${c.API_VERSION}/posts`,
          auth: `${c.API_BASE_URL}/${c.API_VERSION}/auth`
        })
      });
      
      expect(result.endpoints).toEqual({
        users: 'https://api.example.com/v1/users',
        posts: 'https://api.example.com/v1/posts',
        auth: 'https://api.example.com/v1/auth'
      });
    });

    it('should compute environment-specific settings', () => {
      const config = {
        NODE_ENV: 'production',
        LOG_LEVEL: 'info'
      };
      
      const result = withComputed(config, {
        isProduction: (c) => c.NODE_ENV === 'production',
        isDevelopment: (c) => c.NODE_ENV === 'development',
        shouldLogDebug: (c) => c.LOG_LEVEL === 'debug' || c.NODE_ENV === 'development',
        loggerConfig: (c) => ({
          level: c.LOG_LEVEL,
          pretty: c.NODE_ENV !== 'production',
          timestamp: c.NODE_ENV === 'production'
        })
      });
      
      expect(result.isProduction).toBe(true);
      expect(result.isDevelopment).toBe(false);
      expect(result.shouldLogDebug).toBe(false);
      expect(result.loggerConfig).toEqual({
        level: 'info',
        pretty: false,
        timestamp: true
      });
    });
  });

  describe('enumerable properties', () => {
    it('should make computed properties enumerable', () => {
      const config = { HOST: 'localhost', PORT: 3000 };
      
      const result = withComputed(config, {
        url: (c) => `http://${c.HOST}:${c.PORT}`,
      });
      
      const keys = Object.keys(result);
      expect(keys).toContain('HOST');
      expect(keys).toContain('PORT');
      expect(keys).toContain('url');
    });

    it('should allow spreading computed config', () => {
      const config = { HOST: 'localhost', PORT: 3000 };
      
      const result = withComputed(config, {
        url: (c) => `http://${c.HOST}:${c.PORT}`,
      });
      
      const spread = { ...result };
      expect(spread.HOST).toBe('localhost');
      expect(spread.PORT).toBe(3000);
      expect(spread.url).toBe('http://localhost:3000');
    });
  });
});


