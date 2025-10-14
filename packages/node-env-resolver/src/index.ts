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
  Resolver,
  SyncResolver,
  ResolveOptions,
  SimpleEnvSchema,
  InferSimpleSchema,
} from './types';
// Re-export all types
export type {
  EnvDefinition,
  EnvSchema,
  Resolver,
  SyncResolver,
  AsyncOnlyResolver,
  ResolveOptions,
  Provenance,
  PolicyOptions,
  SimpleEnvValue,
  SimpleEnvSchema,
  InferType,
  InferSchema,
  InferSimpleSchema,
} from './types';
// Re-export type guards
export { isSyncResolver, isAsyncOnlyResolver } from './types';
// Re-export validation types for Zod/Valibot integrations
export type {
  ValidationIssue,
  SafeResolveResult as SafeResolveResultWithIssues
} from './validation-types';
// Re-export audit types and functions
export { getAuditLog, clearAuditLog, type AuditEvent, type AuditEventType } from './audit';
// Import resolver functions
import { normalizeSchema, resolveEnvInternal, resolveEnvInternalSync } from './resolver';

// Inlined processEnv resolver (avoids importing resolvers.ts with dotenv parser)
// Note: Exported for use in zod.ts, valibot.ts, and user code
export function processEnv(): SyncResolver {
  return {
    name: 'process.env',
    async load() {
      return { ...process.env } as Record<string, string>;
    },
    loadSync() {
      return { ...process.env } as Record<string, string>;
    }
  };
}

// Helper to build default resolvers (just processEnv)
function buildDefaultResolvers(): SyncResolver[] {
  // Only use process.env for consistency across all environments
  // Users can explicitly add dotenv() from 'node-env-resolver/resolvers' if they want .env file support
  return [processEnv()];
}

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


/**
 * Resolve environment variables synchronously
 *
 * @example
 * ```typescript
 * // Simple usage - process.env only (default)
 * const config = resolve({
 *   PORT: 3000,                    // number with default
 *   DATABASE_URL: 'url',          // required secret url
 *   NODE_ENV: ['dev', 'prod'],     // enum
 *   FEATURE_FLAG: 'string?',       // optional string
 * });
 *
 * // With custom sync resolver - array syntax
 * const config = resolve([
 *   processEnv(),
 *   { PORT: 3000, NODE_ENV: ['dev', 'prod'] }
 * ]);
 *
 * // With custom sync resolver and options
 * const config = resolve([
 *   dotenv(),
 *   { PORT: 3000, DATABASE_URL: 'postgres' }
 * ], { strict: true });
 *
 * // Multiple sync resolvers (NEW!)
 * const config = resolve(
 *   [dotenv(), { PORT: 3000 }],
 *   [json('config.json'), { DATABASE_URL: 'postgres' }],
 *   { strict: true }
 * );
 *
 * // Async resolution with resolve.async()
 * const config = await resolve.async([
 *   awsSecrets(),
 *   { DATABASE_URL: 'url', API_KEY: 'string' }
 * ]);
 * ```
 */
function resolveImpl<T extends SimpleEnvSchema>(
  arg1: T | [SyncResolver, T],
  ...rest: ([SyncResolver, T] | Partial<ResolveOptions>)[]
): InferSimpleSchema<T> {
  const args = [arg1, ...rest];
  let schema: T;
  let resolvers: SyncResolver[];
  let options: Partial<ResolveOptions> | undefined;

  // Check if first arg is a plain schema object (no resolver)
  if (!Array.isArray(arg1)) {
    // Simple syntax: resolve(schema, options?)
    schema = arg1;
    resolvers = buildDefaultResolvers();
    options = rest[0] as Partial<ResolveOptions> | undefined;
  } else {
    // Array syntax: resolve([resolver, schema], ..., options?)
    // Extract tuples and options from arguments
    const tuples: [SyncResolver, T][] = [];
    
    for (const arg of args) {
      if (Array.isArray(arg) && arg.length === 2 && typeof arg[0] === 'object' && 'load' in arg[0]) {
        // This is a [Resolver, Schema] tuple
        tuples.push(arg as [SyncResolver, T]);
      } else if (typeof arg === 'object' && !Array.isArray(arg)) {
        // This is the options object
        options = arg as Partial<ResolveOptions>;
      }
    }

    if (tuples.length === 0) {
      throw new Error('resolve() requires at least one [resolver, schema] tuple when using array syntax');
    }

    // Merge schemas - last one wins for conflicts
    schema = {} as T;
    for (const [, tupleSchema] of tuples) {
      Object.assign(schema, tupleSchema);
    }
    resolvers = tuples.map(([resolver]) => resolver);
  }
  // Validate that schema doesn't contain async validators (Zod/Valibot/etc)
  for (const [key, value] of Object.entries(schema)) {
    // Check if value is a Standard Schema (has ~standard property)
    if (value && typeof value === 'object' && '~standard' in value) {
      throw new Error(
        `❌ resolve() cannot be used with async validators.\n` +
        `   Variable '${key}' uses a Standard Schema validator (Zod, Valibot, etc.)\n` +
        `   💡 Use resolve.async() instead, or use shorthand syntax for sync validation.`
      );
    }
  }

  // Validate that all provided resolvers support sync
  for (const resolver of resolvers) {
    if (!resolver.loadSync) {
      throw new Error(
        `❌ Resolver '${resolver.name}' does not support synchronous loading.\n` +
        `   All resolvers passed to resolve() must have a loadSync() method.\n` +
        `   💡 Use resolve.async() for async resolvers, or use a sync-compatible resolver.`
      );
    }
  }

  const isProduction = (process.env.NODE_ENV || '').toLowerCase() === 'production';

  // Default policies: secure by default (block dotenv in production unless explicitly allowed)
  const defaultPolicies = options?.policies ?? {};

  const resolveOptions: ResolveOptions = {
    interpolate: true,
    strict: true,
    enableAudit: isProduction,
    policies: defaultPolicies,
    ...options,
  };

  const normalizedSchema = normalizeSchema(schema);
  const result = resolveEnvInternalSync(normalizedSchema, resolvers, resolveOptions);

  return result as InferSimpleSchema<T>;
}

/**
 * Resolve environment variables asynchronously (supports all resolver types - both sync and async)
 *
 * @example
 * ```typescript
 * // Works with async-only resolvers
 * const config = await resolve.async([
 *   awsSecrets(),
 *   { PORT: 3000, DATABASE_URL: 'url', API_KEY: 'string' }
 * ]);
 *
 * // Also works with sync resolvers (automatically wrapped in Promise)
 * const config = await resolve.async([
 *   processEnv(),  // Sync resolver works in async context
 *   { DATABASE_URL: 'postgres' }
 * ], { strict: true });
 *
 * // Multiple resolvers
 * const config = await resolve.async(
 *   [dotenv(), { PORT: 3000 }],
 *   [awsSecrets(), { DATABASE_URL: 'url' }],
 *   { strict: true }
 * );
 * ```
 */
async function resolveAsync<T extends SimpleEnvSchema>(
  arg1: [Resolver, T] | Partial<ResolveOptions>,
  ...rest: ([Resolver, T] | Partial<ResolveOptions>)[]
): Promise<InferSimpleSchema<T>> {
  const args = [arg1, ...rest];
  // Extract tuples and options from arguments
  const tuples: [Resolver, T][] = [];
  let options: Partial<ResolveOptions> | undefined;

  for (const arg of args) {
    if (Array.isArray(arg) && arg.length === 2 && typeof arg[0] === 'object' && 'load' in arg[0]) {
      // This is a [Resolver, Schema] tuple
      tuples.push(arg as [Resolver, T]);
    } else if (typeof arg === 'object' && !Array.isArray(arg)) {
      // This is the options object
      options = arg as Partial<ResolveOptions>;
    }
  }

  if (tuples.length === 0) {
    throw new Error('resolve.async() requires at least one [resolver, schema] tuple');
  }

  // Merge schemas - last one wins for conflicts
  const schema: T = {} as T;
  for (const [, tupleSchema] of tuples) {
    Object.assign(schema, tupleSchema);
  }
  const resolvers = tuples.map(([resolver]) => resolver);

  const isProduction = (process.env.NODE_ENV || '').toLowerCase() === 'production';

  // Default policies: secure by default (block dotenv in production unless explicitly allowed)
  const defaultPolicies = options?.policies ?? {};

  const resolveOptions: ResolveOptions = {
    interpolate: true,
    strict: true,
    enableAudit: isProduction,
    policies: defaultPolicies,
    ...options,
  };

  const normalizedSchema = normalizeSchema(schema);
  const result = await resolveEnvInternal(normalizedSchema, resolvers, resolveOptions);
  return result as InferSimpleSchema<T>;
}

resolveImpl.async = resolveAsync;

// Safe resolve implementation (doesn't throw, returns result object)
function safeResolveImpl<T extends SimpleEnvSchema>(
  arg1: T | [SyncResolver, T],
  ...rest: ([SyncResolver, T] | Partial<ResolveOptions>)[]
): SafeResolveResultType<InferSimpleSchema<T>> {
  const args = [arg1, ...rest];
  let schema: T;
  let resolvers: SyncResolver[];
  let options: Partial<ResolveOptions> | undefined;

  // Check if first arg is a plain schema object (no resolver)
  if (!Array.isArray(arg1)) {
    // Simple syntax: safeResolve(schema, options?)
    schema = arg1;
    resolvers = buildDefaultResolvers();
    options = rest[0] as Partial<ResolveOptions> | undefined;
  } else {
    // Array syntax: safeResolve([resolver, schema], ..., options?)
    // Extract tuples and options from arguments
    const tuples: [SyncResolver, T][] = [];
    
    for (const arg of args) {
      if (Array.isArray(arg) && arg.length === 2 && typeof arg[0] === 'object' && 'load' in arg[0]) {
        // This is a [Resolver, Schema] tuple
        tuples.push(arg as [SyncResolver, T]);
      } else if (typeof arg === 'object' && !Array.isArray(arg)) {
        // This is the options object
        options = arg as Partial<ResolveOptions>;
      }
    }

    if (tuples.length === 0) {
      return {
        success: false,
        error: 'safeResolve() requires at least one [resolver, schema] tuple when using array syntax'
      };
    }

    // Merge schemas - last one wins for conflicts
    schema = {} as T;
    for (const [, tupleSchema] of tuples) {
      Object.assign(schema, tupleSchema);
    }
    resolvers = tuples.map(([resolver]) => resolver);
  }
  // Validate that schema doesn't contain async validators (Zod/Valibot/etc)
  for (const [key, value] of Object.entries(schema)) {
    // Check if value is a Standard Schema (has ~standard property)
    if (value && typeof value === 'object' && '~standard' in value) {
      return {
        success: false,
        error: `❌ safeResolve() cannot be used with async validators.\n` +
               `   Variable '${key}' uses a Standard Schema validator (Zod, Valibot, etc.)\n` +
               `   💡 Use safeResolve.async() instead, or use shorthand syntax for sync validation.`
      };
    }
  }

  // Validate that all provided resolvers support sync
  for (const resolver of resolvers) {
    if (!resolver.loadSync) {
      return {
        success: false,
        error: `❌ Resolver '${resolver.name}' does not support synchronous loading.\n` +
               `   All resolvers passed to safeResolve() must have a loadSync() method.\n` +
               `   💡 Use safeResolve.async() for async resolvers.`
      };
    }
  }

  const isProduction = (process.env.NODE_ENV || '').toLowerCase() === 'production';

  // Default policies: secure by default (block dotenv in production unless explicitly allowed)
  const defaultPolicies = options?.policies ?? {};

  const resolveOptions: ResolveOptions = {
    interpolate: true,
    strict: true,
    enableAudit: isProduction,
    policies: defaultPolicies,
    ...options,
  };

  const normalizedSchema = normalizeSchema(schema);

  try {
    const result = resolveEnvInternalSync(normalizedSchema, resolvers, resolveOptions);
    return { success: true, data: result as InferSimpleSchema<T> };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

/**
 * Safe async resolve (doesn't throw, returns result object)
 * Supports both sync and async resolvers
 *
 * @example
 * ```typescript
 * // Works with async resolvers
 * const result = await safeResolve.async([
 *   awsSecrets({ region: 'us-east-1' }),
 *   { PORT: 3000, DATABASE_URL: 'url' }
 * ]);
 *
 * // Also works with sync resolvers
 * const result = await safeResolve.async([
 *   processEnv(),  // Sync resolver works fine
 *   { PORT: 3000 }
 * ]);
 *
 * // Multiple resolvers
 * const result = await safeResolve.async(
 *   [dotenv(), { PORT: 3000 }],
 *   [awsSecrets(), { DATABASE_URL: 'url' }],
 *   { strict: true }
 * );
 *
 * if (result.success) {
 *   console.log(result.data.PORT); // Type-safe access
 * } else {
 *   console.error(result.error); // Detailed error message
 * }
 * ```
 */
async function safeResolveAsync<T extends SimpleEnvSchema>(
  arg1: [Resolver, T] | Partial<ResolveOptions>,
  ...rest: ([Resolver, T] | Partial<ResolveOptions>)[]
): Promise<SafeResolveResultType<InferSimpleSchema<T>>> {
  const args = [arg1, ...rest];
  // Extract tuples and options from arguments
  const tuples: [Resolver, T][] = [];
  let options: Partial<ResolveOptions> | undefined;

  for (const arg of args) {
    if (Array.isArray(arg) && arg.length === 2 && typeof arg[0] === 'object' && 'load' in arg[0]) {
      // This is a [Resolver, Schema] tuple
      tuples.push(arg as [Resolver, T]);
    } else if (typeof arg === 'object' && !Array.isArray(arg)) {
      // This is the options object
      options = arg as Partial<ResolveOptions>;
    }
  }

  if (tuples.length === 0) {
    return {
      success: false,
      error: 'safeResolve.async() requires at least one [resolver, schema] tuple'
    };
  }

  // Merge schemas - last one wins for conflicts
  const schema: T = {} as T;
  for (const [, tupleSchema] of tuples) {
    Object.assign(schema, tupleSchema);
  }
  const resolvers = tuples.map(([resolver]) => resolver);

  const isProduction = (process.env.NODE_ENV || '').toLowerCase() === 'production';

  // Default policies: secure by default (block dotenv in production unless explicitly allowed)
  const defaultPolicies = options?.policies ?? {};

  const resolveOptions: ResolveOptions = {
    interpolate: true,
    strict: true,
    enableAudit: isProduction,
    policies: defaultPolicies,
    ...options,
  };

  try {
    const normalizedSchema = normalizeSchema(schema);
    const result = await resolveEnvInternal(normalizedSchema, resolvers, resolveOptions);
    return { success: true, data: result as InferSimpleSchema<T> };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

safeResolveImpl.async = safeResolveAsync;

export const resolve = resolveImpl;
export const safeResolve = safeResolveImpl;

