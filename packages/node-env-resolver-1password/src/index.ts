/**
 * 1Password resolver for node-env-resolver
 *
 * Supports fetching secrets from 1Password via:
 * - Service Account Token (1Password SDK)
 * - Connect Server (REST API)
 * - CLI (desktop app auth)
 *
 * @example
 * ```ts
 * import { resolveAsync } from 'node-env-resolver';
 * import { onePassword, createOnePasswordHandler } from 'node-env-resolver-1password';
 *
 * // Using service account token
 * const config = await resolveAsync({
 *   resolvers: [
 *     [
 *       onePassword({
 *         serviceAccountToken: process.env.OP_SERVICE_ACCOUNT_TOKEN,
 *         reference: 'op://vault/item/field',
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
 *       'op': createOnePasswordHandler({ serviceAccountToken: process.env.OP_SERVICE_ACCOUNT_TOKEN }),
 *     },
 *   },
 * });
 * ```
 *
 * .env file with reference:
 * ```
 * API_KEY=op://vault/item/field
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
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

// Re-export main functions for convenience
export { resolveAsync, safeResolveAsync };
export { processEnv } from 'node-env-resolver/resolvers';

export interface OnePasswordOptions {
  /** 1Password service account token (starts with ops_) */
  serviceAccountToken?: string;
  /** Connect server URL (for self-hosted Connect) */
  connectHost?: string;
  /** Connect server token */
  connectToken?: string;
  /** 1Password reference: op://vault/item/field */
  reference: string;
  /** Override target env key (defaults to reference field) */
  envKey?: string;
  /** Optional account shorthand or ID */
  account?: string;
  /** If true, allow using 1Password desktop app via CLI */
  allowAppAuth?: boolean;
}

export interface OnePasswordHandlerOptions {
  /** 1Password service account token */
  serviceAccountToken?: string;
  /** Connect server URL */
  connectHost?: string;
  /** Connect server token */
  connectToken?: string;
  /** Optional account shorthand */
  account?: string;
  /** Allow desktop app auth via CLI */
  allowAppAuth?: boolean;
}

interface ConnectField {
  id: string;
  label?: string;
  value?: string;
  type?: string;
  purpose?: string;
  section?: { id: string };
}

interface ConnectItem {
  id: string;
  title?: string;
  fields?: Array<ConnectField>;
  sections?: Array<{ id: string; label?: string }>;
}

interface ConnectVault {
  id: string;
  name?: string;
}

const execFileAsync = promisify(execFile);

/** Parse op://vault/item/[section/]field reference */
function parseOpReference(ref: string): {
  vault: string;
  item: string;
  section?: string;
  field: string;
} {
  if (!ref.startsWith('op://')) {
    throw new Error(
      `Invalid 1Password reference: "${ref}"\n` +
        'Expected format: op://vault/item/field or op://vault/item/section/field',
    );
  }
  const stripped = ref.replace(/^op:\/\//, '');
  const parts = stripped.split('/');
  if (parts.length === 3) {
    return { vault: parts[0], item: parts[1], field: parts[2] };
  } else if (parts.length === 4) {
    return {
      vault: parts[0],
      item: parts[1],
      section: parts[2],
      field: parts[3],
    };
  }
  throw new Error(
    `Invalid op:// reference format: "${ref}"\n` +
      'Expected format: op://vault/item/field or op://vault/item/section/field',
  );
}

class OnePasswordClient {
  private static readonly REQUEST_TIMEOUT_MS = 30_000;
  private serviceAccountToken?: string;
  private connectHost?: string;
  private connectToken?: string;
  private account?: string;
  private allowAppAuth?: boolean;

  // Cache for Connect server
  private vaultIdCache = new Map<string, string>();
  private itemIdCache = new Map<string, string>();

  constructor(options: OnePasswordHandlerOptions) {
    this.serviceAccountToken = options.serviceAccountToken;
    this.connectHost = options.connectHost;
    this.connectToken = options.connectToken;
    this.account = options.account;
    this.allowAppAuth = options.allowAppAuth;
    if (!this.isConnect && !this.serviceAccountToken && !this.allowAppAuth) {
      throw new Error(
        'No authentication method configured. Provide serviceAccountToken, connectHost+connectToken, or set allowAppAuth=true.',
      );
    }
  }

  private get isConnect(): boolean {
    return !!(this.connectHost && this.connectToken);
  }

  private async connectRequest<T>(path: string): Promise<T> {
    if (!this.connectHost || !this.connectToken) {
      throw new Error('Connect server not configured');
    }

    const url = `${this.connectHost}/v1${path}`;
    const res = await this.fetchWithTimeout(url, {
      headers: {
        Authorization: `Bearer ${this.connectToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(
        `1Password Connect API error (${res.status}): ${body || res.statusText}
${
  [
    `Request: GET ${path}`,
    'Verify your Connect server URL and token are correct',
    'Check that the Connect server is running and reachable',
  ].join('\n')
}`,
      );
    }
    return res.json() as Promise<T>;
  }

  private async connectResolveVaultId(vaultQuery: string): Promise<string> {
    if (this.vaultIdCache.has(vaultQuery)) {
      return this.vaultIdCache.get(vaultQuery)!;
    }

    // Try direct ID lookup first
    try {
      const vault = await this.connectRequest<ConnectVault>(
        `/vaults/${encodeURIComponent(vaultQuery)}`,
      );
      this.vaultIdCache.set(vaultQuery, vault.id);
      return vault.id;
    } catch {
      // fall through to title search
    }

    // Search by title
    const escapedVault = vaultQuery.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    const vaults = await this.connectRequest<Array<ConnectVault>>(
      `/vaults?filter=${encodeURIComponent(`name eq "${escapedVault}"`)}`,
    );
    if (!vaults.length) {
      throw new Error(`1Password Connect: vault "${vaultQuery}" not found`);
    }
    this.vaultIdCache.set(vaultQuery, vaults[0].id);
    return vaults[0].id;
  }

  private async connectResolveItemId(
    vaultId: string,
    itemQuery: string,
  ): Promise<string> {
    const cacheKey = `${vaultId}/${itemQuery}`;
    if (this.itemIdCache.has(cacheKey)) {
      return this.itemIdCache.get(cacheKey)!;
    }

    // Try direct ID lookup first
    try {
      const item = await this.connectRequest<ConnectItem>(
        `/vaults/${vaultId}/items/${encodeURIComponent(itemQuery)}`,
      );
      this.itemIdCache.set(cacheKey, item.id);
      return item.id;
    } catch {
      // fall through to title search
    }

    // Search by title
    const escapedItem = itemQuery.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    const items = await this.connectRequest<Array<{ id: string; title?: string }>>(
      `/vaults/${vaultId}/items?filter=${encodeURIComponent(`title eq "${escapedItem}"`)}`,
    );
    if (!items.length) {
      throw new Error(
        `1Password Connect: item "${itemQuery}" not found in vault`,
      );
    }
    this.itemIdCache.set(cacheKey, items[0].id);
    return items[0].id;
  }

  private connectExtractField(
    item: ConnectItem,
    sectionQuery: string | undefined,
    fieldQuery: string,
  ): string {
    const fields = item.fields || [];
    const sections = item.sections || [];

    let sectionId: string | undefined;
    if (sectionQuery) {
      const section = sections.find(
        (s) =>
          s.id === sectionQuery ||
          s.label?.toLowerCase() === sectionQuery.toLowerCase(),
      );
      if (!section) {
        throw new Error(
          `1Password Connect: section "${sectionQuery}" not found in item "${item.title || item.id}"`,
        );
      }
      sectionId = section.id;
    }

    const candidates = sectionId
      ? fields.filter((f) => f.section?.id === sectionId)
      : fields;

    const field = candidates.find(
      (f) =>
        f.id === fieldQuery ||
        f.label?.toLowerCase() === fieldQuery.toLowerCase(),
    );

    if (!field) {
      throw new Error(
        `1Password Connect: field "${fieldQuery}" not found in item "${item.title || item.id}"`,
      );
    }

    return field.value ?? '';
  }

  async getSecret(reference: string): Promise<string> {
    // Validate service account token format if provided
    if (
      this.serviceAccountToken &&
      !this.serviceAccountToken.startsWith('ops_')
    ) {
      throw new Error(
        'Invalid service account token format. Token must start with "ops_"',
      );
    }

    if (this.isConnect) {
      // Use Connect server REST API
      const parsed = parseOpReference(reference);
      const vaultId = await this.connectResolveVaultId(parsed.vault);
      const itemId = await this.connectResolveItemId(vaultId, parsed.item);
      const fullItem = await this.connectRequest<ConnectItem>(
        `/vaults/${vaultId}/items/${itemId}`,
      );
      return this.connectExtractField(fullItem, parsed.section, parsed.field);
    } else if (this.serviceAccountToken || this.allowAppAuth) {
      return await this.readWithCli(reference);
    } else {
      throw new Error(
        'No authentication method configured. Provide serviceAccountToken, connectHost+connectToken, or set allowAppAuth=true.',
      );
    }
  }

  private async readWithCli(reference: string): Promise<string> {
    const env: Record<string, string> = { ...process.env } as Record<string, string>;
    if (this.serviceAccountToken) {
      env.OP_SERVICE_ACCOUNT_TOKEN = this.serviceAccountToken;
    }
    const args = [
      'read',
      '--force',
      '--no-newline',
      ...(this.account ? ['--account', this.account] : []),
      reference,
    ];

    try {
      const result = await execFileAsync('op', args, {
        env,
        timeout: OnePasswordClient.REQUEST_TIMEOUT_MS,
        maxBuffer: 1024 * 1024,
      });
      if (typeof result === 'string') {
        return result;
      }
      return result.stdout;
    } catch (error) {
      const err = error as Error & { stderr?: string; code?: string | number };
      if (err.code === 'ENOENT') {
        throw new Error(
          `1Password CLI \`op\` not found.
Install it from https://developer.1password.com/docs/cli/get-started/`,
          { cause: error },
        );
      }
      const stderr = err.stderr?.trim() || String(err.message || error);
      if (/not found|does not have a field|isn['’]t a vault|could not find item/i.test(stderr)) {
        throw new Error(`1Password reference not found: ${stderr}`, { cause: error });
      }
      if (/authorization prompt dismissed|not currently signed in|unauthorized/i.test(stderr)) {
        throw new Error(
          `1Password authentication failed: ${stderr}
${
  [
    'If using service account auth, verify OP_SERVICE_ACCOUNT_TOKEN',
    'If using app auth, run `op whoami` and sign in first',
  ].join('\n')
}`,
          { cause: error },
        );
      }
      if (/timed out/i.test(stderr)) {
        throw new Error('1Password CLI request timed out', { cause: error });
      }
      throw new Error(`1Password CLI error: ${stderr}`, { cause: error });
    }
  }

  private async fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), OnePasswordClient.REQUEST_TIMEOUT_MS);
    try {
      return await fetch(url, { ...init, signal: controller.signal });
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(
          `1Password Connect request timed out after ${OnePasswordClient.REQUEST_TIMEOUT_MS}ms`,
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
 * Create a 1Password resolver that fetches a secret by reference
 *
 * @example
 * ```ts
 * import { onePassword } from 'node-env-resolver-1password';
 *
 * const resolver = onePassword({
 *   serviceAccountToken: process.env.OP_SERVICE_ACCOUNT_TOKEN,
 *   reference: 'op://vault/item/field',
 * });
 * ```
 */
export function onePassword(options: OnePasswordOptions): Resolver {
  const client = new OnePasswordClient({
    serviceAccountToken: options.serviceAccountToken,
    connectHost: options.connectHost,
    connectToken: options.connectToken,
    account: options.account,
    allowAppAuth: options.allowAppAuth,
  });

  return {
    name: `1password(${options.reference})`,
    async load() {
      try {
        const value = await client.getSecret(options.reference);
        const parsed = parseOpReference(options.reference);
        const resolvedKey = options.envKey ?? parsed.field;
        return { [resolvedKey]: value };
      } catch (error) {
        throw new Error(
          `1Password: ${error instanceof Error ? error.message : String(error)}`,
          { cause: error },
        );
      }
    },
  };
}

/**
 * Create a 1Password reference handler for URI-style references
 *
 * @example
 * ```ts
 * import { createOnePasswordHandler } from 'node-env-resolver-1password';
 *
 * const handler = createOnePasswordHandler({
 *   serviceAccountToken: process.env.OP_SERVICE_ACCOUNT_TOKEN,
 * });
 *
 * // Reference: op://vault/item/field
 * const value = await handler.resolve('op://vault/item/field');
 * ```
 */
export function createOnePasswordHandler(
  options: OnePasswordHandlerOptions,
): ReferenceHandler {
  const client = new OnePasswordClient(options);

  return {
    name: 'op',
    async resolve(reference) {
      // Validate op:// format
      if (!reference.startsWith('op://')) {
        throw new Error(
          `Invalid 1Password reference: "${reference}"\n` +
            'Expected format: op://vault/item/field or op://vault/item/section/field',
        );
      }

      const value = await client.getSecret(reference);
      const parsed = parseOpReference(reference);

      return {
        value,
        resolvedVia: '1password',
        metadata: {
          vault: parsed.vault,
          item: parsed.item,
          field: parsed.field,
          ...(parsed.section && { section: parsed.section }),
        },
      };
    },
  };
}

/** Pre-configured handler using OP_SERVICE_ACCOUNT_TOKEN env var */
export function onePasswordHandlerFromEnv(): ReferenceHandler {
  const serviceAccountToken = process.env.OP_SERVICE_ACCOUNT_TOKEN;
  const connectHost = process.env.OP_CONNECT_HOST;
  const connectToken = process.env.OP_CONNECT_TOKEN;

  if (!serviceAccountToken && !(connectHost && connectToken)) {
    throw new Error(
      'OP_SERVICE_ACCOUNT_TOKEN or OP_CONNECT_HOST+OP_CONNECT_TOKEN environment variables are required',
    );
  }

  return createOnePasswordHandler({
    serviceAccountToken,
    connectHost,
    connectToken,
  });
}

/**
 * Resolve environment variables directly from 1Password
 *
 * @example
 * ```ts
 * import { resolveOnePassword } from 'node-env-resolver-1password';
 *
 * const config = await resolveOnePassword(
 *   {
 *     serviceAccountToken: process.env.OP_SERVICE_ACCOUNT_TOKEN,
 *     reference: 'op://vault/item/field',
 *   },
 *   { API_KEY: string() }
 * );
 * ```
 */
export async function resolveOnePassword<T extends SimpleEnvSchema>(
  options: OnePasswordOptions,
  schema: T,
  resolveOptions?: Partial<ResolveOptions>,
): Promise<InferSimpleSchema<T>> {
  return (await resolveAsync({
    resolvers: [[onePassword(options), schema]],
    ...(resolveOptions ? { options: resolveOptions } : {}),
  })) as InferSimpleSchema<T>;
}

/**
 * Safe version of resolveOnePassword that returns a result object instead of throwing
 *
 * @example
 * ```ts
 * import { safeResolveOnePassword } from 'node-env-resolver-1password';
 *
 * const result = await safeResolveOnePassword(
 *   {
 *     serviceAccountToken: process.env.OP_SERVICE_ACCOUNT_TOKEN,
 *     reference: 'op://vault/item/field',
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
export async function safeResolveOnePassword<T extends SimpleEnvSchema>(
  options: OnePasswordOptions,
  schema: T,
  resolveOptions?: Partial<ResolveOptions>,
): Promise<SafeResolveResultType<InferSimpleSchema<T>>> {
  try {
    const result = await safeResolveAsync({
      resolvers: [[onePassword(options), schema]],
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
