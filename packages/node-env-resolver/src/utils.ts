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

/**
 * Wrap a resolver to strip a prefix from environment variable names
 * Useful for scoping environment variables (e.g., APP_PORT → PORT)
 *
 * @param resolver The resolver to wrap
 * @param prefix The prefix to strip (case-insensitive)
 * @returns Wrapped resolver that strips the prefix
 *
 * @example
 * ```ts
 * import { resolve, processEnv } from 'node-env-resolver';
 * import { withPrefix } from 'node-env-resolver/utils';
 *
 * // Maps APP_PORT → PORT, APP_DATABASE_URL → DATABASE_URL
 * const config = await resolve.with(
 *   [withPrefix(processEnv(), 'APP_'), { PORT: 3000, DATABASE_URL: 'postgres' }]
 * );
 * ```
 */
export function withPrefix(resolver: Resolver, prefix: string): Resolver {
  const normalizedPrefix = prefix.toUpperCase();

  return {
    name: `withPrefix(${resolver.name}, ${prefix})`,
    async load() {
      const env = await resolver.load();
      const stripped: Record<string, string> = {};

      for (const [key, value] of Object.entries(env)) {
        if (key.toUpperCase().startsWith(normalizedPrefix)) {
          // Strip prefix and keep rest of the key
          const strippedKey = key.slice(prefix.length);
          stripped[strippedKey] = value;
        } else {
          // Keep keys without prefix unchanged
          stripped[key] = value;
        }
      }

      return stripped;
    },
    loadSync() {
      if (!resolver.loadSync) {
        throw new Error(`Resolver ${resolver.name} does not support sync loading`);
      }

      const env = resolver.loadSync();
      const stripped: Record<string, string> = {};

      for (const [key, value] of Object.entries(env)) {
        if (key.toUpperCase().startsWith(normalizedPrefix)) {
          // Strip prefix and keep rest of the key
          const strippedKey = key.slice(prefix.length);
          stripped[strippedKey] = value;
        } else {
          // Keep keys without prefix unchanged
          stripped[key] = value;
        }
      }

      return stripped;
    }
  };
}

/**
 * Add computed/derived properties to resolved config
 *
 * Useful for deriving values from multiple config fields (e.g., building URLs,
 * computing feature flags, creating connection objects).
 *
 * @param config Resolved configuration object
 * @param computed Map of computed property names to functions that derive values
 * @returns Config with computed properties as getters
 *
 * @example
 * ```ts
 * import { resolve } from 'node-env-resolver';
 * import { withComputed } from 'node-env-resolver/utils';
 *
 * const config = withComputed(
 *   resolve({ HOST: 'localhost', PORT: 3000, NODE_ENV: 'development' }),
 *   {
 *     url: (c) => `http://${c.HOST}:${c.PORT}`,
 *     isDev: (c) => c.NODE_ENV === 'development',
 *     isSecure: (c) => c.HOST !== 'localhost'
 *   }
 * );
 *
 * console.log(config.url);      // 'http://localhost:3000'
 * console.log(config.isDev);    // true
 * console.log(config.isSecure); // false
 * ```
 */
export function withComputed<
  TConfig extends Record<string, unknown>,
  TComputed extends Record<string, (config: TConfig) => unknown>
>(
  config: TConfig,
  computed: TComputed
): TConfig & { [K in keyof TComputed]: ReturnType<TComputed[K]> } {
  const result = { ...config } as TConfig & { [K in keyof TComputed]: ReturnType<TComputed[K]> };

  for (const [key, fn] of Object.entries(computed)) {
    Object.defineProperty(result, key, {
      get() {
        return fn(config);
      },
      enumerable: true,
      configurable: true
    });
  }

  return result;
}

/**
 * Wrap a resolver to support field aliases (multiple possible names for a config value)
 * Tries each alias in order and uses the first one found
 *
 * @param resolver The resolver to wrap
 * @param aliases Map of canonical key to array of possible aliases
 * @returns Wrapped resolver that supports aliases
 *
 * @example
 * ```ts
 * import { resolve, processEnv } from 'node-env-resolver';
 * import { withAliases } from 'node-env-resolver/utils';
 *
 * // Tries PORT, then HTTP_PORT, then SERVER_PORT (first found wins)
 * const config = await resolve.with(
 *   [withAliases(processEnv(), {
 *     PORT: ['PORT', 'HTTP_PORT', 'SERVER_PORT'],
 *     DATABASE_URL: ['DATABASE_URL', 'DB_URL', 'POSTGRES_URL']
 *   }), { PORT: 3000, DATABASE_URL: 'postgres' }]
 * );
 * ```
 */
export function withAliases(
  resolver: Resolver,
  aliases: Record<string, string[]>
): Resolver {
  return {
    name: `withAliases(${resolver.name})`,
    async load() {
      const env = await resolver.load();
      return applyAliases(env, aliases);
    },
    loadSync() {
      if (!resolver.loadSync) {
        throw new Error(`Resolver ${resolver.name} does not support sync loading`);
      }
      const env = resolver.loadSync();
      return applyAliases(env, aliases);
    }
  };
}

/**
 * Apply aliases to environment map
 */
function applyAliases(
  env: Record<string, string>,
  aliases: Record<string, string[]>
): Record<string, string> {
  const result: Record<string, string> = { ...env };

  for (const [canonicalKey, aliasList] of Object.entries(aliases)) {
    // Try each alias in order
    for (const alias of aliasList) {
      if (env[alias] !== undefined) {
        // Found a value, map it to the canonical key
        result[canonicalKey] = env[alias];
        break; // Stop at first match
      }
    }
  }

  return result;
}

/**
 * Wrap a resolver to apply custom transformations to values
 * Powerful utility for parsing, coercing, or enriching config values
 *
 * @param resolver The resolver to wrap
 * @param transforms Map of keys to transformation functions
 * @returns Wrapped resolver that applies transforms
 *
 * @example
 * ```ts
 * import { resolve, processEnv } from 'node-env-resolver';
 * import { withTransform } from 'node-env-resolver/utils';
 *
 * const config = await resolve.with(
 *   [withTransform(processEnv(), {
 *     // Parse comma-separated values
 *     TAGS: (val) => val.split(',').map(s => s.trim()),
 *     // Convert to URL object
 *     API_URL: (val) => new URL(val),
 *     // Custom parsing
 *     MAX_RETRIES: (val) => Math.min(parseInt(val, 10), 10)
 *   }), {
 *     TAGS: 'string',
 *     API_URL: 'url',
 *     MAX_RETRIES: 'number'
 *   }]
 * );
 * ```
 */
export function withTransform(
  resolver: Resolver,
  transforms: Record<string, (value: string) => string>
): Resolver {
  return {
    name: `withTransform(${resolver.name})`,
    async load() {
      const env = await resolver.load();
      return applyTransforms(env, transforms);
    },
    loadSync() {
      if (!resolver.loadSync) {
        throw new Error(`Resolver ${resolver.name} does not support sync loading`);
      }
      const env = resolver.loadSync();
      return applyTransforms(env, transforms);
    }
  };
}

/**
 * Apply transformations to environment map
 */
function applyTransforms(
  env: Record<string, string>,
  transforms: Record<string, (value: string) => string>
): Record<string, string> {
  const result: Record<string, string> = { ...env };

  for (const [key, transform] of Object.entries(transforms)) {
    if (env[key] !== undefined) {
      try {
        result[key] = transform(env[key]);
      } catch (error) {
        throw new Error(
          `Transform failed for ${key}: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  }

  return result;
}

/**
 * Wrap a resolver to scope all keys to a namespace/prefix
 * Similar to withPrefix but adds the namespace instead of removing it
 *
 * @param resolver The resolver to wrap
 * @param namespace The namespace to scope keys under
 * @returns Wrapped resolver with scoped keys
 *
 * @example
 * ```ts
 * import { resolve, processEnv } from 'node-env-resolver';
 * import { withNamespace } from 'node-env-resolver/utils';
 *
 * // Reads DATABASE_HOST, DATABASE_PORT from env
 * // But schema only needs HOST, PORT
 * const dbConfig = await resolve.with(
 *   [withNamespace(processEnv(), 'DATABASE'), {
 *     HOST: 'string',
 *     PORT: 'port'
 *   }]
 * );
 * // dbConfig: { HOST: '...', PORT: ... }
 * ```
 */
export function withNamespace(
  resolver: Resolver,
  namespace: string
): Resolver {
  const upperNamespace = namespace.toUpperCase();
  const prefix = `${upperNamespace}_`;

  return {
    name: `withNamespace(${resolver.name}, ${namespace})`,
    async load() {
      const env = await resolver.load();
      const scoped: Record<string, string> = {};

      // Filter and strip namespace prefix
      for (const [key, value] of Object.entries(env)) {
        if (key.toUpperCase().startsWith(prefix)) {
          const scopedKey = key.slice(prefix.length);
          scoped[scopedKey] = value;
        }
      }

      return scoped;
    },
    loadSync() {
      if (!resolver.loadSync) {
        throw new Error(`Resolver ${resolver.name} does not support sync loading`);
      }

      const env = resolver.loadSync();
      const scoped: Record<string, string> = {};

      // Filter and strip namespace prefix
      for (const [key, value] of Object.entries(env)) {
        if (key.toUpperCase().startsWith(prefix)) {
          const scopedKey = key.slice(prefix.length);
          scoped[scopedKey] = value;
        }
      }

      return scoped;
    }
  };
}

/**
 * Watch configuration files and reload automatically
 * Perfect for development - auto-reload when .env files change
 *
 * @param resolvers Array of [resolver, schema] tuples or single config
 * @param options Watch options
 * @returns Function to get current config + cleanup function
 *
 * @example
 * ```ts
 * import { watch } from 'node-env-resolver/utils';
 * import { dotenv } from 'node-env-resolver/resolvers';
 *
 * const { getConfig, stop } = watch([
 *   dotenv(),
 *   { PORT: 3000, API_KEY: 'string' }
 * ], {
 *   onChange: (config) => console.log('Config reloaded!', config)
 * });
 *
 * // Use in your app
 * app.get('/config', () => getConfig());
 *
 * // Cleanup when done
 * process.on('SIGINT', () => stop());
 * ```
 */
export function watch<T>(
  config: Parameters<typeof import('./index').resolve.with>[0],
  options?: {
    /** Callback when config changes */
    onChange?: (config: T) => void;
    /** Debounce delay in ms (default: 100) */
  debounce?: number;
    /** Files to watch (default: ['.env']) */
    files?: string[];
  }
): {
  getConfig: () => T;
  stop: () => void;
} {
  const { onChange, debounce = 100, files = ['.env'] } = options ?? {};
 
  let currentConfig: T;
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  const watchers: Array<ReturnType<typeof import('fs').watch>> = [];

  // Initial load
  const loadConfig = async () => {
    try {
      const { resolve } = await import('./index');
      currentConfig = await resolve.with(config as Parameters<typeof resolve.with>[0]) as T;
      return currentConfig;
    } catch (error) {
      console.error('[watch] Failed to load config:', error);
      throw error;
    }
  };

  // Reload with debounce
  const reload = () => {
    if (debounceTimer) clearTimeout(debounceTimer);

    debounceTimer = setTimeout(async () => {
      try {
        const newConfig = await loadConfig();
        onChange?.(newConfig);
      } catch (error) {
        console.error('[watch] Failed to reload config:', error);
      }
    }, debounce);
  };

  // Watch files
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { watch: fsWatch } = require('fs');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { join } = require('path');
 
  for (const file of files) {
    try {
      const watcher = fsWatch(join(process.cwd(), file), reload);
      watchers.push(watcher);
    } catch {
      // File doesn't exist yet, that's ok
    }
  }

  // Load initial config (sync in constructor)
  loadConfig().catch(console.error);

  return {
    getConfig: () => currentConfig,
    stop: () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      for (const watcher of watchers) {
        watcher.close();
      }
    }
  };
}