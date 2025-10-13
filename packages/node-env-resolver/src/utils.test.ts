import { describe, it, expect, vi } from 'vitest';
import { cached, retry, TTL, awsCache, withPrefix, withAliases } from './utils';
import type { Resolver } from './types';
describe('resolvers', () => {
  // Removed tests for deprecated dotenvExpand

  describe('cached', () => {
    it('should cache provider results', async () => {
      const mockLoad = vi.fn().mockResolvedValue({ TEST: 'value' });
      const mockProvider = {
        name: 'test-provider',
        load: mockLoad,
      };

      const cachedProvider = cached(mockProvider, { ttl: 1000 });
      
      // First call
      const result1 = await cachedProvider.load();
      expect(result1).toEqual({ TEST: 'value' });
      expect(mockLoad).toHaveBeenCalledTimes(1);

      // Second call should use cache
      const result2 = await cachedProvider.load();
      expect(result2).toEqual({ TEST: 'value' });
      expect(mockLoad).toHaveBeenCalledTimes(1);

      expect(cachedProvider.name).toBe('cached(test-provider)');
    });

    it('should refresh cache after TTL expires', async () => {
      const mockLoad = vi.fn()
        .mockResolvedValueOnce({ TEST: 'value1' })
        .mockResolvedValueOnce({ TEST: 'value2' });
      
      const mockProvider = {
        name: 'test-provider',
        load: mockLoad,
      };

      const cachedProvider = cached(mockProvider, { ttl: 10 }); // 10ms TTL
      
      const result1 = await cachedProvider.load();
      expect(result1).toEqual({ TEST: 'value1' });
      
      // Wait for TTL to expire
      await new Promise(resolve => setTimeout(resolve, 20));
      
      const result2 = await cachedProvider.load();
      expect(result2).toEqual({ TEST: 'value2' });
      expect(mockLoad).toHaveBeenCalledTimes(2);
    });

    it('should support advanced cache options', async () => {
      const mockLoad = vi.fn().mockResolvedValue({ TEST: 'value' });
      const mockProvider = {
        name: 'test-provider',
        load: mockLoad,
      };

      const cachedProvider = cached(mockProvider, {
        ttl: 100,
        maxAge: 1000,
        staleWhileRevalidate: true,
        key: 'custom-key'
      });
      
      expect(cachedProvider.name).toBe('cached(test-provider)');
      
      await cachedProvider.load();
      await cachedProvider.load();
      
      expect(mockLoad).toHaveBeenCalledTimes(1);
    });

    it('should enforce maxAge even if TTL is longer', async () => {
      const mockLoad = vi.fn()
        .mockResolvedValueOnce({ TEST: 'value1' })
        .mockResolvedValueOnce({ TEST: 'value2' });
      
      const mockProvider = {
        name: 'test-provider',
        load: mockLoad,
      };

      const cachedProvider = cached(mockProvider, {
        ttl: 1000, // 1 second TTL
        maxAge: 50  // 50ms max age
      });
      
      await cachedProvider.load();
      expect(mockLoad).toHaveBeenCalledTimes(1);
      
      // Wait for maxAge to expire (but not TTL)
      await new Promise(resolve => setTimeout(resolve, 60));
      
      await cachedProvider.load();
      expect(mockLoad).toHaveBeenCalledTimes(2);
    });

    it('should support stale-while-revalidate: serve stale data while refreshing in background', async () => {
      const mockLoad = vi.fn()
        .mockResolvedValueOnce({ TEST: 'value1' })
        .mockResolvedValueOnce({ TEST: 'value2' });
      
      const mockProvider = {
        name: 'test-provider',
        load: mockLoad,
      };

      const cachedProvider = cached(mockProvider, {
        ttl: 50,    // 50ms TTL
        maxAge: 500, // 500ms max age
        staleWhileRevalidate: true,
        key: 'test-cache'
      });
      
      // First call - cache miss, load fresh data
      const result1 = await cachedProvider.load();
      expect(result1).toEqual({ TEST: 'value1' });
      expect(mockLoad).toHaveBeenCalledTimes(1);
      expect(cachedProvider.metadata).toEqual({ cached: false });
      
      // Second call within TTL - return cached data
      const result2 = await cachedProvider.load();
      expect(result2).toEqual({ TEST: 'value1' });
      expect(mockLoad).toHaveBeenCalledTimes(1);
      expect(cachedProvider.metadata).toEqual({ cached: true });
      
      // Wait for TTL to expire (but not maxAge)
      await new Promise(resolve => setTimeout(resolve, 60));
      
      // Third call after TTL - should return stale data immediately and trigger background refresh
      const result3 = await cachedProvider.load();
      expect(result3).toEqual({ TEST: 'value1' }); // Still returns stale data
      expect(cachedProvider.metadata).toEqual({ cached: true, stale: true });
      
      // Background refresh should have been triggered (but might not complete yet)
      // Wait a bit for background refresh to complete
      await new Promise(resolve => setTimeout(resolve, 20));
      
      // Eventually mockLoad should be called for the background refresh
      expect(mockLoad).toHaveBeenCalledTimes(2);
      
      // Fourth call - should now return the refreshed data
      const result4 = await cachedProvider.load();
      expect(result4).toEqual({ TEST: 'value2' }); // Fresh data from background refresh
      expect(cachedProvider.metadata).toEqual({ cached: true });
    });

    it('should NOT trigger stale-while-revalidate if disabled', async () => {
      const mockLoad = vi.fn()
        .mockResolvedValueOnce({ TEST: 'value1' })
        .mockResolvedValueOnce({ TEST: 'value2' });
      
      const mockProvider = {
        name: 'test-provider',
        load: mockLoad,
      };

      const cachedProvider = cached(mockProvider, {
        ttl: 50,
        maxAge: 500,
        staleWhileRevalidate: false, // Disabled
      });
      
      // First call
      await cachedProvider.load();
      expect(mockLoad).toHaveBeenCalledTimes(1);
      
      // Wait for TTL to expire
      await new Promise(resolve => setTimeout(resolve, 60));
      
      // Second call after TTL - should force refresh (blocking)
      const result = await cachedProvider.load();
      expect(result).toEqual({ TEST: 'value2' }); // New data
      expect(mockLoad).toHaveBeenCalledTimes(2); // Synchronous refresh
      expect(cachedProvider.metadata).toEqual({ cached: false }); // Was refreshed
    });

    it('should handle background refresh errors gracefully and keep serving stale data', async () => {
      const mockLoad = vi.fn()
        .mockResolvedValueOnce({ TEST: 'value1' })
        .mockRejectedValueOnce(new Error('AWS is down'))
        .mockRejectedValueOnce(new Error('Still down'))
        .mockResolvedValueOnce({ TEST: 'value2' }); // Eventually succeeds
      
      const mockProvider = {
        name: 'test-provider',
        load: mockLoad,
      };

      const cachedProvider = cached(mockProvider, {
        ttl: 50,
        maxAge: 1000,
        staleWhileRevalidate: true,
      });
      
      // First call - cache miss
      const result1 = await cachedProvider.load();
      expect(result1).toEqual({ TEST: 'value1' });
      expect(mockLoad).toHaveBeenCalledTimes(1);
      
      // Wait for TTL to expire
      await new Promise(resolve => setTimeout(resolve, 60));
      
      // Second call - returns stale data, triggers background refresh that fails
      const result2 = await cachedProvider.load();
      expect(result2).toEqual({ TEST: 'value1' }); // Still returns stale data
      expect(cachedProvider.metadata).toEqual({ cached: true, stale: true });
      
      // Wait for background refresh to complete (and fail)
      await new Promise(resolve => setTimeout(resolve, 20));
      expect(mockLoad).toHaveBeenCalledTimes(2); // Background refresh was attempted
      
      // Third call - returns stale data again, triggers another refresh that also fails
      const result3 = await cachedProvider.load();
      expect(result3).toEqual({ TEST: 'value1' }); // Still stale data (refresh failed)
      
      await new Promise(resolve => setTimeout(resolve, 20));
      expect(mockLoad).toHaveBeenCalledTimes(3);
      
      // Fourth call - returns stale data, triggers refresh that succeeds
      const result4 = await cachedProvider.load();
      expect(result4).toEqual({ TEST: 'value1' }); // Still stale initially
      
      await new Promise(resolve => setTimeout(resolve, 20));
      expect(mockLoad).toHaveBeenCalledTimes(4);
      
      // Fifth call - now returns fresh data from successful refresh
      const result5 = await cachedProvider.load();
      expect(result5).toEqual({ TEST: 'value2' }); // Fresh data!
      expect(cachedProvider.metadata).toEqual({ cached: true });
    });
  });

  describe('TTL constants', () => {
    it('should have correct TTL values', () => {
      expect(TTL.short).toBe(30 * 1000);
      expect(TTL.minute).toBe(60 * 1000);
      expect(TTL.minutes5).toBe(5 * 60 * 1000);
      expect(TTL.minutes15).toBe(15 * 60 * 1000);
      expect(TTL.hour).toBe(60 * 60 * 1000);
      expect(TTL.hours6).toBe(6 * 60 * 60 * 1000);
      expect(TTL.day).toBe(24 * 60 * 60 * 1000);
    });
  });

  describe('awsCache', () => {
    it('should return default AWS cache configuration', () => {
      const config = awsCache();
      
      expect(config.ttl).toBe(TTL.minutes5);
      expect(config.maxAge).toBe(TTL.hour);
      expect(config.staleWhileRevalidate).toBe(true);
      expect(config.key).toBe('aws-secrets');
    });

    it('should allow custom AWS cache configuration', () => {
      const config = awsCache({
        ttl: TTL.minute,
        maxAge: TTL.day,
        staleWhileRevalidate: false
      });
      
      expect(config.ttl).toBe(TTL.minute);
      expect(config.maxAge).toBe(TTL.day);
      expect(config.staleWhileRevalidate).toBe(false);
      expect(config.key).toBe('aws-secrets');
    });
  });

  describe('retry', () => {
    it('should retry failed provider calls', async () => {
      const mockLoad = vi.fn()
        .mockRejectedValueOnce(new Error('Failed 1'))
        .mockRejectedValueOnce(new Error('Failed 2'))
        .mockResolvedValueOnce({ TEST: 'success' });

      const mockProvider = {
        name: 'test-provider',
        load: mockLoad,
      };

      const retryProvider = retry(mockProvider, 3, 10);
      
      const result = await retryProvider.load();
      expect(result).toEqual({ TEST: 'success' });
      expect(mockLoad).toHaveBeenCalledTimes(3);
      expect(retryProvider.name).toBe('retry(test-provider)');
    });

    it('should throw after max retries exceeded', async () => {
      const mockLoad = vi.fn().mockRejectedValue(new Error('Always fails'));
      const mockProvider = {
        name: 'test-provider',
        load: mockLoad,
      };

      const retryProvider = retry(mockProvider, 2, 1);
      
      await expect(retryProvider.load()).rejects.toThrow('Always fails');
      expect(mockLoad).toHaveBeenCalledTimes(3); // 1 initial + 2 retries
    });

    it('should succeed on first try if no error', async () => {
      const mockLoad = vi.fn().mockResolvedValue({ TEST: 'success' });
      const mockProvider = {
        name: 'test-provider',
        load: mockLoad,
      };

      const retryProvider = retry(mockProvider, 3, 10);

      const result = await retryProvider.load();
      expect(result).toEqual({ TEST: 'success' });
      expect(mockLoad).toHaveBeenCalledTimes(1);
    });
  });

  describe('withPrefix', () => {
    it('should strip prefix from environment variable names', async () => {
      const mockResolver: Resolver = {
        name: 'test-resolver',
        async load() {
          return {
            APP_PORT: '3000',
            APP_DATABASE_URL: 'postgres://localhost',
            APP_DEBUG: 'true',
            OTHER_VAR: 'value'
          };
        },
        loadSync() {
          return {
            APP_PORT: '3000',
            APP_DATABASE_URL: 'postgres://localhost',
            APP_DEBUG: 'true',
            OTHER_VAR: 'value'
          };
        }
      };

      const prefixedResolver = withPrefix(mockResolver, 'APP_');
      const env = await prefixedResolver.load();

      expect(env.PORT).toBe('3000');
      expect(env.DATABASE_URL).toBe('postgres://localhost');
      expect(env.DEBUG).toBe('true');
      expect(env.OTHER_VAR).toBe('value'); // Keys without prefix remain unchanged
    });

    it('should work with sync resolver', () => {
      const mockResolver: Resolver = {
        name: 'test-resolver',
        async load() {
          return { MYAPP_PORT: '8080' };
        },
        loadSync() {
          return { MYAPP_PORT: '8080' };
        }
      };

      const prefixedResolver = withPrefix(mockResolver, 'MYAPP_');
      const env = prefixedResolver.loadSync!();

      expect(env.PORT).toBe('8080');
    });

    it('should be case-insensitive for prefix matching', async () => {
      const mockResolver: Resolver = {
        name: 'test-resolver',
        async load() {
          return {
            app_port: '3000',
            APP_HOST: 'localhost',
            ApP_Debug: 'true'
          };
        }
      };

      const prefixedResolver = withPrefix(mockResolver, 'app_');
      const env = await prefixedResolver.load();

      expect(env.port).toBe('3000');
      expect(env.HOST).toBe('localhost');
      expect(env.Debug).toBe('true');
    });

    it('should throw if sync not supported', () => {
      const mockResolver: Resolver = {
        name: 'async-only',
        async load() {
          return { APP_PORT: '3000' };
        }
      };

      const prefixedResolver = withPrefix(mockResolver, 'APP_');
      expect(() => prefixedResolver.loadSync!()).toThrow('does not support sync loading');
    });

    it('should set correct resolver name', async () => {
      const mockResolver: Resolver = {
        name: 'test-resolver',
        async load() {
          return {};
        }
      };

      const prefixedResolver = withPrefix(mockResolver, 'PREFIX_');
      expect(prefixedResolver.name).toBe('withPrefix(test-resolver, PREFIX_)');
    });
  });

  describe('withAliases', () => {
    it('should map aliases to canonical keys', async () => {
      const mockResolver: Resolver = {
        name: 'test-resolver',
        async load() {
          return {
            HTTP_PORT: '3000',
            DB_URL: 'postgres://localhost',
            JWT_SECRET: 'secret123'
          };
        },
        loadSync() {
          return {
            HTTP_PORT: '3000',
            DB_URL: 'postgres://localhost',
            JWT_SECRET: 'secret123'
          };
        }
      };

      const aliasedResolver = withAliases(mockResolver, {
        PORT: ['PORT', 'HTTP_PORT', 'SERVER_PORT'],
        DATABASE_URL: ['DATABASE_URL', 'DB_URL', 'POSTGRES_URL'],
        API_SECRET: ['API_SECRET', 'JWT_SECRET', 'TOKEN_SECRET']
      });

      const env = await aliasedResolver.load();

      expect(env.PORT).toBe('3000'); // From HTTP_PORT
      expect(env.DATABASE_URL).toBe('postgres://localhost'); // From DB_URL
      expect(env.API_SECRET).toBe('secret123'); // From JWT_SECRET
    });

    it('should use first matching alias', async () => {
      const mockResolver: Resolver = {
        name: 'test-resolver',
        async load() {
          return {
            PORT: '3000',
            HTTP_PORT: '8080',
            SERVER_PORT: '9000'
          };
        }
      };

      const aliasedResolver = withAliases(mockResolver, {
        PORT: ['PORT', 'HTTP_PORT', 'SERVER_PORT']
      });

      const env = await aliasedResolver.load();
      expect(env.PORT).toBe('3000'); // First alias wins
    });

    it('should preserve original env vars', async () => {
      const mockResolver: Resolver = {
        name: 'test-resolver',
        async load() {
          return {
            HTTP_PORT: '3000',
            DEBUG: 'true',
            NODE_ENV: 'development'
          };
        }
      };

      const aliasedResolver = withAliases(mockResolver, {
        PORT: ['PORT', 'HTTP_PORT']
      });

      const env = await aliasedResolver.load();
      expect(env.PORT).toBe('3000'); // Mapped from alias
      expect(env.HTTP_PORT).toBe('3000'); // Original still exists
      expect(env.DEBUG).toBe('true'); // Untouched
      expect(env.NODE_ENV).toBe('development'); // Untouched
    });

    it('should work with sync resolver', () => {
      const mockResolver: Resolver = {
        name: 'test-resolver',
        async load() {
          return { DB_URL: 'postgres://localhost' };
        },
        loadSync() {
          return { DB_URL: 'postgres://localhost' };
        }
      };

      const aliasedResolver = withAliases(mockResolver, {
        DATABASE_URL: ['DATABASE_URL', 'DB_URL']
      });

      const env = aliasedResolver.loadSync!();
      expect(env.DATABASE_URL).toBe('postgres://localhost');
    });

    it('should handle undefined aliases gracefully', async () => {
      const mockResolver: Resolver = {
        name: 'test-resolver',
        async load() {
          return {
            PORT: '3000'
          };
        }
      };

      const aliasedResolver = withAliases(mockResolver, {
        DATABASE_URL: ['DATABASE_URL', 'DB_URL', 'POSTGRES_URL']
      });

      const env = await aliasedResolver.load();
      expect(env.PORT).toBe('3000');
      expect(env.DATABASE_URL).toBeUndefined(); // No alias matched
    });

    it('should throw if sync not supported', () => {
      const mockResolver: Resolver = {
        name: 'async-only',
        async load() {
          return { PORT: '3000' };
        }
      };

      const aliasedResolver = withAliases(mockResolver, {
        PORT: ['PORT']
      });

      expect(() => aliasedResolver.loadSync!()).toThrow('does not support sync loading');
    });

    it('should set correct resolver name', async () => {
      const mockResolver: Resolver = {
        name: 'test-resolver',
        async load() {
          return {};
        }
      };

      const aliasedResolver = withAliases(mockResolver, {});
      expect(aliasedResolver.name).toBe('withAliases(test-resolver)');
    });
  });
});