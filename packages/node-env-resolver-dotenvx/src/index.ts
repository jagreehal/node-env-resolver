/**
 * Dotenvx resolvers for node-env-resolver
 * Supports encrypted .env file loading via @dotenvx/dotenvx
 */

import { existsSync } from 'fs';
import { resolve as resolvePath } from 'path';
import { config as dotenvxConfig } from '@dotenvx/dotenvx';
import type {
  Resolver,
  SimpleEnvSchema,
  InferSimpleSchema,
  ResolveOptions,
  SafeResolveResultType,
} from 'node-env-resolver';
import { resolveAsync, safeResolveAsync } from 'node-env-resolver';

export { resolveAsync, safeResolveAsync } from 'node-env-resolver';
export { processEnv } from 'node-env-resolver/resolvers';

export {
  createKeychainHandler,
  keychainHandler,
  type KeychainHandlerOptions,
} from './handlers';

/**
 * Options for the dotenvx resolver
 */
export interface DotenvxOptions {
  /** Path to the encrypted .env file (default: '.env') */
  path?: string;
  /** Override existing env vars with values from the file (default: false) */
  overload?: boolean;
  /** Custom path to .env.keys file */
  envKeysFile?: string;
  /** Private key for decryption (can also be set via DOTENV_PRIVATE_KEY env var) */
  privateKey?: string;
}

interface DotenvxConfigResult {
  parsed?: Record<string, string>;
  error?: Error;
}

interface DotenvxDeps {
  existsSync: (path: string) => boolean;
  resolvePath: (...paths: string[]) => string;
  cwd: () => string;
  dotenvxConfig: (options: Record<string, unknown>) => DotenvxConfigResult;
  resolveAsync: (config: { resolvers: unknown; options?: unknown }) => Promise<Record<string, unknown>>;
  safeResolveAsync: (config: { resolvers: unknown; options?: unknown }) => Promise<{
    success: boolean;
    data?: Record<string, unknown>;
    error?: string;
  }>;
}

const defaultDeps: DotenvxDeps = {
  existsSync,
  resolvePath,
  cwd: () => process.cwd(),
  dotenvxConfig: (options) => dotenvxConfig(options),
  resolveAsync: async (config) => resolveAsync(config as never),
  safeResolveAsync: async (config) => safeResolveAsync(config as never),
};

function withDeps(overrides?: Partial<DotenvxDeps>): DotenvxDeps {
  return { ...defaultDeps, ...(overrides ?? {}) };
}

/**
 * Load configuration from encrypted .env files using dotenvx
 *
 * Decrypts .env files that were encrypted with `dotenvx encrypt`.
 * The decryption key can be provided via:
 * - privateKey option
 * - DOTENV_PRIVATE_KEY env var (or file-specific key like DOTENV_PRIVATE_KEY_STAGING)
 * - .env.keys file (default location or custom via envKeysFile option)
 *
 * @param options Path string or options object
 * @returns Resolver that loads and decrypts dotenvx-encrypted files
 *
 * @example
 * ```ts
 * import { resolveAsync } from 'node-env-resolver';
 * import { dotenvx } from 'node-env-resolver-dotenvx';
 *
 * // Load encrypted .env.local.secrets
 * const config = await resolveAsync({
 *   resolvers: [
 *     [dotenvx('.env.local.secrets'), { DB_PASSWORD: string() }]
 *   ]
 * });
 *
 * // With private key from OS keychain (see keychain handler)
 * process.env.DOTENV_PRIVATE_KEY = await getKeyFromKeychain();
 * const config = await resolveAsync({
 *   resolvers: [
 *     [dotenvx({ path: '.env.local.secrets', overload: true }), { DB_PASSWORD: string() }]
 *   ]
 * });
 * ```
 */
export function dotenvx(
  options?: string | DotenvxOptions,
  deps?: Partial<DotenvxDeps>,
): Resolver {
  const runtime = withDeps(deps);
  const opts =
    typeof options === 'string'
      ? { path: options, overload: false }
      : {
          path: options?.path ?? '.env',
          overload: options?.overload ?? false,
          envKeysFile: options?.envKeysFile,
          privateKey: options?.privateKey,
        };

  const name = `dotenvx(${opts.path})`;

  function loadEncrypted(): Record<string, string> {
    const filePath = runtime.resolvePath(runtime.cwd(), opts.path!);

    if (!runtime.existsSync(filePath)) {
      return {};
    }

    const configOptions: Record<string, unknown> = {
      path: filePath,
      processEnv: {} as Record<string, string>,
      quiet: true,
      noOps: true,
    };

    if (opts.overload) {
      configOptions.overload = true;
    }

    if (opts.envKeysFile) {
      configOptions.envKeysFile = opts.envKeysFile;
    }

    if (opts.privateKey) {
      configOptions.DOTENV_KEY = `dotenv://:key_${opts.privateKey}@dotenvx.com`;
    }

    const result = runtime.dotenvxConfig(configOptions);

    if (result.error) {
      throw new Error(
        `dotenvx: failed to load ${opts.path}: ${result.error.message}`,
        { cause: result.error },
      );
    }

    return (result.parsed as Record<string, string>) ?? {};
  }

  return {
    name,
    metadata: {
      watchPaths: opts.envKeysFile ? [opts.path!, opts.envKeysFile] : [opts.path!],
    },
    async load() {
      return loadEncrypted();
    },
    loadSync() {
      return loadEncrypted();
    },
  };
}

/**
 * Load multiple encrypted .env files in order (like the keychain pattern)
 *
 * Loads plain env files first (non-encrypted), then decrypts secrets file.
 * This matches the pattern from the dotenvx keychain blog post:
 * 1. Load .env.local (plain config)
 * 2. Load .env.local.secrets (encrypted by dotenvx)
 *
 * @param options Configuration for which files to load
 * @returns Resolver that loads and merges multiple env files
 *
 * @example
 * ```ts
 * import { resolveAsync } from 'node-env-resolver';
 * import { dotenvxKeychain } from 'node-env-resolver-dotenvx';
 *
 * const config = await resolveAsync({
 *   resolvers: [
 *     [dotenvxKeychain(), { DB_PASSWORD: string(), DEBUG: false }]
 *   ]
 * });
 * ```
 */
export function dotenvxKeychain(
  options?: {
    /** Path to plain env file (default: '.env.local') */
    plainPath?: string;
    /** Path to encrypted secrets file (default: '.env.local.secrets') */
    secretsPath?: string;
    /** Override env vars from secrets file (default: true — secrets override plain) */
    overload?: boolean;
    /** Private key for decryption */
    privateKey?: string;
    /** Custom path to .env.keys file */
    envKeysFile?: string;
  },
  deps?: Partial<DotenvxDeps>,
): Resolver {
  const runtime = withDeps(deps);
  const plainPath = options?.plainPath ?? '.env.local';
  const secretsPath = options?.secretsPath ?? '.env.local.secrets';
  const overload = options?.overload ?? true;

  return {
    name: `dotenvxKeychain(${plainPath}+${secretsPath})`,
    metadata: {
      watchPaths: options?.envKeysFile
        ? [plainPath, secretsPath, options.envKeysFile]
        : [plainPath, secretsPath],
    },
    async load() {
      const merged: Record<string, string> = {};

      const plainResolver = dotenvx({ path: plainPath, overload: false }, runtime);
      const plainEnv = await plainResolver.load!();
      Object.assign(merged, plainEnv);

      const secretsResolver = dotenvx({
        path: secretsPath,
        overload,
        privateKey: options?.privateKey,
        envKeysFile: options?.envKeysFile,
      }, runtime);
      const secretsEnv = await secretsResolver.load!();
      Object.assign(merged, secretsEnv);

      return merged;
    },
    loadSync() {
      const merged: Record<string, string> = {};

      const plainResolver = dotenvx({ path: plainPath, overload: false }, runtime);
      const plainEnv = plainResolver.loadSync!();
      Object.assign(merged, plainEnv);

      const secretsResolver = dotenvx({
        path: secretsPath,
        overload,
        privateKey: options?.privateKey,
        envKeysFile: options?.envKeysFile,
      }, runtime);
      const secretsEnv = secretsResolver.loadSync!();
      Object.assign(merged, secretsEnv);

      return merged;
    },
  };
}

/**
 * Resolve environment variables using dotenvx-encrypted files
 *
 * @example
 * ```ts
 * const config = await resolveDotenvx(
 *   { path: '.env.local.secrets' },
 *   { DB_PASSWORD: string(), API_KEY: string() }
 * );
 * ```
 */
export async function resolveDotenvx<T extends SimpleEnvSchema>(
  dotenvxOptions: string | DotenvxOptions,
  schema: T,
  resolveOptions?: Partial<ResolveOptions>,
  deps?: Partial<DotenvxDeps>,
): Promise<InferSimpleSchema<T>> {
  const runtime = withDeps(deps);
  return (await runtime.resolveAsync({
    resolvers: [[dotenvx(dotenvxOptions, runtime), schema]],
    ...(resolveOptions ? { options: resolveOptions } : {}),
  })) as InferSimpleSchema<T>;
}

/**
 * Safe version of resolveDotenvx that doesn't throw errors
 *
 * @example
 * ```ts
 * const result = await safeResolveDotenvx(
 *   { path: '.env.local.secrets' },
 *   { DB_PASSWORD: string() }
 * );
 *
 * if (result.success) {
 *   console.log(result.data.DB_PASSWORD);
 * } else {
 *   console.error(result.error);
 * }
 * ```
 */
export async function safeResolveDotenvx<T extends SimpleEnvSchema>(
  dotenvxOptions: string | DotenvxOptions,
  schema: T,
  resolveOptions?: Partial<ResolveOptions>,
  deps?: Partial<DotenvxDeps>,
): Promise<SafeResolveResultType<InferSimpleSchema<T>>> {
  const runtime = withDeps(deps);
  try {
    const result = await runtime.safeResolveAsync({
      resolvers: [[dotenvx(dotenvxOptions, runtime), schema]],
      ...(resolveOptions ? { options: resolveOptions } : {}),
    });

    if (result.success) {
      return { success: true, data: (result.data ?? {}) as InferSimpleSchema<T> };
    }
    return {
      success: false,
      error: result.error ?? 'Unknown safeResolveAsync error',
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
