import { describe, it, expect, vi } from 'vitest';
import { cached, retry, TTL, awsCache } from './utils';
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
});