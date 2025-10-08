/**
 * Type-safe environment variable resolver
 * 
 * @example
 * ```typescript
 * import { resolve } from 'node-env-resolver';
 * 
 * const config = await resolve({
 *   PORT: 3000,                              // number with default
 *   DATABASE_URL: 'url',                    // required secret url
 *   NODE_ENV: ['development', 'production'], // enum
 *   DEBUG: false,                            // boolean with default
 *   API_KEY: 'string?',                      // optional string
 * });
 * ```
 */

import type {
  EnvSchema,
  Resolver,
  ResolveOptions,
  SimpleEnvSchema,
  InferSimpleSchema,
} from './types';
// Re-export all types
export type {
  EnvDefinition,
  EnvSchema,
  Resolver,
  ResolveOptions,
  Provenance,
  PolicyOptions,
  SimpleEnvValue,
  SimpleEnvSchema,
  InferType,
  InferSchema,
  InferSimpleSchema,
} from './types';
// Re-export audit types and functions
export { getAuditLog, clearAuditLog, type AuditEvent, type AuditEventType } from './audit';
// Import resolver functions
import { normalizeSchema, resolveEnvInternal, resolveEnvInternalSync } from './resolver';
// Import and re-export built-in resolvers
import { dotenv, processEnv, type DotenvOptions } from './resolvers';export { dotenv, processEnv, type DotenvOptions };

// Import type helper from builder
import { type MergeSchemas } from './builder';
// Re-export utility resolvers
export { cached, retry, TTL, awsCache, type CacheOptions } from './utils';
// Re-export Standard Schema integration
export { 
  toStandardSchema, 
  schemaToStandardSchema, 
  validateWithStandardSchema, 
  validateEnvWithStandardSchema,
  type StandardSchemaEnvDefinition,
  type StandardSchemaEnvSchema 
} from './standard-schema';
// Cloud resolvers are available as separate packages, e.g. node-env-resolver/aws

// Helper to build default resolvers (just processEnv)
function buildDefaultResolvers(): Resolver[] {
  // Only use process.env for consistency across all environments
  // Users can explicitly add dotenv() if they want .env file support
  return [processEnv()];
}

// Type helper to filter options from tuple
type FilterOptions<T extends ReadonlyArray<unknown>> =
  T extends readonly [infer First, ...infer Rest]
    ? First extends readonly [Resolver, SimpleEnvSchema]
      ? readonly [First, ...FilterOptions<Rest>]
      : FilterOptions<Rest>
    : readonly [];

// Type helper to merge tuple schemas (last wins)
type MergeTupleSchemas<T extends ReadonlyArray<unknown>> =
  T extends readonly [infer First, ...infer Rest]
    ? First extends readonly [Resolver, infer Schema extends SimpleEnvSchema]
      ? Rest extends ReadonlyArray<unknown>
        ? Rest['length'] extends 0
          ? InferSimpleSchema<Schema>
          : MergeSchemas<InferSimpleSchema<Schema>, MergeTupleSchemas<Rest>>
        : InferSimpleSchema<Schema>
      : never
    : Record<string, never>;

// Safe resolve result types (Zod-like)
export interface SafeResolveResult<T> {
  success: true;
  data: T;
}

export interface SafeResolveError {
  success: false;
  error: string;
  errors?: string[];
}

export type SafeResolveResultType<T> = SafeResolveResult<T> | SafeResolveError;

// Type guard to check if an argument is options (plain object without provider)
function isOptions(arg: unknown): arg is Partial<ResolveOptions> {
  if (!arg || typeof arg !== 'object' || Array.isArray(arg)) return false;
  // Options won't have a provider in the first position
  return !('load' in (arg as object));
}

/**
 * Resolve environment variables with smart defaults
 *
 * @example
 * ```typescript
 * // Simple usage - local vars only
 * const config = await resolve({
 *   PORT: 3000,                    // number with default
 *   DATABASE_URL: 'url',          // required secret url
 *   NODE_ENV: ['dev', 'prod'],     // enum
 *   FEATURE_FLAG: 'string?',       // optional string
 * });
 *
 * // Multiple resolvers with resolve.with()
 * const config = await resolve.with(
 *   [processEnv(), { PORT: 3000, NODE_ENV: ['dev', 'prod'] as const }],
 *   [awsSecrets({ region: 'us-east-1' }), { DATABASE_URL: 'url' }],
 *   [databaseResolver, { FEATURE_FLAGS: 'json' }]
 * );
 * ```
 */
async function resolveImpl<T extends SimpleEnvSchema>(
  schema: T,
  options?: Partial<ResolveOptions>
): Promise<InferSimpleSchema<T>> {
  const isProduction = (process.env.NODE_ENV || '').toLowerCase() === 'production';
  const defaultResolvers = buildDefaultResolvers();

  // Default policies: secure by default (block dotenv in production unless explicitly allowed)
  const defaultPolicies = options?.policies ?? {};

  const resolveOptions: ResolveOptions = {
    resolvers: defaultResolvers,
    interpolate: true,
    strict: true,
    enableAudit: isProduction,
    policies: defaultPolicies,
    ...options,
  };

  const normalizedSchema = normalizeSchema(schema);
  const result = await resolveEnvInternal(normalizedSchema, resolveOptions);

  return result as InferSimpleSchema<T>;
}

/**
 * Resolve with multiple resolvers using tuple syntax
 *
 * @example
 * ```typescript
 * const config = await resolve.with(
 *   [processEnv(), { PORT: 3000 }],
 *   [awsSecrets({ region: 'us-east-1' }), { DATABASE_URL: 'url' }],
 *   { strict: true } // Optional: options as last arg
 * );
 * ```
 */
resolveImpl.with = async function resolveWith<
  const T extends ReadonlyArray<readonly [Resolver, SimpleEnvSchema] | Partial<ResolveOptions>>
>(
  ...args: T
): Promise<MergeTupleSchemas<FilterOptions<T>>> {
  const isProduction = (process.env.NODE_ENV || '').toLowerCase() === 'production';

  // Separate tuples from options
  const tuples = args.filter((arg): arg is readonly [Resolver, SimpleEnvSchema] =>
    Array.isArray(arg) && arg.length === 2
  );
  const options = args.find(isOptions);

  // Build merged schema (last wins)
  const mergedSchema: EnvSchema = {};
  for (const [, schema] of tuples) {
    const normalized = normalizeSchema(schema);
    Object.assign(mergedSchema, normalized);
  }

  // Build resolvers list from tuples
  const resolvers = tuples.map(([provider]) => provider);

  const resolveOptions: ResolveOptions = {
    resolvers,
    interpolate: true,
    strict: true,
    enableAudit: isProduction,
    ...options,
  };

  const result = await resolveEnvInternal(mergedSchema, resolveOptions);
  return result as MergeTupleSchemas<FilterOptions<T>>;
};

// Safe resolve implementation (doesn't throw, returns result object)
async function safeResolveImpl<T extends SimpleEnvSchema>(
  schema: T,
  options?: Partial<ResolveOptions>
): Promise<SafeResolveResultType<InferSimpleSchema<T>>> {
  const isProduction = (process.env.NODE_ENV || '').toLowerCase() === 'production';
  const defaultResolvers = buildDefaultResolvers();

  // Default policies: secure by default (block dotenv in production unless explicitly allowed)
  const defaultPolicies = options?.policies ?? {};

  const resolveOptions: ResolveOptions = {
    resolvers: defaultResolvers,
    interpolate: true,
    strict: true,
    enableAudit: isProduction,
    policies: defaultPolicies,
    ...options,
  };

  const normalizedSchema = normalizeSchema(schema);

  try {
    const result = await resolveEnvInternal(normalizedSchema, resolveOptions);
    return { success: true, data: result as InferSimpleSchema<T> };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

/**
 * Safe resolve with multiple resolvers using tuple syntax (doesn't throw)
 *
 * @example
 * ```typescript
 * // Returns { success: true, data: {...} } or { success: false, error: "..." }
 * const result = await safeResolve.with(
 *   [processEnv(), { PORT: 3000 }],
 *   [awsSecrets({ region: 'us-east-1' }), { DATABASE_URL: 'url' }]
 * );
 *
 * if (result.success) {
 *   console.log(result.data.PORT); // Type-safe access
 * } else {
 *   console.error(result.error); // Detailed error message
 * }
 * ```
 */
safeResolveImpl.with = async function safeResolveWith<
  const T extends ReadonlyArray<readonly [Resolver, SimpleEnvSchema] | Partial<ResolveOptions>>
>(
  ...args: T
): Promise<SafeResolveResultType<MergeTupleSchemas<FilterOptions<T>>>> {
  const isProduction = (process.env.NODE_ENV || '').toLowerCase() === 'production';

  // Separate tuples from options
  const tuples = args.filter((arg): arg is readonly [Resolver, SimpleEnvSchema] =>
    Array.isArray(arg) && arg.length === 2
  );
  const options = args.find(isOptions);

  // Build merged schema (last wins)
  const mergedSchema: EnvSchema = {};
  for (const [, schema] of tuples) {
    const normalized = normalizeSchema(schema);
    Object.assign(mergedSchema, normalized);
  }

  // Build resolvers list from tuples
  const resolvers = tuples.map(([provider]) => provider);

  const resolveOptions: ResolveOptions = {
    resolvers,
    interpolate: true,
    strict: true,
    enableAudit: isProduction,
    ...options,
  };

  try {
    const result = await resolveEnvInternal(mergedSchema, resolveOptions);
    return { success: true, data: result as MergeTupleSchemas<FilterOptions<T>> };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
};

/**
 * Synchronous safe resolve (doesn't throw, returns result object)
 */
function safeResolveSyncImpl<T extends SimpleEnvSchema>(
  schema: T,
  options?: Partial<ResolveOptions>
): SafeResolveResultType<InferSimpleSchema<T>> {
  // Validate that schema doesn't contain async validators (Zod/Valibot/etc)
  for (const [key, value] of Object.entries(schema)) {
    // Check if value is a Standard Schema (has ~standard property)
    if (value && typeof value === 'object' && '~standard' in value) {
      return {
        success: false,
        error: `❌ safeResolveSync() cannot be used with async validators.\n` +
               `   Variable '${key}' uses a Standard Schema validator (Zod, Valibot, etc.)\n` +
               `   💡 Use safeResolve() instead, or use shorthand syntax for sync validation.`
      };
    }
  }

  const defaultResolvers = buildDefaultResolvers();

  const resolveOptions: ResolveOptions = {
    resolvers: defaultResolvers,
    interpolate: true,
    strict: true,
    ...options,
  };

  const normalizedSchema = normalizeSchema(schema);

  try {
    const result = resolveEnvInternalSync(normalizedSchema, resolveOptions);
    return { success: true, data: result as InferSimpleSchema<T> };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

/**
 * Synchronous safe resolve with multiple resolvers using tuple syntax (doesn't throw)
 */
safeResolveSyncImpl.with = function safeResolveSyncWith<
  const T extends ReadonlyArray<readonly [Resolver, SimpleEnvSchema] | Partial<ResolveOptions>>
>(
  ...args: T
): SafeResolveResultType<MergeTupleSchemas<FilterOptions<T>>> {
  // Separate tuples from options
  const tuples = args.filter((arg): arg is readonly [Resolver, SimpleEnvSchema] =>
    Array.isArray(arg) && arg.length === 2
  );
  const options = args.find(isOptions);

  // Validate no async validators in any schema
  for (const [, schema] of tuples) {
    for (const [key, value] of Object.entries(schema)) {
      if (value && typeof value === 'object' && '~standard' in value) {
        return {
          success: false,
          error: `❌ safeResolveSync.with() cannot be used with async validators.\n` +
                 `   Variable '${key}' uses a Standard Schema validator (Zod, Valibot, etc.)\n` +
                 `   💡 Use safeResolve.with() instead, or use shorthand syntax for sync validation.`
        };
      }
    }
  }

  // Build merged schema (last wins)
  const mergedSchema: EnvSchema = {};
  for (const [, schema] of tuples) {
    const normalized = normalizeSchema(schema);
    Object.assign(mergedSchema, normalized);
  }

  // Build resolvers list from tuples
  const resolvers = tuples.map(([provider]) => provider);

  const resolveOptions: ResolveOptions = {
    resolvers,
    interpolate: true,
    strict: true,
    ...options,
  };

  try {
    const result = resolveEnvInternalSync(mergedSchema, resolveOptions);
    return { success: true, data: result as MergeTupleSchemas<FilterOptions<T>> };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
};

export const resolve = resolveImpl;
export const safeResolve = safeResolveImpl;
export const safeResolveSync = safeResolveSyncImpl;

/**
 * Synchronous version of resolve() - only works with sync-capable resolvers
 *
 * ⚠️ **Important Limitations:**
 * - Cannot use async validators (Zod, Valibot, etc.) - use `resolve()` instead
 * - Cannot use async-only resolvers - resolvers must implement `loadSync()`
 * - Shorthand syntax (`'string'`, `'url'`, etc.) works perfectly
 *
 * @example
 * ```typescript
 * // ✅ Works - shorthand syntax is sync
 * const config = resolveSync({
 *   PORT: 3000,                    // number with default
 *   DATABASE_URL: 'url',          // required secret url
 *   NODE_ENV: ['dev', 'prod'],     // enum
 *   FEATURE_FLAG: 'string?',       // optional string
 * });
 *
 * // Multiple resolvers
 * const config = resolveSync.with(
 *   [processEnv(), { PORT: 3000 }],
 *   [localConfig(), { DEBUG: false }]
 * );
 *
 * // ❌ Throws error - Zod is async
 * import { z } from 'zod';
 * const config = resolveSync({
 *   DATABASE_URL: z.string().url()  // Error: async validator
 * });
 *
 * // ✅ Solution - use resolve() instead
 * const config = await resolve({
 *   DATABASE_URL: z.string().url()
 * });
 * ```
 *
 * @throws {Error} If schema contains async validators (Standard Schema)
 * @throws {Error} If resolvers don't implement loadSync() (in strict mode)
 */
function resolveSyncImpl<T extends SimpleEnvSchema>(
  schema: T,
  options?: Partial<ResolveOptions>
): InferSimpleSchema<T> {
  // Validate that schema doesn't contain async validators (Zod/Valibot/etc)
  for (const [key, value] of Object.entries(schema)) {
    // Check if value is a Standard Schema (has ~standard property)
    if (value && typeof value === 'object' && '~standard' in value) {
      throw new Error(
        `❌ resolveSync() cannot be used with async validators.\n` +
        `   Variable '${key}' uses a Standard Schema validator (Zod, Valibot, etc.)\n` +
        `   💡 Use resolve() instead, or use shorthand syntax for sync validation.`
      );
    }
  }

  const defaultResolvers = buildDefaultResolvers();

  const resolveOptions: ResolveOptions = {
    resolvers: defaultResolvers,
    interpolate: true,
    strict: true,
    ...options,
  };

  const normalizedSchema = normalizeSchema(schema);
  const result = resolveEnvInternalSync(normalizedSchema, resolveOptions);

  return result as InferSimpleSchema<T>;
}

/**
 * Synchronous version of resolve.with() for multiple resolvers
 *
 * @example
 * ```typescript
 * const config = resolveSync.with(
 *   [processEnv(), { PORT: 3000 }],
 *   [localConfig(), { DEBUG: false }],
 *   { strict: true } // Optional: options as last arg
 * );
 * ```
 */
resolveSyncImpl.with = function resolveSyncWith<
  const T extends ReadonlyArray<readonly [Resolver, SimpleEnvSchema] | Partial<ResolveOptions>>
>(
  ...args: T
): MergeTupleSchemas<FilterOptions<T>> {
  // Separate tuples from options
  const tuples = args.filter((arg): arg is readonly [Resolver, SimpleEnvSchema] =>
    Array.isArray(arg) && arg.length === 2
  );
  const options = args.find(isOptions);

  // Validate no async validators in any schema
  for (const [, schema] of tuples) {
    for (const [key, value] of Object.entries(schema)) {
      if (value && typeof value === 'object' && '~standard' in value) {
        throw new Error(
          `❌ resolveSync.with() cannot be used with async validators.\n` +
          `   Variable '${key}' uses a Standard Schema validator (Zod, Valibot, etc.)\n` +
          `   💡 Use resolve.with() instead, or use shorthand syntax for sync validation.`
        );
      }
    }
  }

  // Build merged schema (last wins)
  const mergedSchema: EnvSchema = {};
  for (const [, schema] of tuples) {
    const normalized = normalizeSchema(schema);
    Object.assign(mergedSchema, normalized);
  }

  // Build resolvers list from tuples
  const resolvers = tuples.map(([provider]) => provider);

  const resolveOptions: ResolveOptions = {
    resolvers,
    interpolate: true,
    strict: true,
    ...options,
  };

  const result = resolveEnvInternalSync(mergedSchema, resolveOptions);
  return result as MergeTupleSchemas<FilterOptions<T>>;
};

export const resolveSync = resolveSyncImpl;