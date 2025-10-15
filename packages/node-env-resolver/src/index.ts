/**
 * Type-safe environment variable resolver
 *
 * @example
 * ```typescript
 * import { resolve } from 'node-env-resolver';
 * import { postgres, string } from 'node-env-resolver/resolvers';
 *
 * const config = resolve({
 *   PORT: 3000,                              // number with default
 *   DATABASE_URL: postgres(),                // required PostgreSQL URL
 *   NODE_ENV: ['development', 'production'], // enum
 *   DEBUG: false,                            // boolean with default
 *   API_KEY: string({optional: true}),       // optional string
 * });
 * ```
 */

import type {
  Resolver,
  SyncResolver,
  ResolveOptions,
  SimpleEnvSchema,
  InferSimpleValue,
} from './types';

// Re-export all types
export type {
  EnvDefinition,
  EnvSchema,
  Resolver,
  SyncResolver,
  ResolveOptions,
  Provenance,
  PolicyOptions,
  SimpleEnvValue,
  SimpleEnvSchema,
  InferType,
  InferSchema,
  InferSimpleSchema,
  InferResolveResult,
  Validator,
} from './types';

// Re-export type guards
export { isSyncResolver, isAsyncOnlyResolver, AsyncResolver } from './types';
// Re-export validation types for Zod/Valibot integrations
export type {
  ValidationIssue,
  SafeResolveResult as SafeResolveResultWithIssues
} from './validation-types';
// Re-export audit types and functions
export { getAuditLog, clearAuditLog, type AuditEvent, type AuditEventType } from './audit';

// Import resolver functions
import { normalizeSchema, resolveEnvInternal, resolveEnvInternalSync } from './resolver';

/**
 * Resolver that reads from process.env
 * This is the default resolver used when no custom resolvers are provided
 */
export function processEnv(): SyncResolver {
  return {
    name: 'process.env',
    async load() {
      const env: Record<string, string> = {};
      for (const [key, value] of Object.entries(process.env)) {
        if (value !== undefined) {
          env[key] = value;
        }
      }
      return env;
    },
    loadSync() {
      const env: Record<string, string> = {};
      for (const [key, value] of Object.entries(process.env)) {
        if (value !== undefined) {
          env[key] = value;
        }
      }
      return env;
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

// Type definitions for tuple handling
type ResolverTuple = readonly [Resolver, SimpleEnvSchema];
type SyncResolverTuple = readonly [SyncResolver, SimpleEnvSchema];

// Merge the schemas in the tuple list into an intersection
type TuplesToSchema<T extends readonly ResolverTuple[]> =
  T[number] extends never ? Record<string, never> :
  UnionToIntersection<T[number][1]>;

type UnionToIntersection<U> =
  (U extends unknown ? (k: U) => void : never) extends (k: infer I) => void ? I : never;

// Helper functions
function isResolverTuple(arg: unknown): arg is ResolverTuple {
  return Array.isArray(arg) &&
    arg.length === 2 &&
    typeof arg[0] === 'object' &&
    arg[0] != null &&
    'load' in arg[0];
}

function isSyncResolverTuple(arg: unknown): arg is SyncResolverTuple {
  return isResolverTuple(arg) && 'loadSync' in arg[0];
}

function splitArgs<A extends readonly unknown[]>(
  args: A
): { tuples: ResolverTuple[]; options?: Partial<ResolveOptions> } {
  const maybeOptions = args[args.length - 1];
  const options = !Array.isArray(maybeOptions) && typeof maybeOptions === 'object'
    ? (maybeOptions as Partial<ResolveOptions>)
    : undefined;
  const end = options ? args.length - 1 : args.length;
  const tuples = Array.from(args).slice(0, end).filter(isResolverTuple) as ResolverTuple[];
  return { tuples, options };
}

function splitSyncArgs<A extends readonly unknown[]>(
  args: A
): { tuples: SyncResolverTuple[]; options?: Partial<ResolveOptions> } {
  const maybeOptions = args[args.length - 1];
  const options = !Array.isArray(maybeOptions) && typeof maybeOptions === 'object'
    ? (maybeOptions as Partial<ResolveOptions>)
    : undefined;
  const end = options ? args.length - 1 : args.length;
  const tuples = Array.from(args).slice(0, end).filter(isSyncResolverTuple) as SyncResolverTuple[];
  return { tuples, options };
}

// Function overloads for resolve
/* eslint-disable no-redeclare */
function resolve<T extends SimpleEnvSchema>(
  schema: T,
  options?: Partial<ResolveOptions>
): { [K in keyof T]: InferSimpleValue<T[K]> };
function resolve<
  TTuples extends readonly SyncResolverTuple[],
  MergedSchema extends TuplesToSchema<TTuples>
>(...args: [...TTuples, Partial<ResolveOptions>?]): {
  [K in keyof MergedSchema]: InferSimpleValue<MergedSchema[K]>;
};
function resolve(arg1: unknown, ...rest: unknown[]): unknown {
  const args = [arg1, ...rest];
  let schema: SimpleEnvSchema;
  let resolvers: SyncResolver[];
  let options: Partial<ResolveOptions> | undefined;

  // Check if first arg is a plain schema object (no resolver)
  if (!Array.isArray(arg1)) {
    // Simple syntax: resolve(schema, options?)
    schema = arg1 as SimpleEnvSchema;
    resolvers = buildDefaultResolvers();
    options = rest[0] as Partial<ResolveOptions> | undefined;
  } else {
    // Array syntax: resolve([resolver, schema], ..., options?)
    const { tuples, options: parsedOptions } = splitSyncArgs(args);
    options = parsedOptions;

    if (tuples.length === 0) {
      throw new Error(
        'resolve() requires at least one [resolver, schema] tuple when using array syntax',
      );
    }

    // Merge schemas - last one wins for conflicts
    schema = {} as SimpleEnvSchema;
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
          `   💡 Use resolveAsync() instead, or use shorthand syntax for sync validation.`,
      );
    }
  }

  // Validate that all provided resolvers support sync
  for (const resolver of resolvers) {
    if (!resolver.loadSync) {
      throw new Error(
        `❌ Resolver '${resolver.name}' does not support synchronous loading.\n` +
          `   All resolvers passed to resolve() must have a loadSync() method.\n` +
          `   💡 Use resolveAsync() for async resolvers, or use a sync-compatible resolver.`,
      );
    }
  }

  const isProduction =
    (process.env.NODE_ENV || '').toLowerCase() === 'production';

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
  const result = resolveEnvInternalSync(
    normalizedSchema,
    resolvers,
    resolveOptions,
  );

  return result as unknown;
}
/* eslint-enable no-redeclare */

/**
 * Resolve environment variables asynchronously (supports all resolver types - both sync and async)
 *
 * @example
 * ```typescript
 * import { resolveAsync } from 'node-env-resolver';
 * import { postgres, string } from 'node-env-resolver/resolvers';
 * import { awsSecrets, dotenv } from 'node-env-resolver/resolvers';
 *
 * // Works with async-only resolvers
 * const config = await resolveAsync([
 *   awsSecrets(),
 *   { PORT: 3000, DATABASE_URL: postgres(), API_KEY: string() }
 * ]);
 *
 * // Also works with sync resolvers (automatically wrapped in Promise)
 * const config = await resolveAsync([
 *   processEnv(),  // Sync resolver works in async context
 *   { DATABASE_URL: postgres() }
 * ], { strict: true });
 *
 * // Multiple resolvers - supports unlimited tuples!
 * const config = await resolveAsync(
 *   [dotenv(), { PORT: 3000 }],
 *   [awsSecrets(), { DATABASE_URL: postgres() }],
 *   { strict: true }
 * );
 * ```
 */
/* eslint-disable no-redeclare */
async function resolveAsync<
  TTuples extends readonly ResolverTuple[],
  MergedSchema extends TuplesToSchema<TTuples>
>(...args: [...TTuples, Partial<ResolveOptions>?]): Promise<{
  [K in keyof MergedSchema]: InferSimpleValue<MergedSchema[K]>;
}>;
async function resolveAsync(
  arg1: unknown,
  ...rest: unknown[]
): Promise<unknown> {
/* eslint-enable no-redeclare */
  const args = [arg1, ...rest];
  const { tuples, options } = splitArgs(args);

  if (tuples.length === 0) {
    throw new Error('resolveAsync() requires at least one [resolver, schema] tuple');
  }

  // Merge schemas - last one wins for conflicts
  const schema: SimpleEnvSchema = {};
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
  return result as unknown;
}



// Safe resolve implementation (doesn't throw, returns result object)
function safeResolve<T extends SimpleEnvSchema>(
  arg1: T | [SyncResolver, T],
  ...rest: ([SyncResolver, T] | Partial<ResolveOptions>)[]
): SafeResolveResultType<{ [K in keyof T]: InferSimpleValue<T[K]> }> {
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
    const { tuples, options: parsedOptions } = splitSyncArgs(args);
    options = parsedOptions;

    if (tuples.length === 0) {
      return {
        success: false,
        error:
          'safeResolve() requires at least one [resolver, schema] tuple when using array syntax',
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
        error:
          `❌ safeResolve() cannot be used with async validators.\n` +
          `   Variable '${key}' uses a Standard Schema validator (Zod, Valibot, etc.)\n` +
          `   💡 Use saferesolveAsync() instead, or use shorthand syntax for sync validation.`,
      };
    }
  }

  // Validate that all provided resolvers support sync
  for (const resolver of resolvers) {
    if (!resolver.loadSync) {
      return {
        success: false,
        error:
          `❌ Resolver '${resolver.name}' does not support synchronous loading.\n` +
          `   All resolvers passed to safeResolve() must have a loadSync() method.\n` +
          `   💡 Use safeResolveAsync() for async resolvers.`,
      };
    }
  }

  const isProduction =
    (process.env.NODE_ENV || '').toLowerCase() === 'production';

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
    const result = resolveEnvInternalSync(
      normalizedSchema,
      resolvers,
      resolveOptions,
    );
    return {
      success: true,
      data: result as { [K in keyof T]: InferSimpleValue<T[K]> },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Safe async resolve (doesn't throw, returns result object)
 * Supports both sync and async resolvers
 *
 * @example
 * ```typescript
 * import { safeResolveAsync } from 'node-env-resolver';
 * import { postgres } from 'node-env-resolver/resolvers';
 * import { awsSecrets, dotenv } from 'node-env-resolver/resolvers';
 *
 * // Works with async resolvers
 * const result = await safeResolveAsync([
 *   awsSecrets({ region: 'us-east-1' }),
 *   { PORT: 3000, DATABASE_URL: postgres() }
 * ]);
 *
 * // Also works with sync resolvers
 * const result = await safeResolveAsync([
 *   processEnv(),  // Sync resolver works fine
 *   { PORT: 3000 }
 * ]);
 *
 * // Multiple resolvers - supports unlimited tuples!
 * const result = await safeResolveAsync(
 *   [dotenv(), { PORT: 3000 }],
 *   [awsSecrets(), { DATABASE_URL: postgres() }],
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
/* eslint-disable no-redeclare */
async function safeResolveAsync<
  TTuples extends readonly ResolverTuple[],
  MergedSchema extends TuplesToSchema<TTuples>
>(...args: [...TTuples, Partial<ResolveOptions>?]): Promise<SafeResolveResultType<{
  [K in keyof MergedSchema]: InferSimpleValue<MergedSchema[K]>;
}>>;
async function safeResolveAsync(
  arg1: unknown,
  ...rest: unknown[]
): Promise<unknown> {
/* eslint-enable no-redeclare */
  const args = [arg1, ...rest];
  const { tuples, options } = splitArgs(args);

  if (tuples.length === 0) {
    return {
      success: false,
      error: 'safeResolveAsync() requires at least one [resolver, schema] tuple'
    };
  }

  // Merge schemas - last one wins for conflicts
  const schema: SimpleEnvSchema = {};
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
    return { success: true, data: result } as unknown;
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    } as unknown;
  }
}

export { safeResolveAsync, resolveAsync, resolve, safeResolve };


