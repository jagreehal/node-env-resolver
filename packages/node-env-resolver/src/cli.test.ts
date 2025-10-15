import { describe, it, expect } from 'vitest';
import { cliArgs } from './cli';
import { resolve, processEnv, postgres, string, number } from './index';

describe('cliArgs resolver', () => {
  describe('basic functionality', () => {
    it('should parse --key value format', async () => {
      const resolver = cliArgs({
        argv: ['--port', '8080', '--host', 'localhost']
      });
      
      const result = resolver.load ? await resolver.load() : {};
      
      expect(result).toEqual({
        PORT: '8080',
        HOST: 'localhost'
      });
    });

    it('should parse --key=value format', async () => {
      const resolver = cliArgs({
        argv: ['--port=8080', '--host=localhost']
      });
      
      const result = resolver.load ? await resolver.load() : {};
      
      expect(result).toEqual({
        PORT: '8080',
        HOST: 'localhost'
      });
    });

    it('should parse boolean flags', async () => {
      const resolver = cliArgs({
        argv: ['--verbose', '--debug', '--port', '3000']
      });
      
      const result = resolver.load ? await resolver.load() : {};
      
      expect(result).toEqual({
        VERBOSE: 'true',
        DEBUG: 'true',
        PORT: '3000'
      });
    });

    it('should handle mixed formats', async () => {
      const resolver = cliArgs({
        argv: ['--port=8080', '--host', 'localhost', '--verbose']
      });
      
      const result = resolver.load ? await resolver.load() : {};
      
      expect(result).toEqual({
        PORT: '8080',
        HOST: 'localhost',
        VERBOSE: 'true'
      });
    });
  });

  describe('key normalization', () => {
    it('should convert kebab-case to SCREAMING_SNAKE_CASE by default', async () => {
      const resolver = cliArgs({
        argv: ['--database-url', '//localhost', '--api-key', 'secret-value']
      });
      
      const result = resolver.load ? await resolver.load() : {};
      
      expect(result).toEqual({
        DATABASE_URL: '//localhost',
        API_KEY: 'secret-value'
      });
    });

    it('should preserve original keys when normalizeKeys is false', async () => {
      const resolver = cliArgs({
        argv: ['--database-url', '//localhost'],
        normalizeKeys: false
      });
      
      const result = resolver.load ? await resolver.load() : {};
      
      expect(result).toEqual({
        'database-url': '//localhost'
      });
    });
  });

  describe('edge cases', () => {
    it('should ignore non-prefixed arguments', async () => {
      const resolver = cliArgs({
        argv: ['node', 'script.js', '--port', '3000', 'extra']
      });
      
      const result = resolver.load ? await resolver.load() : {};
      
      expect(result).toEqual({
        PORT: '3000'
      });
    });

    it('should handle empty argv', async () => {
      const resolver = cliArgs({
        argv: []
      });
      
      const result = resolver.load ? await resolver.load() : {};
      
      expect(result).toEqual({});
    });

    it('should handle custom prefix', async () => {
      const resolver = cliArgs({
        argv: ['-p', '8080', '-h', 'localhost'],
        prefix: '-'
      });
      
      const result = resolver.load ? await resolver.load() : {};
      
      expect(result).toEqual({
        P: '8080',
        H: 'localhost'
      });
    });

    it('should treat consecutive flags as booleans', async () => {
      const resolver = cliArgs({
        argv: ['--verbose', '--debug']
      });
      
      const result = resolver.load ? await resolver.load() : {};
      
      expect(result).toEqual({
        VERBOSE: 'true',
        DEBUG: 'true'
      });
    });
  });

  describe('sync loading', () => {
    it('should support loadSync', () => {
      const resolver = cliArgs({
        argv: ['--port', '8080', '--verbose']
      });
      
      const result = resolver.loadSync!();
      
      expect(result).toEqual({
        PORT: '8080',
        VERBOSE: 'true'
      });
    });
  });

  describe('integration with resolve', () => {
    it('should work with resolve.async() for CLI-based config', async () => {
      const config = await resolve.async(
        [cliArgs({
          argv: ['--port', '8080', '--database-url', 'postgres://localhost:5432/mydb', '--verbose']
        }), {
          PORT: 3000,
          DATABASE_URL: postgres(),
          VERBOSE: false
        }]
      );
      
      expect(config.PORT).toBe(8080);
      expect(config.DATABASE_URL).toBe('postgres://localhost:5432/mydb');
      expect(config.VERBOSE).toBe(true);
    });

    it('should handle optional CLI args', async () => {
      process.env.DATABASE_URL = 'postgres://localhost:5432/mydb';
      
      const config = await resolve.async(
        [processEnv(), {
          PORT: 3000,
          DATABASE_URL: postgres(),
          LOG_LEVEL: string({optional:true})
        }],
        [cliArgs({
          argv: ['--port', '8080']
        }), {
          PORT: 3000,
          DATABASE_URL: postgres(),
          LOG_LEVEL: string({optional:true})
        }]
      );
      
      expect(config.PORT).toBe(8080);
      expect(config.DATABASE_URL).toBe('postgres://localhost:5432/mydb');
      expect(config.LOG_LEVEL).toBeUndefined();
      
      delete process.env.DATABASE_URL;
    });

    it('should override process.env with CLI args when using priority: last', async () => {
      process.env.PORT = '3000';
      
      const config = await resolve.async(
        [cliArgs({
          argv: ['--port', '8080']
        }), {
          PORT: 3000
        }],
        { priority: 'last' }
      );
      
      expect(config.PORT).toBe(8080);
      
      delete process.env.PORT;
    });
  });

  describe('real-world CLI patterns', () => {
    it('should handle typical CLI app config', async () => {
      const config = await resolve.async(
        [cliArgs({
          argv: [
            '--config', './config.json',
            '--output', './dist',
            '--verbose',
            '--max-workers', '4'
          ]
        }), {
          CONFIG: string({optional:true}),
          OUTPUT: string({optional:true}),
          VERBOSE: false,
          MAX_WORKERS: number({ optional: true })
        }]
      );
      
      expect(config.CONFIG).toBe('./config.json');
      expect(config.OUTPUT).toBe('./dist');
      expect(config.VERBOSE).toBe(true);
      expect(config.MAX_WORKERS).toBe(4);
    });

    it('should handle database connection from CLI', async () => {
      const config = await resolve.async(
        [cliArgs({
          argv: [
            '--database-url', 'postgres://user:pass@localhost:5432/mydb',
            '--redis-url', 'redis://localhost:6379'
          ]
        }), {
          DATABASE_URL: postgres(),
          REDIS_URL: string({ optional: true, default: 'redis' })
        }]
      );
      
      expect(config.DATABASE_URL).toBe('postgres://user:pass@localhost:5432/mydb');
      expect(config.REDIS_URL).toBe('redis://localhost:6379');
    });
  });
});

