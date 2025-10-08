/**
 * Core utility resolvers and wrappers
 */

import type { Resolver } from './types';
// Enhanced caching wrapper with TTL support
export interface CacheOptions {
  /** Time to live in milliseconds (default: 5 minutes) */
  ttl?: number;
  /** Maximum age in milliseconds before forcing refresh (default: 1 hour) */
  maxAge?: number;
  /** Enable stale-while-revalidate: serve stale data while refreshing in background */
  staleWhileRevalidate?: boolean;
  /** Custom cache key (useful for debugging or manual cache invalidation) */
  key?: string;
}

export function cached(resolver: Resolver, options: CacheOptions = {}): Resolver {
  const {
    ttl = 300000, // 5 minutes default
    maxAge = 3600000, // 1 hour max age
    staleWhileRevalidate = false,
  } = options;
  
  let cache: { 
    data: Record<string, string>; 
    timestamp: number;
    refreshPromise?: Promise<Record<string, string>>;
  } | null = null;
  
  const wrapper: Resolver = {
    name: `cached(${resolver.name})`,
    metadata: {},
    async load() {
      const now = Date.now();
      
      // If no cache or cache is expired beyond maxAge, force refresh
      if (!cache || (now - cache.timestamp) > maxAge) {
        const data = await resolver.load();
        cache = { data, timestamp: now };
        wrapper.metadata = { cached: false };
        return data;
      }
      
      // If cache is within TTL, return cached data (fresh)
      if ((now - cache.timestamp) < ttl) {
        wrapper.metadata = { cached: true };
        return cache.data;
      }
      
      // Cache is stale (between TTL and maxAge)
      // If stale-while-revalidate is enabled, serve stale data while refreshing in background
      if (staleWhileRevalidate && !cache.refreshPromise) {
        // Trigger background refresh (non-blocking, lazy/on-demand)
        // This only runs when a request comes in, NOT via setInterval
        cache.refreshPromise = resolver.load().then(data => {
          // Success: update cache with fresh data
          cache!.data = data;
          cache!.timestamp = Date.now();
          cache!.refreshPromise = undefined;
          return data;
        }).catch(() => {
          // Error resilience: if refresh fails (AWS down, network error, etc.):
          // - Silently catch the error (no throw)
          // - Keep serving stale data to users
          // - Clear refreshPromise to allow retry on next request
          // - App stays up even if AWS is temporarily unavailable
          cache!.refreshPromise = undefined;
          return cache!.data;
        });
        
        // Immediately return stale data (don't wait for background refresh)
        wrapper.metadata = { cached: true, stale: true };
        return cache.data;
      }
      
      // Cache is stale and no stale-while-revalidate, force refresh
      const data = await resolver.load();
      cache = { data, timestamp: now };
      wrapper.metadata = { cached: false };
      return data;
    },
  };
  
  return wrapper;
}

// Utility functions for common TTL configurations
export const TTL = {
  /** 30 seconds */
  short: 30 * 1000,
  /** 1 minute */
  minute: 60 * 1000,
  /** 5 minutes */
  minutes5: 5 * 60 * 1000,
  /** 15 minutes */
  minutes15: 15 * 60 * 1000,
  /** 1 hour */
  hour: 60 * 60 * 1000,
  /** 6 hours */
  hours6: 6 * 60 * 60 * 1000,
  /** 24 hours */
  day: 24 * 60 * 60 * 1000,
} as const;

// Helper function to create AWS-friendly cache configuration
export function awsCache(options: {
  /** Cache duration for AWS secrets/parameters (default: 5 minutes) */
  ttl?: number;
  /** Maximum age before forcing refresh (default: 1 hour) */
  maxAge?: number;
  /** Enable stale-while-revalidate for better performance (default: true) */
  staleWhileRevalidate?: boolean;
} = {}): CacheOptions {
  return {
    ttl: options.ttl ?? TTL.minutes5,
    maxAge: options.maxAge ?? TTL.hour,
    staleWhileRevalidate: options.staleWhileRevalidate ?? true,
    key: 'aws-secrets',
  };
}

// Retry wrapper
export function retry(resolver: Resolver, maxRetries = 3, delayMs = 1000): Resolver {
  return {
    name: `retry(${resolver.name})`,
    async load() {
      let lastError: Error;
      
      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          return await resolver.load();
        } catch (error) {
          lastError = error instanceof Error ? error : new Error(String(error));
          
          if (attempt < maxRetries) {
            await new Promise(resolve => setTimeout(resolve, delayMs * Math.pow(2, attempt)));
          }
        }
      }
      
      throw lastError!;
    },
  };
}