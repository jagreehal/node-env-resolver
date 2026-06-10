/**
 * Bitwarden Secrets Manager resolver for node-env-resolver
 *
 * Supports fetching secrets from Bitwarden Secrets Manager using machine account access tokens.
 *
 * @example
 * ```ts
 * import { resolveAsync } from 'node-env-resolver';
 * import { bitwarden, createBitwardenHandler } from 'node-env-resolver-bitwarden';
 *
 * // Direct resolver usage
 * const config = await resolveAsync({
 *   resolvers: [
 *     [
 *       bitwarden({
 *         accessToken: process.env.BWS_ACCESS_TOKEN,
 *         secretId: '12345678-1234-1234-1234-123456789abc',
 *       }),
 *       { API_KEY: string() },
 *     ],
 *   ],
 * });
 *
 * // Reference handler usage
 * const config = await resolveAsync({
 *   resolvers: [[dotenv(), { API_KEY: string() }]],
 *   references: {
 *     handlers: {
 *       'bws': createBitwardenHandler({ accessToken: process.env.BWS_ACCESS_TOKEN }),
 *     },
 *   },
 * });
 * ```
 *
 * .env file with reference:
 * ```
 * API_KEY=bws://12345678-1234-1234-1234-123456789abc
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
import { deriveKeyFromAccessToken, decryptAes256CbcHmac } from './crypto.js';

// Re-export main functions for convenience
export { resolveAsync, safeResolveAsync };
export { processEnv } from 'node-env-resolver/resolvers';
export { deriveKeyFromAccessToken, decryptAes256CbcHmac, type CryptoKeyType } from './crypto.js';

interface BitwardenSecretResponse {
  id: string;
  organizationId: string;
  key: string;
  value: string;
  note: string;
  creationDate: string;
  revisionDate: string;
}

interface IdentityTokenResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
  encrypted_payload?: string;
}

type CryptoKeyType = import('./crypto.js').CryptoKeyType;

interface CachedAuth {
  jwt: string;
  orgEncKey: CryptoKeyType;
  orgMacKey: CryptoKeyType;
  expiresAt: number;
}

export interface BitwardenOptions {
  /** Bitwarden Secrets Manager access token (machine account) */
  accessToken: string;
  /** Secret UUID to fetch */
  secretId: string;
  /** Override target env key (defaults to Bitwarden secret key field) */
  envKey?: string;
  /** API URL - defaults to https://api.bitwarden.com */
  apiUrl?: string;
  /** Identity URL - defaults to https://identity.bitwarden.com */
  identityUrl?: string;
}

export interface BitwardenHandlerOptions {
  /** Bitwarden Secrets Manager access token (machine account) */
  accessToken: string;
  /** API URL - defaults to https://api.bitwarden.com */
  apiUrl?: string;
  /** Identity URL - defaults to https://identity.bitwarden.com */
  identityUrl?: string;
}

class BitwardenClient {
  private static readonly REQUEST_TIMEOUT_MS = 30_000;
  private accessToken: string;
  private apiUrl: string;
  private identityUrl: string;
  private cachedAuth?: CachedAuth;
  private authInFlight?: Promise<CachedAuth>;

  constructor(options: { accessToken: string; apiUrl?: string; identityUrl?: string }) {
    if (!options.accessToken || typeof options.accessToken !== 'string') {
      throw new Error('Bitwarden accessToken is required');
    }
    if (!options.accessToken.trim()) {
      throw new Error('Bitwarden accessToken cannot be empty');
    }
    this.accessToken = options.accessToken;
    this.apiUrl = options.apiUrl ?? 'https://api.bitwarden.com';
    this.identityUrl = options.identityUrl ?? 'https://identity.bitwarden.com';
  }

  /**
   * Parse the access token format: 0.<client_id>.<client_secret>:<encryption_key>
   */
  private parseAccessToken(token: string): {
    clientId: string;
    clientSecret: string;
    encryptionKey: string;
  } {
    const parts = token.split('.');
    if (parts.length !== 3 || parts[0] !== '0') {
      throw new Error(
        'Invalid access token format. Expected: 0.<client_id>.<client_secret>:<encryption_key>',
      );
    }

    // Split the last part by colon to separate client_secret from encryption_key
    const lastPart = parts[2];
    const colonIndex = lastPart.indexOf(':');
    if (colonIndex === -1) {
      throw new Error(
        'Invalid access token format. Expected: 0.<client_id>.<client_secret>:<encryption_key>',
      );
    }

    const clientId = parts[1];
    const clientSecret = lastPart.substring(0, colonIndex);
    const encryptionKey = lastPart.substring(colonIndex + 1);

    if (!clientId || !clientSecret || !encryptionKey) {
      throw new Error(
        'Invalid access token format. Expected: 0.<client_id>.<client_secret>:<encryption_key>',
      );
    }

    return { clientId, clientSecret, encryptionKey };
  }

  /**
   * Authenticate and get JWT + organization key
   * Uses authInFlight to prevent parallel secret resolution
   * from triggering multiple auth requests & getting rate limited
   */
  private async authenticate(): Promise<CachedAuth> {
    // Check cache
    if (this.cachedAuth && this.cachedAuth.expiresAt > Date.now()) {
      return this.cachedAuth;
    }

    // If auth is already in progress, wait for it
    if (this.authInFlight) {
      await this.authInFlight;
      if (this.cachedAuth && this.cachedAuth.expiresAt > Date.now()) {
        return this.cachedAuth;
      }
    }

    this.authInFlight = this.doAuthenticate();
    try {
      const result = await this.authInFlight;
      this.cachedAuth = result;
      return result;
    } finally {
      this.authInFlight = undefined;
    }
  }

  private async doAuthenticate(): Promise<CachedAuth> {
    const { clientId, clientSecret, encryptionKey } = this.parseAccessToken(this.accessToken);

    // Step 1: Exchange access token for JWT
    const tokenResponse = await this.fetchWithTimeout(`${this.identityUrl}/connect/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        scope: 'api.secrets',
        client_id: clientId,
        client_secret: clientSecret,
      }),
    });

    if (!tokenResponse.ok) {
      const error = await tokenResponse.text();
      throw this.handleAuthenticationError(tokenResponse.status, error);
    }

    const tokenData = (await tokenResponse.json()) as IdentityTokenResponse;
    const jwt = tokenData.access_token;

    if (!tokenData.encrypted_payload) {
      throw new Error('No encrypted_payload in identity response');
    }

    // Step 2: Derive key from encryption key
    const { encKey, macKey } = await deriveKeyFromAccessToken(encryptionKey);

    // Step 3: Decrypt the organization key
    const decryptedPayload = await decryptAes256CbcHmac(
      tokenData.encrypted_payload,
      encKey,
      macKey,
    );
    const payload = JSON.parse(decryptedPayload) as { encryptionKey: string };

    if (!payload.encryptionKey) {
      throw new Error('No encryptionKey in decrypted payload');
    }

    // The organization key is 64 bytes (32 enc + 32 mac)
    const { Buffer } = await import('node:buffer');
    const orgKeyBytes = Buffer.from(payload.encryptionKey, 'base64');

    if (orgKeyBytes.length !== 64) {
      throw new Error(`Expected 64-byte organization key, got ${orgKeyBytes.length} bytes`);
    }

    // Split into encryption and MAC keys
    const { webcrypto } = await import('node:crypto');
    const { subtle } = webcrypto;

    const orgEncKey = await subtle.importKey(
      'raw',
      orgKeyBytes.subarray(0, 32),
      { name: 'AES-CBC' },
      false,
      ['decrypt'],
    );

    const orgMacKey = await subtle.importKey(
      'raw',
      orgKeyBytes.subarray(32, 64),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify'],
    );

    // Cache for reuse (subtract 60s for safety margin)
    const authCache: CachedAuth = {
      jwt,
      orgEncKey,
      orgMacKey,
      expiresAt: Date.now() + (tokenData.expires_in - 60) * 1000,
    };

    return authCache;
  }

  async getSecret(secretId: string): Promise<{ key: string; value: string }> {
    // Validate UUID format
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidPattern.test(secretId)) {
      throw new Error(
        `Invalid secret ID format: "${secretId}". Secret ID must be a valid UUID (e.g., "12345678-1234-1234-1234-123456789abc")`,
      );
    }

    const auth = await this.authenticate();

    try {
      const response = await this.fetchWithTimeout(`${this.apiUrl}/secrets/${secretId}`, {
        headers: {
          Authorization: `Bearer ${auth.jwt}`,
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw this.handleSecretFetchError(response.status, secretId, errorText);
      }

      const data = (await response.json()) as BitwardenSecretResponse;

      if (!data?.value) {
        throw new Error(`Secret "${secretId}" has no value`);
      }

      // Decrypt the secret value
      const decryptedValue = await decryptAes256CbcHmac(data.value, auth.orgEncKey, auth.orgMacKey);
      return { key: data.key, value: decryptedValue };
    } catch (error) {
      throw this.handleRuntimeError(error, secretId);
    }
  }

  private async fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), BitwardenClient.REQUEST_TIMEOUT_MS);
    try {
      return await fetch(url, { ...init, signal: controller.signal });
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(
          `Request to Bitwarden timed out after ${BitwardenClient.REQUEST_TIMEOUT_MS}ms`,
          { cause: error },
        );
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  private handleAuthenticationError(status: number, details: string): Error {
    if (status === 400 || status === 401 || status === 403) {
      return new Error(
        `Authentication failed: ${details || `HTTP ${status}`}
${
  [
    'Verify accessToken is correct',
    'Check if the access token has expired or been revoked',
    'Ensure the machine account is not disabled',
  ].join('\n')
}`,
      );
    }
    return new Error(`Failed to authenticate with Bitwarden: ${details || `HTTP ${status}`}`);
  }

  private handleSecretFetchError(status: number, secretId: string, details: string): Error {
    if (status === 404) {
      return new Error(
        `Secret "${secretId}" not found
${
  [
    'Verify the secret ID is correct (must be a valid UUID)',
    'Check if the secret exists in your Bitwarden Secrets Manager',
    'Ensure your machine account has access to this secret or its project',
  ].join('\n')
}`,
      );
    }
    if (status === 401 || status === 403) {
      return new Error(
        `Access denied for secret "${secretId}"
${
  [
    'Verify your machine account has "Can read" or "Can read, write" permissions',
    'Check that the machine account has access to this secret or its project',
    'Review the role assignments in Bitwarden Secrets Manager',
  ].join('\n')
}`,
      );
    }
    return new Error(`Failed to fetch secret "${secretId}": ${details || `HTTP ${status}`}`);
  }

  private handleRuntimeError(error: unknown, secretId: string): Error {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes('timed out')) {
      return new Error(
        `Failed to fetch secret "${secretId}": ${message}
Check Bitwarden service status and your network connection`,
      );
    }
    if (
      message.includes('fetch failed') ||
      message.includes('network') ||
      message.includes('ECONNREFUSED') ||
      message.includes('ENOTFOUND')
    ) {
      return new Error(
        `Failed to fetch secret "${secretId}": network error
Check Bitwarden service status and your network connection`,
      );
    }
    if (error instanceof Error) {
      return error;
    }
    return new Error(`Failed to fetch secret "${secretId}": ${String(error)}`);
  }
}

/**
 * Create a Bitwarden resolver that fetches a secret by ID
 *
 * @example
 * ```ts
 * import { resolveAsync } from 'node-env-resolver';
 * import { bitwarden } from 'node-env-resolver-bitwarden';
 *
 * const config = await resolveAsync({
 *   resolvers: [
 *     [
 *       bitwarden({
 *         accessToken: process.env.BWS_ACCESS_TOKEN,
 *         secretId: '12345678-1234-1234-1234-123456789abc',
 *       }),
 *       { API_KEY: string() },
 *     ],
 *   ],
 * });
 * ```
 */
export function bitwarden(options: BitwardenOptions): Resolver {
  const client = new BitwardenClient({
    accessToken: options.accessToken,
    apiUrl: options.apiUrl,
    identityUrl: options.identityUrl,
  });

  return {
    name: `bitwarden(${options.secretId})`,
    async load() {
      try {
        const secret = await client.getSecret(options.secretId);
        const resolvedKey = options.envKey ?? secret.key;
        if (!resolvedKey) {
          throw new Error(`Secret "${options.secretId}" has no key`);
        }
        return { [resolvedKey]: secret.value };
      } catch (error) {
        throw new Error(
          `Bitwarden: ${error instanceof Error ? error.message : String(error)}`,
          { cause: error },
        );
      }
    },
  };
}

/**
 * Create a Bitwarden reference handler for URI-style references
 *
 * @example
 * ```ts
 * import { resolveAsync } from 'node-env-resolver';
 * import { createBitwardenHandler } from 'node-env-resolver-bitwarden';
 *
 * const config = await resolveAsync({
 *   resolvers: [[dotenv(), { API_KEY: string() }]],
 *   references: {
 *     handlers: {
 *       'bws': createBitwardenHandler({
 *         accessToken: process.env.BWS_ACCESS_TOKEN,
 *       }),
 *     },
 *   },
 * });
 * ```
 *
 * .env file:
 * ```
 * API_KEY=bws://12345678-1234-1234-1234-123456789abc
 * ```
 */
export function createBitwardenHandler(options: BitwardenHandlerOptions): ReferenceHandler {
  const client = new BitwardenClient({
    accessToken: options.accessToken,
    apiUrl: options.apiUrl,
    identityUrl: options.identityUrl,
  });

  return {
    name: 'bws',
    async resolve(reference) {
      // Parse bws://secret-id format
      const match = reference.match(/^bws:\/\/(.+)$/);
      if (!match) {
        throw new Error(
          `Invalid bws reference: "${reference}"\n` + `Expected format: bws://secret-uuid`,
        );
      }

      const secretId = match[1];
      const secret = await client.getSecret(secretId);

      return {
        value: secret.value,
        resolvedVia: 'bitwarden',
        metadata: {
          secretId,
          key: secret.key,
        },
      };
    },
  };
}

/** Pre-configured handler using BWS_ACCESS_TOKEN env var */
export function bitwardenHandlerFromEnv(): ReferenceHandler {
  const accessToken = process.env.BWS_ACCESS_TOKEN;
  if (!accessToken) {
    throw new Error('BWS_ACCESS_TOKEN environment variable is required for bitwardenHandlerFromEnv()');
  }
  return createBitwardenHandler({ accessToken });
}

/**
 * Resolve environment variables directly from Bitwarden Secrets Manager
 *
 * @example
 * ```ts
 * import { resolveBitwarden } from 'node-env-resolver-bitwarden';
 *
 * const config = await resolveBitwarden(
 *   {
 *     accessToken: process.env.BWS_ACCESS_TOKEN,
 *     secretId: '12345678-1234-1234-1234-123456789abc',
 *   },
 *   { API_KEY: string() }
 * );
 * ```
 */
export async function resolveBitwarden<T extends SimpleEnvSchema>(
  options: BitwardenOptions,
  schema: T,
  resolveOptions?: Partial<ResolveOptions>,
): Promise<InferSimpleSchema<T>> {
  return (await resolveAsync({
    resolvers: [[bitwarden(options), schema]],
    ...(resolveOptions ? { options: resolveOptions } : {}),
  })) as InferSimpleSchema<T>;
}

/**
 * Safe version of resolveBitwarden that returns a result object instead of throwing
 *
 * @example
 * ```ts
 * import { safeResolveBitwarden } from 'node-env-resolver-bitwarden';
 *
 * const result = await safeResolveBitwarden(
 *   {
 *     accessToken: process.env.BWS_ACCESS_TOKEN,
 *     secretId: '12345678-1234-1234-1234-123456789abc',
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
export async function safeResolveBitwarden<T extends SimpleEnvSchema>(
  options: BitwardenOptions,
  schema: T,
  resolveOptions?: Partial<ResolveOptions>,
): Promise<SafeResolveResultType<InferSimpleSchema<T>>> {
  try {
    const result = await safeResolveAsync({
      resolvers: [[bitwarden(options), schema]],
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
