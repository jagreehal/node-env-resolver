/**
 * Type-safe environment variable resolver
 *
 * @example
 * ```typescript
 * import { resolve } from 'node-env-resolver';
 * import { postgres, string } from 'node-env-resolver/validators';
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
  ResolveConfig,
  ResolveAsyncConfig,
  ResolveConfigWithSchema,
  ResolveAsyncConfigWithSchema,
  SimpleEnvSchema,
  InferSimpleValue,
  InferMergedSchemaResult,
} from './types';

// Re-export all types
export type {
  EnvDefinition,
  EnvSchema,
  Resolver,
  SyncResolver,
  ResolveOptions,
  ResolveConfig,
  ResolveAsyncConfig,
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
import { processEnv } from './process-env';



/**
 * Helper to build default resolvers (just processEnv)
 * Only uses process.env for consistency across all environments
 * Users can explicitly add dotenv() if they want .env file support
 *
 * @returns Array of default sync resolvers
 * @private
 */
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
 * Type guard to check if argument is a config object
 *
 * @param arg - Argument to check
 * @returns True if argument is a config object
 * @private
 */
function isConfigObject(arg: unknown): arg is ResolveConfig | ResolveAsyncConfig {
  return typeof arg === 'object' && arg !== null && !Array.isArray(arg) && 
    ('resolvers' in arg || 'schema' in arg || 'options' in arg);
}

/**
 * Type guard to check if argument is a simple schema object
 *
 * @param arg - Argument to check
 * @returns True if argument is a simple schema
 * @private
 */
function isSimpleSchema(arg: unknown): arg is SimpleEnvSchema {
  return typeof arg === 'object' && arg !== null && !Array.isArray(arg) &&
    !('resolvers' in arg) && !('schema' in arg) && !('options' in arg);
}

// Function overloads for resolve
/* eslint-disable no-redeclare */
// Simple schema-only overload (backward compatible)
function resolve<T extends SimpleEnvSchema>(
  schema: T,
  options?: Partial<ResolveOptions>
): { [K in keyof T]: InferSimpleValue<T[K]> };
// Object-based config with schema
function resolve<T extends SimpleEnvSchema>(
  config: ResolveConfigWithSchema<T>
): { [K in keyof T]: InferSimpleValue<T[K]> };
// Object-based config with single resolver
function resolve<T extends SimpleEnvSchema>(
  config: { resolvers: readonly [[SyncResolver, T]]; options?: Partial<ResolveOptions> }
): { [K in keyof T]: InferSimpleValue<T[K]> };
// Object-based config with explicit type parameter and multiple resolvers
function resolve<T extends SimpleEnvSchema>(
  config: { resolvers: readonly [SyncResolver, T][]; options?: Partial<ResolveOptions> }
): { [K in keyof T]: InferSimpleValue<T[K]> };
// Object-based config with multiple resolvers - infer merged schema from resolver tuples
function resolve<T extends readonly [SyncResolver, SimpleEnvSchema][]>(
  config: { resolvers: T; options?: Partial<ResolveOptions> }
): InferMergedSchemaResult<T>;
// Implementation
function resolve(arg1: unknown, arg2?: unknown): unknown {
  let schema: SimpleEnvSchema;
  let resolvers: SyncResolver[];
  let options: Partial<ResolveOptions> | undefined;

  // Check if first arg is a config object
  if (isConfigObject(arg1)) {
    const config = arg1 as ResolveConfig;
    
    if (config.schema) {
      schema = config.schema;
    } else if (config.resolvers && config.resolvers.length > 0) {
      // Merge schemas from resolvers - last one wins for conflicts
      schema = {} as SimpleEnvSchema;
      for (const [, tupleSchema] of config.resolvers) {
        Object.assign(schema, tupleSchema);
      }
    } else {
      throw new Error(
        'resolve() config object must have either a "schema" property or "resolvers" array'
      );
    }
    
    resolvers = config.resolvers ? config.resolvers.map(([resolver]) => resolver) : buildDefaultResolvers();
    options = config.options;
  } else if (isSimpleSchema(arg1)) {
    // Simple syntax: resolve(schema, options?)
    schema = arg1;
    resolvers = buildDefaultResolvers();
    options = arg2 as Partial<ResolveOptions> | undefined;
  } else {
    throw new Error(
      'resolve() expects either a schema object or a config object with "schema" or "resolvers" property'
    );
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
 * import { postgres, string } from 'node-env-resolver/validators';
 * import { awsSecrets, dotenv } from 'node-env-resolver/resolvers';
 *
 * // Works with async-only resolvers
 * const config = await resolveAsync({
 *   resolvers: [
 *     [awsSecrets(), { PORT: 3000, DATABASE_URL: postgres(), API_KEY: string() }]
 *   ]
 * });
 *
 * // Also works with sync resolvers (automatically wrapped in Promise)
 * const config = await resolveAsync({
 *   resolvers: [
 *     [processEnv(), { DATABASE_URL: postgres() }]
 *   ],
 *   options: { strict: true }
 * });
 *
 * // Multiple resolvers - supports unlimited tuples!
 * const config = await resolveAsync({
 *   resolvers: [
 *     [dotenv(), { PORT: 3000 }],
 *     [awsSecrets(), { DATABASE_URL: postgres() }]
 *   ],
 *   options: { strict: true }
 * });
 * ```
 */
/* eslint-disable no-redeclare */
// Object-based config with schema
async function resolveAsync<T extends SimpleEnvSchema>(
  config: ResolveAsyncConfigWithSchema<T>
): Promise<{ [K in keyof T]: InferSimpleValue<T[K]> }>;
// Object-based config with single resolver
async function resolveAsync<T extends SimpleEnvSchema>(
  config: { resolvers: readonly [[Resolver, T]]; options?: Partial<ResolveOptions> }
): Promise<{ [K in keyof T]: InferSimpleValue<T[K]> }>;
// Object-based config with explicit type parameter and multiple resolvers
// This allows: resolveAsync<typeof schema>({ resolvers: [...] })
async function resolveAsync<T extends SimpleEnvSchema>(
  config: { resolvers: readonly [Resolver, T][]; options?: Partial<ResolveOptions> }
): Promise<{ [K in keyof T]: InferSimpleValue<T[K]> }>;
// Object-based config with multiple resolvers - infer merged schema from resolver tuples
async function resolveAsync<T extends readonly [Resolver, SimpleEnvSchema][]>(
  config: { resolvers: T; options?: Partial<ResolveOptions> }
): Promise<InferMergedSchemaResult<T>>;
// Implementation
async function resolveAsync(
  config: ResolveAsyncConfig
): Promise<unknown> {
/* eslint-enable no-redeclare */
  let schema: SimpleEnvSchema;

  if (config.schema) {
    schema = config.schema;
  } else if (config.resolvers && config.resolvers.length > 0) {
    // Merge schemas from resolvers - last one wins for conflicts
    schema = {} as SimpleEnvSchema;
    for (const [, tupleSchema] of config.resolvers) {
      Object.assign(schema, tupleSchema);
    }
  } else {
    throw new Error(
      'resolveAsync() config object must have either a "schema" property or "resolvers" array'
    );
  }

  const resolvers = config.resolvers ? config.resolvers.map(([resolver]) => resolver) : buildDefaultResolvers();

  const isProduction = (process.env.NODE_ENV || '').toLowerCase() === 'production';

  // Default policies: secure by default (block dotenv in production unless explicitly allowed)
  const defaultPolicies = config.options?.policies ?? {};

  const resolveOptions: ResolveOptions = {
    interpolate: true,
    strict: true,
    enableAudit: isProduction,
    policies: defaultPolicies,
    ...config.options,
  };

  const normalizedSchema = normalizeSchema(schema);
  const result = await resolveEnvInternal(normalizedSchema, resolvers, resolveOptions);
  return result as unknown;
}



/**
 * Safe resolve implementation (doesn't throw, returns result object)
 *
 * @param arg1 - Schema object or config object
 * @param arg2 - Optional resolve options
 * @returns Safe resolve result with success/error information
 * @private
 */
function safeResolve<T extends SimpleEnvSchema>(
  arg1: T | ResolveConfig<T>,
  arg2?: Partial<ResolveOptions>
): SafeResolveResultType<{ [K in keyof T]: InferSimpleValue<T[K]> }> {
  let schema: SimpleEnvSchema;
  let resolvers: SyncResolver[];
  let options: Partial<ResolveOptions> | undefined;

  try {
    // Check if first arg is a config object
    if (isConfigObject(arg1)) {
      const config = arg1 as ResolveConfig;
      
      if (config.schema) {
        schema = config.schema;
      } else if (config.resolvers && config.resolvers.length > 0) {
        // Merge schemas from resolvers - last one wins for conflicts
        schema = {} as SimpleEnvSchema;
        for (const [, tupleSchema] of config.resolvers) {
          Object.assign(schema, tupleSchema);
        }
      } else {
        return {
          success: false,
          error: 'safeResolve() config object must have either a "schema" property or "resolvers" array'
        };
      }
      
      resolvers = config.resolvers ? config.resolvers.map(([resolver]) => resolver) : buildDefaultResolvers();
      options = config.options;
    } else if (isSimpleSchema(arg1)) {
      // Simple syntax: safeResolve(schema, options?)
      schema = arg1;
      resolvers = buildDefaultResolvers();
      options = arg2;
    } else {
      return {
        success: false,
        error: 'safeResolve() expects either a schema object or a config object with "schema" or "resolvers" property'
      };
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
            `   💡 Use safeResolveAsync() instead, or use shorthand syntax for sync validation.`,
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
 * import { postgres } from 'node-env-resolver/validators';
 * import { awsSecrets, dotenv } from 'node-env-resolver/resolvers';
 *
 * // Works with async resolvers
 * const result = await safeResolveAsync({
 *   resolvers: [
 *     [awsSecrets({ region: 'us-east-1' }), { PORT: 3000, DATABASE_URL: postgres() }]
 *   ]
 * });
 *
 * // Also works with sync resolvers
 * const result = await safeResolveAsync({
 *   resolvers: [
 *     [processEnv(), { PORT: 3000 }]
 *   ]
 * });
 *
 * // Multiple resolvers - supports unlimited tuples!
 * const result = await safeResolveAsync({
 *   resolvers: [
 *     [dotenv(), { PORT: 3000 }],
 *     [awsSecrets(), { DATABASE_URL: postgres() }]
 *   ],
 *   options: { strict: true }
 * });
 *
 * if (result.success) {
 *   console.log(result.data.PORT); // Type-safe access
 * } else {
 *   console.error(result.error); // Detailed error message
 * }
 * ```
 */
/* eslint-disable no-redeclare */
// Object-based config overload
async function safeResolveAsync<T extends SimpleEnvSchema>(
  config: ResolveAsyncConfig<T>
): Promise<SafeResolveResultType<{ [K in keyof T]: InferSimpleValue<T[K]> }>>;
// Implementation
async function safeResolveAsync(
  config: ResolveAsyncConfig
): Promise<unknown> {
/* eslint-enable no-redeclare */
  let schema: SimpleEnvSchema;

  if (config.schema) {
    schema = config.schema;
  } else if (config.resolvers && config.resolvers.length > 0) {
    // Merge schemas from resolvers - last one wins for conflicts
    schema = {} as SimpleEnvSchema;
    for (const [, tupleSchema] of config.resolvers) {
      Object.assign(schema, tupleSchema);
    }
  } else {
    return {
      success: false,
      error: 'safeResolveAsync() config object must have either a "schema" property or "resolvers" array'
    };
  }

  const resolvers = config.resolvers ? config.resolvers.map(([resolver]) => resolver) : buildDefaultResolvers();

  const isProduction = (process.env.NODE_ENV || '').toLowerCase() === 'production';

  // Default policies: secure by default (block dotenv in production unless explicitly allowed)
  const defaultPolicies = config.options?.policies ?? {};

  const resolveOptions: ResolveOptions = {
    interpolate: true,
    strict: true,
    enableAudit: isProduction,
    policies: defaultPolicies,
    ...config.options,
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


