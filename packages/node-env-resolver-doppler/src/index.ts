/**
 * Doppler resolver for node-env-resolver
 *
 * Supports fetching secrets from Doppler
 *
 * @example
 * ```ts
 * import { resolveAsync } from 'node-env-resolver';
 * import { doppler, createDopplerHandler } from 'node-env-resolver-doppler';
 *
 * const config = await resolveAsync({
 *   resolvers: [
 *     [
 *       doppler({
 *         serviceToken: process.env.DOPPLER_TOKEN,
 *         project: 'my-project',
 *         config: 'dev',
 *         secretName: 'API_KEY',
 *       }),
 *       { API_KEY: string() },
 *     ],
 *   ],
 * });
 *
 * // Reference handler
 * const config = await resolveAsync({
 *   resolvers: [[dotenv(), { API_KEY: string() }]],
 *   references: {
 *     handlers: {
 *       'doppler': createDopplerHandler({
 *         serviceToken: process.env.DOPPLER_TOKEN,
 *         project: 'my-project',
 *         config: 'dev',
 *       }),
 *     },
 *   },
 * });
 * ```
 *
 * .env file with reference:
 * ```
 * API_KEY=doppler://API_KEY
 * ```
 */

import type {
  Resolver,
  ReferenceHandler,
  SimpleEnvSchema,
  InferSimpleSchema,
  ResolveOptions,
  SafeResolveResultType,
} from 'node-env-resolver';
import { resolveAsync, safeResolveAsync } from 'node-env-resolver';

// Re-export main functions for convenience
export { resolveAsync, safeResolveAsync };
export { processEnv } from 'node-env-resolver/resolvers';

const DOPPLER_API_BASE = 'https://api.doppler.com/v3';

export interface DopplerOptions {
  /** Doppler service token */
  serviceToken: string;
  /** Doppler project name */
  project: string;
  /** Doppler config name (e.g., dev, stg, prd) */
  config: string;
  /** Secret name */
  secretName: string;
  /** Override target env key (defaults to secretName) */
  envKey?: string;
}

export interface DopplerHandlerOptions {
  /** Doppler service token */
  serviceToken: string;
  /** Doppler project name */
  project: string;
  /** Doppler config name */
  config: string;
}

interface DopplerSecret {
  raw: string;
  computed: string;
}

interface DopplerSecretsResponse {
  secrets: Record<string, DopplerSecret>;
}

class DopplerClient {
  private static readonly REQUEST_TIMEOUT_MS = 30_000;
  private serviceToken: string;
  private project: string;
  private config: string;
  private secretsCache?: Promise<Record<string, string>>;

  constructor(options: DopplerHandlerOptions) {
    if (!options.serviceToken?.trim()) {
      throw new Error('Doppler serviceToken is required');
    }
    if (!options.project?.trim()) {
      throw new Error('Doppler project is required');
    }
    if (!options.config?.trim()) {
      throw new Error('Doppler config is required');
    }
    this.serviceToken = options.serviceToken;
    this.project = options.project;
    this.config = options.config;
  }

  /**
   * Fetch all secrets for the project/config.
   * Results are cached so multiple secret lookups share a single API call.
   */
  private fetchAllSecrets(): Promise<Record<string, string>> {
    if (this.secretsCache) return this.secretsCache;

    this.secretsCache = this._fetchAllSecrets();
    // Clear cache on failure so retries can try again
    this.secretsCache.catch(() => {
      this.secretsCache = undefined;
    });
    return this.secretsCache;
  }

  private async _fetchAllSecrets(): Promise<Record<string, string>> {
    const url = new URL(`${DOPPLER_API_BASE}/configs/config/secrets`);
    url.searchParams.set('project', this.project);
    url.searchParams.set('config', this.config);

    const response = await this.fetchWithTimeout(url.toString(), {
      headers: {
        Authorization: `Bearer ${this.serviceToken}`,
      },
    });

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error(
          `Doppler authentication failed.
${
  [
    'Verify your service token is correct and not expired',
    `Project: ${this.project}`,
    `Config: ${this.config}`,
  ].join('\n')
}`,
        );
      }
      if (response.status === 403) {
        throw new Error(
          `Doppler access denied.
${
  [
    'Verify your service token has access to this project and config',
    'Service tokens are scoped to a specific config',
  ].join('\n')
}`,
        );
      }
      if (response.status === 404) {
        throw new Error(
          `Doppler project "${this.project}" or config "${this.config}" not found.`,
        );
      }
      const error = await response.text();
      throw new Error(`Failed to fetch secrets from Doppler: ${error || `HTTP ${response.status}`}`);
    }

    const data = (await response.json()) as DopplerSecretsResponse;

    const result: Record<string, string> = {};
    for (const [key, value] of Object.entries(data.secrets)) {
      result[key] = value.computed ?? value.raw;
    }

    return result;
  }

  async getSecret(secretName: string): Promise<string> {
    if (!secretName?.trim()) {
      throw new Error('Doppler secretName is required');
    }
    const secrets = await this.fetchAllSecrets();

    if (!(secretName in secrets)) {
      throw new Error(
        `Secret "${secretName}" not found in project "${this.project}" config "${this.config}"`,
      );
    }

    return secrets[secretName];
  }

  async getAllSecrets(): Promise<Record<string, string>> {
    return await this.fetchAllSecrets();
  }

  private async fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), DopplerClient.REQUEST_TIMEOUT_MS);
    try {
      return await fetch(url, { ...init, signal: controller.signal });
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(
          `Request to Doppler timed out after ${DopplerClient.REQUEST_TIMEOUT_MS}ms
Check Doppler service status and your network connection`,
          { cause: error },
        );
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
}

/**
 * Create a Doppler resolver that fetches a secret by name
 *
 * @example
 * ```ts
 * import { doppler } from 'node-env-resolver-doppler';
 *
 * const resolver = doppler({
 *   serviceToken: process.env.DOPPLER_TOKEN,
 *   project: 'my-project',
 *   config: 'dev',
 *   secretName: 'API_KEY',
 * });
 * ```
 */
export function doppler(options: DopplerOptions): Resolver {
  const client = new DopplerClient({
    serviceToken: options.serviceToken,
    project: options.project,
    config: options.config,
  });

  return {
    name: `doppler(${options.secretName})`,
    async load() {
      try {
        const value = await client.getSecret(options.secretName);
        const resolvedKey = options.envKey ?? options.secretName;
        return { [resolvedKey]: value };
      } catch (error) {
        throw new Error(
          `Doppler: ${error instanceof Error ? error.message : String(error)}`,
          { cause: error },
        );
      }
    },
  };
}

/**
 * Create a Doppler resolver that loads all secrets for a project/config.
 */
export function dopplerBulk(options: DopplerHandlerOptions): Resolver {
  const client = new DopplerClient(options);
  return {
    name: `dopplerBulk(${options.project}/${options.config})`,
    async load() {
      try {
        return await client.getAllSecrets();
      } catch (error) {
        throw new Error(
          `Doppler: ${error instanceof Error ? error.message : String(error)}`,
          { cause: error },
        );
      }
    },
  };
}

/**
 * Create a Doppler reference handler for URI-style references
 *
 * @example
 * ```ts
 * import { createDopplerHandler } from 'node-env-resolver-doppler';
 *
 * const handler = createDopplerHandler({
 *   serviceToken: process.env.DOPPLER_TOKEN,
 *   project: 'my-project',
 *   config: 'dev',
 * });
 *
 * // Reference: doppler://SECRET_NAME
 * const value = await handler.resolve('doppler://API_KEY');
 * ```
 */
export function createDopplerHandler(
  options: DopplerHandlerOptions,
): ReferenceHandler {
  const client = new DopplerClient(options);

  return {
    name: 'doppler',
    async resolve(reference) {
      // Parse doppler://secret-name format
      const match = reference.match(/^doppler:\/\/(.+)$/);
      if (!match) {
        throw new Error(
          `Invalid doppler reference: "${reference}"\n` +
            'Expected format: doppler://SECRET_NAME',
        );
      }

      const secretName = match[1];
      const value = await client.getSecret(secretName);

      return {
        value,
        resolvedVia: 'doppler',
        metadata: {
          secretName,
          project: options.project,
          config: options.config,
        },
      };
    },
  };
}

/** Pre-configured handler using DOPPLER_TOKEN env var */
export function dopplerHandlerFromEnv(
  project: string,
  config: string,
): ReferenceHandler {
  const serviceToken = process.env.DOPPLER_TOKEN;

  if (!serviceToken) {
    throw new Error(
      'DOPPLER_TOKEN environment variable is required for dopplerHandlerFromEnv()',
    );
  }

  return createDopplerHandler({
    serviceToken,
    project,
    config,
  });
}

/**
 * Resolve environment variables directly from Doppler
 *
 * @example
 * ```ts
 * import { resolveDoppler } from 'node-env-resolver-doppler';
 *
 * const config = await resolveDoppler(
 *   {
 *     serviceToken: process.env.DOPPLER_TOKEN,
 *     project: 'my-project',
 *     config: 'dev',
 *     secretName: 'API_KEY',
 *   },
 *   { API_KEY: string() }
 * );
 * ```
 */
export async function resolveDoppler<T extends SimpleEnvSchema>(
  options: DopplerOptions,
  schema: T,
  resolveOptions?: Partial<ResolveOptions>,
): Promise<InferSimpleSchema<T>> {
  return (await resolveAsync({
    resolvers: [[doppler(options), schema]],
    ...(resolveOptions ? { options: resolveOptions } : {}),
  })) as InferSimpleSchema<T>;
}

/**
 * Safe version of resolveDoppler that returns a result object instead of throwing
 *
 * @example
 * ```ts
 * import { safeResolveDoppler } from 'node-env-resolver-doppler';
 *
 * const result = await safeResolveDoppler(
 *   {
 *     serviceToken: process.env.DOPPLER_TOKEN,
 *     project: 'my-project',
 *     config: 'dev',
 *     secretName: 'API_KEY',
 *   },
 *   { API_KEY: string() }
 * );
 *
 * if (result.success) {
 *   console.log(result.data.API_KEY);
 * } else {
 *   console.error(result.error);
 * }
 * ```
 */
export async function safeResolveDoppler<T extends SimpleEnvSchema>(
  options: DopplerOptions,
  schema: T,
  resolveOptions?: Partial<ResolveOptions>,
): Promise<SafeResolveResultType<InferSimpleSchema<T>>> {
  try {
    const result = await safeResolveAsync({
      resolvers: [[doppler(options), schema]],
      ...(resolveOptions ? { options: resolveOptions } : {}),
    });

    if (result.success) {
      return { success: true, data: result.data as InferSimpleSchema<T> };
    }
    return result;
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
