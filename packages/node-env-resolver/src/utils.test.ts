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

      const cachedProvider = cached(mockProvider, 1000);
      
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

      const cachedProvider = cached(mockProvider, 10); // 10ms TTL
      
      const result1 = await cachedProvider.load();
      expect(result1).toEqual({ TEST: 'value1' });
      
      // Wait for TTL to expire
      await new Promise(resolve => setTimeout(resolve, 20));
      
      const result2 = await cachedProvider.load();
      expect(result2).toEqual({ TEST: 'value2' });
      expect(mockLoad).toHaveBeenCalledTimes(2);
    });

    it('should support backward compatibility with number TTL', async () => {
      const mockLoad = vi.fn().mockResolvedValue({ TEST: 'value' });
      const mockProvider = {
        name: 'test-provider',
        load: mockLoad,
      };

      const cachedProvider = cached(mockProvider, 1000);
      
      await cachedProvider.load();
      await cachedProvider.load();
      
      expect(mockLoad).toHaveBeenCalledTimes(1);
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

    it('should support stale-while-revalidate configuration', async () => {
      const mockLoad = vi.fn().mockResolvedValue({ TEST: 'value' });
      const mockProvider = {
        name: 'test-provider',
        load: mockLoad,
      };

      const cachedProvider = cached(mockProvider, {
        ttl: 1000,
        maxAge: 10000,
        staleWhileRevalidate: true,
        key: 'test-cache'
      });
      
      expect(cachedProvider.name).toBe('cached(test-provider)');
      
      // First call
      const result = await cachedProvider.load();
      expect(result).toEqual({ TEST: 'value' });
      expect(mockLoad).toHaveBeenCalledTimes(1);
      
      // Second call should use cache
      const result2 = await cachedProvider.load();
      expect(result2).toEqual({ TEST: 'value' });
      expect(mockLoad).toHaveBeenCalledTimes(1);
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