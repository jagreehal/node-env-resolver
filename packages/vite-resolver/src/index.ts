/**
 * node-env-resolver/vite
 * Zero-config Vite integration with automatic client/server split
 */

import { resolve as nodeEnvResolve, resolveAsync } from 'node-env-resolver';
import { dotenv } from 'node-env-resolver/resolvers';
import type {
  SimpleEnvSchema,
  ResolveOptions,
  InferSimpleSchema,
  ReferenceHandler,
} from 'node-env-resolver';

export type { ReferenceHandler };

export {
  string,
  url,
  port,
  postgres,
  email,
  number,
  boolean,
  oneOf,
  secret,
  custom,
  duration,
  file,
  json,
  stringArray,
  numberArray,
  urlArray,
  http,
  https,
  mysql,
  mongodb,
  redis,
  date,
  timestamp,
} from 'node-env-resolver/validators';

export type { EnvDefinition } from 'node-env-resolver';

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
  clientPrefix?: string;
  expandVars?: boolean;
  runtimeProtection?: boolean;
  async?: boolean;
  referenceHandlers?: Record<string, ReferenceHandler>;
}

function createIsBrowser(): () => boolean {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const globalAny = globalThis as any;
  const isBrowserOverride = globalAny.__NODE_ENV_RESOLVER_VITE_IS_BROWSER;
  if (typeof isBrowserOverride === 'function') {
    return isBrowserOverride;
  }
  return () => typeof window !== 'undefined';
}

function validatePrefixes<
  TServer extends SimpleEnvSchema,
  TClient extends SimpleEnvSchema,
>(config: ViteEnvConfig<TServer, TClient>, clientPrefix: string): string | null {
  const badClientKeys = Object.keys(config.client).filter((k) => !k.startsWith(clientPrefix));
  if (badClientKeys.length > 0) {
    return `Client env vars must be prefixed '${clientPrefix}': ${badClientKeys.join(', ')}`;
  }
  const badServerKeys = Object.keys(config.server).filter((k) => k.startsWith(clientPrefix));
  if (badServerKeys.length > 0) {
    return `Server env vars should not be prefixed '${clientPrefix}': ${badServerKeys.join(', ')}`;
  }
  return null;
}

function resolveInternal<TServer extends SimpleEnvSchema, TClient extends SimpleEnvSchema>(
  config: ViteEnvConfig<TServer, TClient>,
  options: Omit<ViteOptions, 'async' | 'referenceHandlers'>
) {
  try {
    const { clientPrefix = 'VITE_', runtimeProtection = true } = options;

    const prefixError = validatePrefixes(config, clientPrefix);
    if (prefixError) return { error: prefixError };

    const serverResult = nodeEnvResolve(config.server);
    const clientResult = nodeEnvResolve(config.client);

    const isBrowser = createIsBrowser();

    const protectedEnv = {
      server: runtimeProtection
        ? new Proxy(serverResult, {
            get(_target, prop) {
              if (isBrowser()) {
                throw new Error(`Cannot access server env var '${String(prop)}' in client code`);
              }
              return (serverResult as Record<string, unknown>)[prop as string];
            },
          })
        : serverResult,
      client: clientResult,
    };

    return { data: protectedEnv };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

export function resolve<TServer extends SimpleEnvSchema, TClient extends SimpleEnvSchema>(
  config: ViteEnvConfig<TServer, TClient>,
  options: Omit<ViteOptions, 'async' | 'referenceHandlers'> = {}
): { server: InferSimpleSchema<TServer>; client: InferSimpleSchema<TClient> } {
  const result = resolveInternal(config, options);
  if ('error' in result) {
    throw new Error(result.error);
  }
  return result.data as { server: InferSimpleSchema<TServer>; client: InferSimpleSchema<TClient> };
}

export async function resolveAsyncFn<
  TServer extends SimpleEnvSchema,
  TClient extends SimpleEnvSchema,
>(
  config: ViteEnvConfig<TServer, TClient>,
  options: ViteOptions = {}
): Promise<{ server: InferSimpleSchema<TServer>; client: InferSimpleSchema<TClient> }> {
  const { clientPrefix = 'VITE_', runtimeProtection = true, referenceHandlers } = options;

  const prefixError = validatePrefixes(config, clientPrefix);
  if (prefixError) throw new Error(prefixError);

  const referenceOptions = referenceHandlers ? { handlers: referenceHandlers } : undefined;

  // Resolve server and client independently so they stay isolated
  const [serverResult, clientResult] = await Promise.all([
    resolveAsync({
      resolvers: [[dotenv(), config.server]],
      references: referenceOptions,
    }),
    resolveAsync({
      resolvers: [[dotenv(), config.client]],
      references: referenceOptions,
    }),
  ]);

  const isBrowser = createIsBrowser();

  return {
    server: runtimeProtection
      ? new Proxy(serverResult, {
          get(_target, prop) {
            if (isBrowser()) {
              throw new Error(`Cannot access server env var '${String(prop)}' in client code`);
            }
            return (serverResult as Record<string, unknown>)[prop as string];
          },
        })
      : serverResult,
    client: clientResult,
  } as { server: InferSimpleSchema<TServer>; client: InferSimpleSchema<TClient> };
}

export function safeResolve<TServer extends SimpleEnvSchema, TClient extends SimpleEnvSchema>(
  config: ViteEnvConfig<TServer, TClient>,
  options: Omit<ViteOptions, 'async' | 'referenceHandlers'> = {}
): SafeResolveResultType<{
  server: InferSimpleSchema<TServer>;
  client: InferSimpleSchema<TClient>;
}> {
  try {
    return { success: true, data: resolve(config, options) };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export const isServer = typeof window === 'undefined';
export const isClient = !isServer;
