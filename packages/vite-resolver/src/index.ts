/**
 * node-env-resolver/vite
 * Zero-config Vite integration with automatic client/server split
 *
 * Vite handles .env files via process.env automatically.
 * resolve() is synchronous and works with ALL validator types:
 * - Basic types: string, number, boolean, enums, pattern, custom
 * - Advanced types: postgres, url, email, json, port, etc.
 */

import { resolve as nodeEnvResolve } from 'node-env-resolver';
import type { SimpleEnvSchema, ResolveOptions, InferSimpleSchema } from 'node-env-resolver';

// Safe resolve result types (Zod-like)
export interface SafeResolveResult<T> {
  success: true;
  data: T;
}

export interface SafeResolveError {
  success: false;
  error: string;
}

export type SafeResolveResultType<T> = SafeResolveResult<T> | SafeResolveError;

export interface ViteEnvConfig<TServer extends SimpleEnvSchema, TClient extends SimpleEnvSchema> {
  server: TServer;
  client: TClient;
}

export interface ViteOptions extends Omit<ResolveOptions, 'resolvers'> {
  /**
   * Prefix for client environment variables
   * @default 'VITE_'
   */
  clientPrefix?: string;
  
  /**
   * Enable variable expansion in .env files
   * @default true
   */
  expandVars?: boolean;
  
  /**
   * Enable runtime protection for server variables in client components
   * @default true
   */
  runtimeProtection?: boolean;
}

/**
 * Create type-safe environment configuration for Vite with automatic client/server split
 *
 * Vite handles .env files automatically.
 * This function is synchronous and supports ALL validator types:
 * - Basic types: string, number, boolean, enums, pattern, custom
 * - Advanced types: postgres, url, email, json, port, date, etc.
 *
 * @example
 * ```typescript
 * // env.ts
 * import { resolve } from 'node-env-resolver-vite';
 *
 * export const env = resolve({
 *   server: {
 *     DATABASE_URL: url(),
 *     API_SECRET: string(),
 *     PORT: 'port:5173',
 *     NODE_ENV: ['development', 'production'] as const
 *   },
 *   client: {
 *     VITE_API_URL: url(),
 *     VITE_ENABLE_ANALYTICS: false,
 *     VITE_GA_ID: string({optional:true})
 *   }
 * });
 *
 * // In server/build code (vite.config.ts, SSR)
 * import { env } from './env';
 *
 * console.log(env.server.DATABASE_URL); // ✅ Works, type: URL
 * console.log(env.client.VITE_API_URL); // ✅ Works, type: URL
 *
 * // In browser code
 * console.log(env.server.DATABASE_URL); // ❌ Throws helpful error in dev
 * console.log(env.client.VITE_API_URL); // ✅ Works, type: URL
 * ```
 */
export function resolve<TServer extends SimpleEnvSchema, TClient extends SimpleEnvSchema>(
  config: ViteEnvConfig<TServer, TClient>,
  options: Omit<ViteOptions, 'resolvers'> & { resolvers?: never } = {}
): {
  server: InferSimpleSchema<TServer>;
  client: InferSimpleSchema<TClient>;
} {
  const {
    clientPrefix = 'VITE_',
    runtimeProtection = true
  } = options;

  // Validate client keys have correct prefix
  const clientKeys = Object.keys(config.client);
  const incorrectClientKeys = clientKeys.filter(key => !key.startsWith(clientPrefix));
  if (incorrectClientKeys.length > 0) {
    throw new Error(
      `❌ Client environment variables must be prefixed with '${clientPrefix}': ${incorrectClientKeys.join(', ')}\n` +
      `💡 Rename these variables to start with '${clientPrefix}' (e.g., ${incorrectClientKeys[0]} → ${clientPrefix}${incorrectClientKeys[0]})`
    );
  }

  // Validate server keys don't have client prefix
  const serverKeys = Object.keys(config.server);
  const incorrectServerKeys = serverKeys.filter(key => key.startsWith(clientPrefix));
  if (incorrectServerKeys.length > 0) {
    throw new Error(
      `❌ Server environment variables should not be prefixed with '${clientPrefix}': ${incorrectServerKeys.join(', ')}\n` +
      `💡 These variables will be exposed to the client. Move to client schema or remove prefix.`
    );
  }

  // Use resolve - Vite already handles .env files via process.env, so no custom resolvers needed
  const serverResult = nodeEnvResolve(config.server) as InferSimpleSchema<TServer>;
  const clientResult = nodeEnvResolve(config.client) as InferSimpleSchema<TClient>;

  // Create protected environment object with runtime guards
  const isBrowser = () => typeof window !== 'undefined';

  const protectedEnv = {
    server: new Proxy(serverResult, {
      get(target, prop) {
        // Runtime protection for server variables in client
        if (runtimeProtection && isBrowser()) {
          throw new Error(
            `❌ Cannot access server environment variable '${String(prop)}' in client-side code.\n` +
            `💡 Server variables are only available in server context (vite.config.ts, SSR, build scripts).\n` +
            `💡 If you need this data on the client, consider:\n` +
            `   - Moving it to the client schema with ${clientPrefix} prefix\n` +
            `   - Fetching it via an API endpoint\n` +
            `   - Using SSR to pass data to client components`
          );
        }
        return (target as Record<string, unknown>)[prop as string];
      }
    }),
    client: clientResult
  };

  return protectedEnv;
}

/**
 * Safe version of resolve() - returns result object instead of throwing (Zod-like pattern)
 *
 * Supports all validator types (basic and advanced).
 *
 * @example
 * ```typescript
 * // env.ts
 * import { safeResolve } from 'node-env-resolver-vite';
 *
 * const result = safeResolve({
 *   server: {
 *     DATABASE_URL: url(),
 *     API_SECRET: string(),
 *     PORT: 'port:5173'
 *   },
 *   client: {
 *     VITE_API_URL: url(),
 *     VITE_ENABLE_ANALYTICS: false,
 *   }
 * });
 *
 * if (result.success) {
 *   export const env = result.data;
 * } else {
 *   console.error('Environment validation failed:', result.error);
 *   process.exit(1);
 * }
 * ```
 */
export function safeResolve<TServer extends SimpleEnvSchema, TClient extends SimpleEnvSchema>(
  config: ViteEnvConfig<TServer, TClient>,
  options: Omit<ViteOptions, 'resolvers'> & { resolvers?: never } = {}
): SafeResolveResultType<{
  server: InferSimpleSchema<TServer>;
  client: InferSimpleSchema<TClient>;
}> {
  try {
    const result = resolve(config, options);
    return { success: true, data: result };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

// Re-export useful types and utilities
export type { SimpleEnvSchema, EnvDefinition } from 'node-env-resolver';
export { string, url, port, postgres, email, number, boolean, enums, secret, custom, duration, file, json, stringArray, numberArray, urlArray, http, https, mysql, mongodb, redis, date, timestamp } from 'node-env-resolver';

// Utility for runtime environment detection
export const isServer = typeof window === 'undefined';
export const isClient = !isServer;

