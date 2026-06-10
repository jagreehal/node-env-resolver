/**
 * Infisical resolver for node-env-resolver
 *
 * Supports fetching secrets from Infisical (cloud or self-hosted)
 *
 * @example
 * ```ts
 * import { resolveAsync } from 'node-env-resolver';
 * import { infisical, createInfisicalHandler } from 'node-env-resolver-infisical';
 *
 * const config = await resolveAsync({
 *   resolvers: [
 *     [
 *       infisical({
 *         clientId: process.env.INFISICAL_CLIENT_ID,
 *         clientSecret: process.env.INFISICAL_CLIENT_SECRET,
 *         projectId: 'your-project-id',
 *         environment: 'dev',
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
 *       'infisical': createInfisicalHandler({
 *         clientId: process.env.INFISICAL_CLIENT_ID,
 *         clientSecret: process.env.INFISICAL_CLIENT_SECRET,
 *         projectId: 'your-project-id',
 *         environment: 'dev',
 *       }),
 *     },
 *   },
 * });
 * ```
 *
 * .env file with reference:
 * ```
 * API_KEY=infisical://API_KEY
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
import {
  type CredentialInput,
  requireCredential,
  resolveCredential,
  assertSecureUrl,
  fetchWithTimeout,
} from 'node-env-resolver/provider-kit';

// Re-export main functions for convenience
export { resolveAsync, safeResolveAsync };
export { processEnv } from 'node-env-resolver/resolvers';

export interface InfisicalOptions {
  /** Infisical Universal Auth Client ID */
  clientId: CredentialInput;
  /** Infisical Universal Auth Client Secret. A function lets it come from the OS
   *  keychain or a short-lived source instead of `process.env`. */
  clientSecret: CredentialInput;
  /** Infisical project ID */
  projectId: string;
  /** Environment (dev, staging, production, etc.) */
  environment: string;
  /** Secret name/path */
  secretName: string;
  /** Override target env key (defaults to secretName) */
  envKey?: string;
  /** Optional secret path (default: /) */
  secretPath?: string;
  /** Optional custom Infisical site URL (for self-hosted) */
  siteUrl?: string;
  /** Allow a non-https siteUrl (loopback is always allowed). Off by default. */
  allowInsecureHttp?: boolean;
}

export interface InfisicalHandlerOptions {
  /** Infisical Universal Auth Client ID */
  clientId: CredentialInput;
  /** Infisical Universal Auth Client Secret. A function lets it come from the OS
   *  keychain or a short-lived source instead of `process.env`. */
  clientSecret: CredentialInput;
  /** Infisical project ID */
  projectId: string;
  /** Environment (dev, staging, production, etc.) */
  environment: string;
  /** Optional default secret path (default: /) */
  secretPath?: string;
  /** Optional custom Infisical site URL */
  siteUrl?: string;
  /** Allow a non-https siteUrl (loopback is always allowed). Off by default. */
  allowInsecureHttp?: boolean;
}

interface InfisicalTokenResponse {
  accessToken: string;
  expiresIn: number;
  tokenType: string;
}

interface InfisicalSecretResponse {
  secretKey: string;
  secretValue: string;
}

class InfisicalClient {
  private clientId: CredentialInput;
  private clientSecret: CredentialInput;
  private projectId: string;
  private environment: string;
  private secretPath: string;
  private siteUrl: string;
  private accessToken?: string;
  private tokenExpiresAt?: number;
  private tokenInFlight?: Promise<string>;

  constructor(options: InfisicalHandlerOptions) {
    this.clientId = requireCredential(options.clientId, 'Infisical clientId');
    this.clientSecret = requireCredential(options.clientSecret, 'Infisical clientSecret');
    if (!options.projectId?.trim()) {
      throw new Error('Infisical projectId is required');
    }
    if (!options.environment?.trim()) {
      throw new Error('Infisical environment is required');
    }

    this.projectId = options.projectId;
    this.environment = options.environment;
    this.secretPath = options.secretPath || '/';
    this.siteUrl = (options.siteUrl || 'https://app.infisical.com').replace(/\/+$/, '');
    assertSecureUrl(this.siteUrl, 'Infisical siteUrl', options.allowInsecureHttp);
  }

  private async authenticate(): Promise<string> {
    // Check if token is still valid (with 60s buffer)
    if (this.accessToken && this.tokenExpiresAt && Date.now() < this.tokenExpiresAt - 60000) {
      return this.accessToken;
    }

    if (this.tokenInFlight) {
      return await this.tokenInFlight;
    }

    this.tokenInFlight = this.doAuthenticate();
    try {
      const token = await this.tokenInFlight;
      this.accessToken = token;
      return token;
    } finally {
      this.tokenInFlight = undefined;
    }
  }

  private async doAuthenticate(): Promise<string> {
    const url = `${this.siteUrl}/api/v1/auth/universal-auth/login`;
    const clientId = await resolveCredential(this.clientId, 'Infisical clientId');
    const clientSecret = await resolveCredential(this.clientSecret, 'Infisical clientSecret');

    const response = await fetchWithTimeout(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        clientId,
        clientSecret,
      }),
    }, 'Infisical');

    if (!response.ok) {
      const error = await response.text();
      if (response.status === 401 || response.status === 403) {
        throw new Error(
          `Infisical authentication failed: ${error || `HTTP ${response.status}`}
${
  [
    'Verify clientId and clientSecret are correct',
    'Check if the machine identity has access to this project',
    'If using self-hosted Infisical, verify siteUrl is correct',
  ].join('\n')
}`,
        );
      }
      throw new Error(`Infisical authentication failed: ${error || `HTTP ${response.status}`}`);
    }

    const data = (await response.json()) as InfisicalTokenResponse;
    this.accessToken = data.accessToken;
    this.tokenExpiresAt = Date.now() + data.expiresIn * 1000;

    return data.accessToken;
  }

  async getSecret(secretName: string, customPath?: string): Promise<string> {
    if (!secretName?.trim()) {
      throw new Error('Infisical secretName is required');
    }
    const accessToken = await this.authenticate();
    const path = customPath || this.secretPath;

    const url = new URL(`${this.siteUrl}/api/v3/secrets/raw/${encodeURIComponent(secretName)}`);
    url.searchParams.set('workspaceId', this.projectId);
    url.searchParams.set('environment', this.environment);
    url.searchParams.set('secretPath', path);

    const response = await fetchWithTimeout(url.toString(), {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }, 'Infisical');

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error(
          `Secret "${secretName}" not found in project "${this.projectId}" environment "${this.environment}"
${
  [
    'Verify the secret name, path, and environment are correct',
    `Project: ${this.projectId}`,
    `Environment: ${this.environment}`,
    `Path: ${path}`,
  ].join('\n')
}`,
        );
      }
      if (response.status === 403 || response.status === 401) {
        throw new Error(
          `Access denied for secret "${secretName}"
${
  [
    'Verify your machine identity has the correct permissions',
    'Check that the machine identity has access to this project and environment',
  ].join('\n')
}`,
        );
      }
      const error = await response.text();
      throw new Error(`Failed to fetch secret "${secretName}": ${error || `HTTP ${response.status}`}`);
    }

    const data = (await response.json()) as { secret: InfisicalSecretResponse };
    
    if (!data.secret?.secretValue) {
      throw new Error(`Secret "${secretName}" has no value`);
    }

    return data.secret.secretValue;
  }

}

/**
 * Create an Infisical resolver that fetches a secret by name
 *
 * @example
 * ```ts
 * import { infisical } from 'node-env-resolver-infisical';
 *
 * const resolver = infisical({
 *   clientId: process.env.INFISICAL_CLIENT_ID,
 *   clientSecret: process.env.INFISICAL_CLIENT_SECRET,
 *   projectId: 'your-project-id',
 *   environment: 'dev',
 *   secretName: 'API_KEY',
 * });
 * ```
 */
export function infisical(options: InfisicalOptions): Resolver {
  const client = new InfisicalClient({
    clientId: options.clientId,
    clientSecret: options.clientSecret,
    projectId: options.projectId,
    environment: options.environment,
    secretPath: options.secretPath,
    siteUrl: options.siteUrl,
    allowInsecureHttp: options.allowInsecureHttp,
  });

  return {
    name: `infisical(${options.secretName})`,
    async load() {
      try {
        const value = await client.getSecret(options.secretName);
        const resolvedKey = options.envKey ?? options.secretName;
        return { [resolvedKey]: value };
      } catch (error) {
        throw new Error(
          `Infisical: ${error instanceof Error ? error.message : String(error)}`,
          { cause: error },
        );
      }
    },
  };
}

/**
 * Create an Infisical reference handler for URI-style references
 *
 * @example
 * ```ts
 * import { createInfisicalHandler } from 'node-env-resolver-infisical';
 *
 * const handler = createInfisicalHandler({
 *   clientId: process.env.INFISICAL_CLIENT_ID,
 *   clientSecret: process.env.INFISICAL_CLIENT_SECRET,
 *   projectId: 'your-project-id',
 *   environment: 'dev',
 * });
 *
 * // Reference: infisical://SECRET_NAME
 * const value = await handler.resolve('infisical://API_KEY');
 * ```
 */
export function createInfisicalHandler(
  options: InfisicalHandlerOptions,
): ReferenceHandler {
  const client = new InfisicalClient(options);

  return {
    name: 'infisical',
    async resolve(reference) {
      // Parse infisical://secret-name format
      const match = reference.match(/^infisical:\/\/(.+)$/);
      if (!match) {
        throw new Error(
          `Invalid infisical reference: "${reference}"\n` +
            'Expected format: infisical://secret-name',
        );
      }

      const secretName = match[1];
      const value = await client.getSecret(secretName);

      return {
        value,
        resolvedVia: 'infisical',
        metadata: {
          secretName,
          projectId: options.projectId,
          environment: options.environment,
        },
      };
    },
  };
}

/** Pre-configured handler using environment variables */
export function infisicalHandlerFromEnv(
  projectId: string,
  environment: string,
  options?: Omit<InfisicalHandlerOptions, 'clientId' | 'clientSecret' | 'projectId' | 'environment'>,
): ReferenceHandler {
  const clientId = process.env.INFISICAL_CLIENT_ID;
  const clientSecret = process.env.INFISICAL_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error(
      'INFISICAL_CLIENT_ID and INFISICAL_CLIENT_SECRET environment variables are required',
    );
  }

  return createInfisicalHandler({
    clientId,
    clientSecret,
    projectId,
    environment,
    ...options,
  });
}

/**
 * Resolve environment variables directly from Infisical
 *
 * @example
 * ```ts
 * import { resolveInfisical } from 'node-env-resolver-infisical';
 *
 * const config = await resolveInfisical(
 *   {
 *     clientId: process.env.INFISICAL_CLIENT_ID,
 *     clientSecret: process.env.INFISICAL_CLIENT_SECRET,
 *     projectId: 'your-project-id',
 *     environment: 'dev',
 *     secretName: 'API_KEY',
 *   },
 *   { API_KEY: string() }
 * );
 * ```
 */
export async function resolveInfisical<T extends SimpleEnvSchema>(
  options: InfisicalOptions,
  schema: T,
  resolveOptions?: Partial<ResolveOptions>,
): Promise<InferSimpleSchema<T>> {
  return (await resolveAsync({
    resolvers: [[infisical(options), schema]],
    ...(resolveOptions ? { options: resolveOptions } : {}),
  })) as InferSimpleSchema<T>;
}

/**
 * Safe version of resolveInfisical that returns a result object instead of throwing
 *
 * @example
 * ```ts
 * import { safeResolveInfisical } from 'node-env-resolver-infisical';
 *
 * const result = await safeResolveInfisical(
 *   {
 *     clientId: process.env.INFISICAL_CLIENT_ID,
 *     clientSecret: process.env.INFISICAL_CLIENT_SECRET,
 *     projectId: 'your-project-id',
 *     environment: 'dev',
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
export async function safeResolveInfisical<T extends SimpleEnvSchema>(
  options: InfisicalOptions,
  schema: T,
  resolveOptions?: Partial<ResolveOptions>,
): Promise<SafeResolveResultType<InferSimpleSchema<T>>> {
  try {
    const result = await safeResolveAsync({
      resolvers: [[infisical(options), schema]],
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
