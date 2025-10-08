/**
 * node-env-resolver/nextjs
 * Zero-config Next.js integration with automatic client/server split
 *
 * IMPORTANT: Next.js config files must be synchronous.
 * resolve() is synchronous and works with Next.js config.
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

// Type for globalThis with window property
interface GlobalWithWindow {
  window?: Window;
}

export interface NextjsEnvConfig<TServer extends SimpleEnvSchema, TClient extends SimpleEnvSchema> {
  server: TServer;
  client: TClient;
}

export interface NextjsOptions extends Omit<ResolveOptions, 'resolvers'> {
  /**
   * Prefix for client environment variables
   * @default 'NEXT_PUBLIC_'
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
 * Create type-safe environment configuration for Next.js with automatic client/server split
 *
 * IMPORTANT: Next.js config files must be synchronous.
 * This function is synchronous and works perfectly with Next.js.
 *
 * @example
 * ```typescript
 * // env.ts
 * import { resolve } from 'node-env-resolver/nextjs';
 *
 * export const env = resolve({
 *   server: {
 *     DATABASE_URL: 'url',
 *     API_SECRET: 'string',
 *     RESEND_API_KEY: 'string'
 *   },
 *   client: {
 *     NEXT_PUBLIC_APP_URL: 'url',
 *     NEXT_PUBLIC_GA_ID: 'string?'
 *   }
 * });
 *
 * // app/page.tsx (server component)
 * import { env } from '../env';
 *
 * console.log(env.server.DATABASE_URL); // ✅ Works, type: URL
 * console.log(env.client.NEXT_PUBLIC_APP_URL); // ✅ Works, type: URL
 *
 * // components/analytics.tsx (client component)
 * 'use client';
 * import { env } from '../env';
 *
 * console.log(env.server.DATABASE_URL); // ❌ Throws helpful error in dev
 * console.log(env.client.NEXT_PUBLIC_APP_URL); // ✅ Works, type: URL
 * ```
 */
export function resolve<TServer extends SimpleEnvSchema, TClient extends SimpleEnvSchema>(
  config: NextjsEnvConfig<TServer, TClient>,
  options: Omit<NextjsOptions, 'resolvers'> & { resolvers?: never } = {}
): {
  server: InferSimpleSchema<TServer>;
  client: InferSimpleSchema<TClient>;
} {
  const {
    clientPrefix = 'NEXT_PUBLIC_',
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

  // Use resolveSync - Next.js config must be sync
  // Next.js already handles .env files via process.env, so no custom resolvers needed
  const serverResult: InferSimpleSchema<TServer> = nodeEnvResolve(config.server);
  const clientResult: InferSimpleSchema<TClient> = nodeEnvResolve(config.client);

  // Create protected environment object with runtime guards
  const isBrowser = () => typeof (globalThis as GlobalWithWindow).window !== 'undefined';

  const protectedEnv = {
    server: new Proxy(serverResult, {
      get(target, prop) {
        // Runtime protection for server variables in client
        if (runtimeProtection && isBrowser()) {
          throw new Error(
            `❌ Cannot access server environment variable '${String(prop)}' in client-side code.\n` +
            `💡 Server variables are only available in server components, API routes, and middleware.\n` +
            `💡 If you need this data on the client, consider:\n` +
            `   - Moving it to the client schema with NEXT_PUBLIC_ prefix\n` +
            `   - Fetching it via an API route\n` +
            `   - Using server actions to pass data to client components`
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
 * @example
 * ```typescript
 * // env.ts
 * import { safeResolve } from 'node-env-resolver/nextjs';
 *
 * const result = safeResolve({
 *   server: {
 *     DATABASE_URL: 'url',
 *     API_SECRET: 'string',
 *   },
 *   client: {
 *     NEXT_PUBLIC_APP_URL: 'url',
 *     NEXT_PUBLIC_GA_ID: 'string?',
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
  config: NextjsEnvConfig<TServer, TClient>,
  options: Omit<NextjsOptions, 'resolvers'> & { resolvers?: never } = {}
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

// Utility for runtime environment detection
export const isServer = typeof (globalThis as GlobalWithWindow).window === 'undefined';
export const isClient = !isServer;