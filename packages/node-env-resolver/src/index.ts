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
  InferSimpleValue,
  Validator,
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
// Function overloads for resolveImpl
/* eslint-disable no-redeclare */
function resolveImpl<T extends SimpleEnvSchema>(
  schema: T,
  options?: Partial<ResolveOptions>
): { [K in keyof T]: InferSimpleValue<T[K]> };
function resolveImpl<T1 extends SimpleEnvSchema>(
  tuple1: [SyncResolver, T1],
  options?: Partial<ResolveOptions>
): { [K in keyof T1]: InferSimpleValue<T1[K]> };
function resolveImpl<T1 extends SimpleEnvSchema, T2 extends SimpleEnvSchema>(
  tuple1: [SyncResolver, T1],
  tuple2: [SyncResolver, T2],
  options?: Partial<ResolveOptions>
): { [K in keyof (T1 & T2)]: InferSimpleValue<(T1 & T2)[K]> };
function resolveImpl<T1 extends SimpleEnvSchema, T2 extends SimpleEnvSchema, T3 extends SimpleEnvSchema>(
  tuple1: [SyncResolver, T1],
  tuple2: [SyncResolver, T2],
  tuple3: [SyncResolver, T3],
  options?: Partial<ResolveOptions>
): { [K in keyof (T1 & T2 & T3)]: InferSimpleValue<(T1 & T2 & T3)[K]> };
function resolveImpl(
  arg1: unknown,
  ...rest: unknown[]
): unknown {
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
    // Extract tuples and options from arguments
    const tuples: [SyncResolver, SimpleEnvSchema][] = [];
    
    for (const arg of args) {
      if (Array.isArray(arg) && arg.length === 2 && typeof arg[0] === 'object' && 'load' in arg[0]) {
        // This is a [Resolver, Schema] tuple
        tuples.push(arg as [SyncResolver, SimpleEnvSchema]);
      } else if (typeof arg === 'object' && !Array.isArray(arg)) {
        // This is the options object
        options = arg as Partial<ResolveOptions>;
      }
    }

    if (tuples.length === 0) {
      throw new Error('resolve() requires at least one [resolver, schema] tuple when using array syntax');
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

  return result as unknown;
}
/* eslint-enable no-redeclare */

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
/* eslint-disable no-redeclare */
async function resolveAsync<T1 extends SimpleEnvSchema>(
  tuple1: [Resolver, T1],
  options?: Partial<ResolveOptions>
): Promise<{ [K in keyof T1]: InferSimpleValue<T1[K]> }>;
async function resolveAsync<T1 extends SimpleEnvSchema, T2 extends SimpleEnvSchema>(
  tuple1: [Resolver, T1],
  tuple2: [Resolver, T2],
  options?: Partial<ResolveOptions>
): Promise<{ [K in keyof (T1 & T2)]: InferSimpleValue<(T1 & T2)[K]> }>;
async function resolveAsync<T1 extends SimpleEnvSchema, T2 extends SimpleEnvSchema, T3 extends SimpleEnvSchema>(
  tuple1: [Resolver, T1],
  tuple2: [Resolver, T2],
  tuple3: [Resolver, T3],
  options?: Partial<ResolveOptions>
): Promise<{ [K in keyof (T1 & T2 & T3)]: InferSimpleValue<(T1 & T2 & T3)[K]> }>;
async function resolveAsync(
  arg1: unknown,
  ...rest: unknown[]
): Promise<unknown> {
/* eslint-enable no-redeclare */
  const args = [arg1, ...rest];
  // Extract tuples and options from arguments
  const tuples: [Resolver, SimpleEnvSchema][] = [];
  let options: Partial<ResolveOptions> | undefined;

  for (const arg of args) {
    if (Array.isArray(arg) && arg.length === 2 && typeof arg[0] === 'object' && 'load' in arg[0]) {
      // This is a [Resolver, Schema] tuple
      tuples.push(arg as [Resolver, SimpleEnvSchema]);
    } else if (typeof arg === 'object' && !Array.isArray(arg)) {
      // This is the options object
      options = arg as Partial<ResolveOptions>;
    }
  }

  if (tuples.length === 0) {
    throw new Error('resolve.async() requires at least one [resolver, schema] tuple');
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

resolveImpl.async = resolveAsync;

// Safe resolve implementation (doesn't throw, returns result object)
function safeResolveImpl<T extends SimpleEnvSchema>(
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
    return { success: true, data: result as { [K in keyof T]: InferSimpleValue<T[K]> } };
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
/* eslint-disable no-redeclare */
async function safeResolveAsync<T1 extends SimpleEnvSchema>(
  tuple1: [Resolver, T1],
  options?: Partial<ResolveOptions>
): Promise<SafeResolveResultType<{ [K in keyof T1]: InferSimpleValue<T1[K]> }>>;
async function safeResolveAsync<T1 extends SimpleEnvSchema, T2 extends SimpleEnvSchema>(
  tuple1: [Resolver, T1],
  tuple2: [Resolver, T2],
  options?: Partial<ResolveOptions>
): Promise<SafeResolveResultType<{ [K in keyof (T1 & T2)]: InferSimpleValue<(T1 & T2)[K]> }>>;
async function safeResolveAsync<T1 extends SimpleEnvSchema, T2 extends SimpleEnvSchema, T3 extends SimpleEnvSchema>(
  tuple1: [Resolver, T1],
  tuple2: [Resolver, T2],
  tuple3: [Resolver, T3],
  options?: Partial<ResolveOptions>
): Promise<SafeResolveResultType<{ [K in keyof (T1 & T2 & T3)]: InferSimpleValue<(T1 & T2 & T3)[K]> }>>;
async function safeResolveAsync(
  arg1: unknown,
  ...rest: unknown[]
): Promise<unknown> {
/* eslint-enable no-redeclare */
  const args = [arg1, ...rest];
  // Extract tuples and options from arguments
  const tuples: [Resolver, SimpleEnvSchema][] = [];
  let options: Partial<ResolveOptions> | undefined;

  for (const arg of args) {
    if (Array.isArray(arg) && arg.length === 2 && typeof arg[0] === 'object' && 'load' in arg[0]) {
      // This is a [Resolver, Schema] tuple
      tuples.push(arg as [Resolver, SimpleEnvSchema]);
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

safeResolveImpl.async = safeResolveAsync;

// Simple validator functions that return the actual types
export function string<Opts extends { default?: string; optional?: boolean; min?: number; max?: number; allowEmpty?: boolean; pattern?: string } = Record<string, never>>(
  opts?: Opts
): Opts extends { optional: true } 
  ? Validator<string> & { optional: true; default?: Opts['default'] }
  : Validator<string> & { optional?: Opts['optional']; default?: Opts['default'] } {
  const validator = ((value: string, key?: string) => {
    if (value === '' && !opts?.allowEmpty) {
      throw new Error('String cannot be empty');
    }
    if (opts?.min !== undefined && value.length < opts.min) {
      throw new Error(`String too short (min: ${opts.min})`);
    }
    if (opts?.max !== undefined && value.length > opts.max) {
      throw new Error(`String too long (max: ${opts.max})`);
    }
    if (opts?.pattern && !new RegExp(opts.pattern).test(value)) {
      const keyPrefix = key ? `${key} does not match required pattern` : 'String does not match pattern';
      throw new Error(keyPrefix);
    }
    return value;
  }) as unknown;
  
  // Attach options to the validator function for runtime
  if (opts) {
    (validator as Record<string, unknown>).default = opts.default;
    (validator as Record<string, unknown>).optional = opts.optional;
  }
  
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return validator as any;
}

export function number<Opts extends { default?: number; optional?: boolean; min?: number; max?: number } = Record<string, never>>(
  opts?: Opts
): Opts extends { optional: true }
  ? Validator<number> & { optional: true; default?: Opts['default'] }
  : Validator<number> & { optional?: Opts['optional']; default?: Opts['default'] } {
  const validator = ((value: string) => {
    const num = Number(value);
    if (isNaN(num)) {
      throw new Error(`Invalid number: "${value}"`);
    }
    if (opts?.min !== undefined && num < opts.min) {
      throw new Error(`Number too small (min: ${opts.min})`);
    }
    if (opts?.max !== undefined && num > opts.max) {
      throw new Error(`Number too large (max: ${opts.max})`);
    }
    return num;
  }) as unknown;
  
  // Attach options to the validator function for runtime
  if (opts) {
    (validator as Record<string, unknown>).default = opts.default;
    (validator as Record<string, unknown>).optional = opts.optional;
  }
  
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return validator as any;
}

export function boolean<Opts extends { default?: boolean; optional?: boolean } = Record<string, never>>(
  opts?: Opts
): Opts extends { optional: true }
  ? Validator<boolean> & { optional: true; default?: Opts['default'] }
  : Validator<boolean> & { optional?: Opts['optional']; default?: Opts['default'] } {
  const validator = ((value: string) => {
    const lowerValue = value.toLowerCase();
    if (['true', '1', 'yes', 'on'].includes(lowerValue)) {
      return true;
    }
    if (['false', '0', 'no', 'off', ''].includes(lowerValue)) {
      return false;
    }
    throw new Error(`Invalid boolean: "${value}"`);
  }) as unknown;
  
  // Attach options to the validator function for runtime
  if (opts) {
    (validator as Record<string, unknown>).default = opts.default;
    (validator as Record<string, unknown>).optional = opts.optional;
  }
  
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return validator as any;
}

// Additional validator functions
export function url<Opts extends { default?: string; optional?: boolean } = Record<string, never>>(
  opts?: Opts
): Opts extends { optional: true }
  ? Validator<string> & { optional: true; default?: Opts['default'] }
  : Validator<string> & { optional?: Opts['optional']; default?: Opts['default'] } {
  const validator = ((value: string) => {
    try {
      new URL(value);
      return value;
    } catch {
      throw new Error(`Invalid URL: "${value}"`);
    }
  }) as unknown;
  
  // Attach options to the validator function for runtime
  if (opts) {
    (validator as Record<string, unknown>).default = opts.default;
    (validator as Record<string, unknown>).optional = opts.optional;
  }
  
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return validator as any;
}

export function email<Opts extends { default?: string; optional?: boolean } = Record<string, never>>(
  opts?: Opts
): Opts extends { optional: true }
  ? Validator<string> & { optional: true; default?: Opts['default'] }
  : Validator<string> & { optional?: Opts['optional']; default?: Opts['default'] } {
  const validator = ((value: string) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(value)) {
      throw new Error(`Invalid email: "${value}"`);
    }
    return value;
  }) as unknown;
  
  // Attach options to the validator function for runtime
  if (opts) {
    (validator as Record<string, unknown>).default = opts.default;
    (validator as Record<string, unknown>).optional = opts.optional;
  }
  
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return validator as any;
}

export function port<Opts extends { default?: number; optional?: boolean } = Record<string, never>>(
  opts?: Opts
): Opts extends { optional: true }
  ? Validator<number> & { optional: true; default?: Opts['default'] }
  : Validator<number> & { optional?: Opts['optional']; default?: Opts['default'] } {
  const validator = ((value: string) => {
    const num = Number(value);
    if (isNaN(num) || num < 1 || num > 65535) {
      throw new Error(`Invalid port: "${value}"`);
    }
    return num;
  }) as unknown;
  
  // Attach options to the validator function for runtime
  if (opts) {
    (validator as Record<string, unknown>).default = opts.default;
    (validator as Record<string, unknown>).optional = opts.optional;
  }
  
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return validator as any;
}

export function postgres<Opts extends { default?: string; optional?: boolean } = Record<string, never>>(
  opts?: Opts
): Opts extends { optional: true }
  ? Validator<string> & { optional: true; default?: Opts['default'] }
  : Validator<string> & { optional?: Opts['optional']; default?: Opts['default'] } {
  const validator = ((value: string) => {
    if (!value.startsWith('postgres://') && !value.startsWith('postgresql://')) {
      throw new Error(`Invalid PostgreSQL URL: "${value}"`);
    }
    return value;
  }) as unknown;
  
  // Attach options to the validator function for runtime
  if (opts) {
    (validator as Record<string, unknown>).default = opts.default;
    (validator as Record<string, unknown>).optional = opts.optional;
  }
  
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return validator as any;
}

export function mysql<Opts extends { default?: string; optional?: boolean } = Record<string, never>>(
  opts?: Opts
): Opts extends { optional: true }
  ? Validator<string> & { optional: true; default?: Opts['default'] }
  : Validator<string> & { optional?: Opts['optional']; default?: Opts['default'] } {
  const validator = ((value: string) => {
    if (!value.startsWith('mysql://')) {
      throw new Error(`Invalid MySQL URL: "${value}"`);
    }
    return value;
  }) as unknown;
  
  // Attach options to the validator function for runtime
  if (opts) {
    (validator as Record<string, unknown>).default = opts.default;
    (validator as Record<string, unknown>).optional = opts.optional;
  }
  
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return validator as any;
}

export function mongodb<Opts extends { default?: string; optional?: boolean } = Record<string, never>>(
  opts?: Opts
): Opts extends { optional: true }
  ? Validator<string> & { optional: true; default?: Opts['default'] }
  : Validator<string> & { optional?: Opts['optional']; default?: Opts['default'] } {
  const validator = ((value: string) => {
    if (!value.startsWith('mongodb://') && !value.startsWith('mongodb+srv://')) {
      throw new Error(`Invalid MongoDB URL: "${value}"`);
    }
    return value;
  }) as unknown;
  
  // Attach options to the validator function for runtime
  if (opts) {
    (validator as Record<string, unknown>).default = opts.default;
    (validator as Record<string, unknown>).optional = opts.optional;
  }
  
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return validator as any;
}

export function redis<Opts extends { default?: string; optional?: boolean } = Record<string, never>>(
  opts?: Opts
): Opts extends { optional: true }
  ? Validator<string> & { optional: true; default?: Opts['default'] }
  : Validator<string> & { optional?: Opts['optional']; default?: Opts['default'] } {
  const validator = ((value: string) => {
    if (!value.startsWith('redis://') && !value.startsWith('rediss://')) {
      throw new Error(`Invalid Redis URL: "${value}"`);
    }
    return value;
  }) as unknown;
  
  // Attach options to the validator function for runtime
  if (opts) {
    (validator as Record<string, unknown>).default = opts.default;
    (validator as Record<string, unknown>).optional = opts.optional;
  }
  
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return validator as any;
}

export function http<Opts extends { default?: string; optional?: boolean } = Record<string, never>>(
  opts?: Opts
): Opts extends { optional: true }
  ? Validator<string> & { optional: true; default?: Opts['default'] }
  : Validator<string> & { optional?: Opts['optional']; default?: Opts['default'] } {
  const validator = ((value: string) => {
    if (!value.startsWith('http://') && !value.startsWith('https://')) {
      throw new Error(`Invalid HTTP URL: "${value}"`);
    }
    return value;
  }) as unknown;
  
  // Attach options to the validator function for runtime
  if (opts) {
    (validator as Record<string, unknown>).default = opts.default;
    (validator as Record<string, unknown>).optional = opts.optional;
  }
  
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return validator as any;
}

export function https<Opts extends { default?: string; optional?: boolean } = Record<string, never>>(
  opts?: Opts
): Opts extends { optional: true }
  ? Validator<string> & { optional: true; default?: Opts['default'] }
  : Validator<string> & { optional?: Opts['optional']; default?: Opts['default'] } {
  const validator = ((value: string) => {
    if (!value.startsWith('https://')) {
      throw new Error(`Invalid HTTPS URL: "${value}"`);
    }
    return value;
  }) as unknown;
  
  // Attach options to the validator function for runtime
  if (opts) {
    (validator as Record<string, unknown>).default = opts.default;
    (validator as Record<string, unknown>).optional = opts.optional;
  }
  
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return validator as any;
}

export function json<Opts extends { default?: unknown; optional?: boolean } = Record<string, never>>(
  opts?: Opts
): Opts extends { optional: true }
  ? Validator<unknown> & { optional: true; default?: Opts['default'] }
  : Validator<unknown> & { optional?: Opts['optional']; default?: Opts['default'] } {
  const validator = ((value: string) => {
    try {
      return JSON.parse(value);
    } catch {
      throw new Error(`Invalid JSON: "${value}"`);
    }
  }) as unknown;
  
  // Attach options to the validator function for runtime
  if (opts) {
    (validator as Record<string, unknown>).default = opts.default;
    (validator as Record<string, unknown>).optional = opts.optional;
  }
  
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return validator as any;
}

export function stringArray<Opts extends { default?: string[]; optional?: boolean; separator?: string } = Record<string, never>>(
  opts?: Opts
): Opts extends { optional: true }
  ? Validator<string[]> & { optional: true; default?: Opts['default'] }
  : Validator<string[]> & { optional?: Opts['optional']; default?: Opts['default'] } {
  const validator = ((value: string) => {
    const separator = opts?.separator || ',';
    return value.split(separator).map(s => s.trim()).filter(s => s.length > 0);
  }) as unknown;
  
  // Attach options to the validator function for runtime
  if (opts) {
    (validator as Record<string, unknown>).default = opts.default;
    (validator as Record<string, unknown>).optional = opts.optional;
  }
  
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return validator as any;
}

export function numberArray<Opts extends { default?: number[]; optional?: boolean; separator?: string } = Record<string, never>>(
  opts?: Opts
): Opts extends { optional: true }
  ? Validator<number[]> & { optional: true; default?: Opts['default'] }
  : Validator<number[]> & { optional?: Opts['optional']; default?: Opts['default'] } {
  const validator = ((value: string) => {
    const separator = opts?.separator || ',';
    return value.split(separator).map(s => {
      const num = Number(s.trim());
      if (isNaN(num)) {
        throw new Error(`Invalid number in array: "${s}"`);
      }
      return num;
    });
  }) as unknown;
  
  // Attach options to the validator function for runtime
  if (opts) {
    (validator as Record<string, unknown>).default = opts.default;
    (validator as Record<string, unknown>).optional = opts.optional;
  }
  
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return validator as any;
}

export function urlArray<Opts extends { default?: string[]; optional?: boolean; separator?: string } = Record<string, never>>(
  opts?: Opts
): Opts extends { optional: true }
  ? Validator<string[]> & { optional: true; default?: Opts['default'] }
  : Validator<string[]> & { optional?: Opts['optional']; default?: Opts['default'] } {
  const validator = ((value: string) => {
    const separator = opts?.separator || ',';
    const urls = value.split(separator).map(s => s.trim()).filter(s => s.length > 0);
    for (const url of urls) {
      try {
        new URL(url);
      } catch {
        throw new Error(`Invalid URL in array: "${url}"`);
      }
    }
    return urls;
  }) as unknown;
  
  // Attach options to the validator function for runtime
  if (opts) {
    (validator as Record<string, unknown>).default = opts.default;
    (validator as Record<string, unknown>).optional = opts.optional;
  }
  
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return validator as any;
}

export function enums<T extends readonly (string | number)[], Opts extends { default?: T[number]; optional?: boolean } = Record<string, never>>(
  values: T, 
  opts?: Opts
): Opts extends { optional: true }
  ? Validator<T[number]> & { optional: true; default?: Opts['default'] }
  : Validator<T[number]> & { optional?: Opts['optional']; default?: Opts['default'] } {
  const validator = ((value: string) => {
    if (!values.includes(value as T[number])) {
      throw new Error(`Invalid enum value: "${value}". Allowed values: ${values.join(', ')}`);
    }
    return value as T[number];
  }) as unknown;
  
  // Attach options to the validator function for runtime
  if (opts) {
    (validator as Record<string, unknown>).default = opts.default;
    (validator as Record<string, unknown>).optional = opts.optional;
  }
  
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return validator as any;
}

export function duration<Opts extends { default?: number; optional?: boolean } = Record<string, never>>(
  opts?: Opts
): Opts extends { optional: true }
  ? Validator<number> & { optional: true; default?: Opts['default'] }
  : Validator<number> & { optional?: Opts['optional']; default?: Opts['default'] } {
  const validator = ((value: string) => {
    // Simple duration parser - converts to milliseconds
    const match = value.match(/^(\d+)([smhd])$/);
    if (!match) {
      throw new Error(`Invalid duration: "${value}". Use format like "5s", "2m", "1h", "1d"`);
    }
    const [, num, unit] = match;
    const multipliers = { s: 1000, m: 60000, h: 3600000, d: 86400000 };
    const multiplier = multipliers[unit as keyof typeof multipliers];
    return Number(num) * multiplier;
  }) as unknown;
  
  // Attach options to the validator function for runtime
  if (opts) {
    (validator as Record<string, unknown>).default = opts.default;
    (validator as Record<string, unknown>).optional = opts.optional;
  }
  
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return validator as any;
}

export function file<Opts extends { default?: string; optional?: boolean; secretsDir?: string } = Record<string, never>>(
  opts?: Opts
): Opts extends { optional: true }
  ? Validator<string> & { optional: true; default?: Opts['default']; secretsDir?: Opts['secretsDir'] }
  : Validator<string> & { optional?: Opts['optional']; default?: Opts['default']; secretsDir?: Opts['secretsDir'] } {
  const validator = ((value: string) => {
    // Read file content from the provided path
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const fs = require('fs');
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { resolve } = require('path');
      // Resolve file path relative to current working directory
      const resolvedPath = resolve(process.cwd(), value);
      const content = fs.readFileSync(resolvedPath, 'utf8').trim();
      return content;
    } catch (error) {
      throw new Error(`Failed to read file: ${error instanceof Error ? error.message : String(error)}`);
    }
  }) as unknown;
  
  // Attach options to the validator function for runtime
  if (opts) {
    (validator as Record<string, unknown>).default = opts.default;
    (validator as Record<string, unknown>).optional = opts.optional;
    (validator as Record<string, unknown>).secretsDir = opts.secretsDir;
  }
  
  // Mark this as a file validator for secretsDir support
  (validator as Record<string, unknown>).__isFileValidator = true;
  
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return validator as any;
}

export function secret<Opts extends { default?: string; optional?: boolean } = Record<string, never>>(
  opts?: Opts
): Opts extends { optional: true }
  ? Validator<string> & { optional: true; default?: Opts['default'] }
  : Validator<string> & { optional?: Opts['optional']; default?: Opts['default'] } {
  const validator = ((value: string) => {
    // For now, just return the secret value
    return value;
  }) as unknown;
  
  // Attach options to the validator function for runtime
  if (opts) {
    (validator as Record<string, unknown>).default = opts.default;
    (validator as Record<string, unknown>).optional = opts.optional;
  }
  
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return validator as any;
}

export function custom<T = unknown, Opts extends { default?: T; optional?: boolean } = Record<string, never>>(
  validator: (value: string) => T, 
  opts?: Opts
): Opts extends { optional: true }
  ? Validator<T> & { optional: true; default?: Opts['default'] }
  : Validator<T> & { optional?: Opts['optional']; default?: Opts['default'] } {
  const validatorWithOptions = validator as unknown;
  
  // Attach options to the validator function for runtime
  if (opts) {
    (validatorWithOptions as Record<string, unknown>).default = opts.default;
    (validatorWithOptions as Record<string, unknown>).optional = opts.optional;
  }
  
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return validatorWithOptions as any;
}

// Date and timestamp validators
export function date<Opts extends { default?: string; optional?: boolean } = Record<string, never>>(
  opts?: Opts
): Opts extends { optional: true }
  ? Validator<string> & { optional: true; default?: Opts['default'] }
  : Validator<string> & { optional?: Opts['optional']; default?: Opts['default'] } {
  const validator = ((value: string) => {
    // Validate ISO 8601 date format - must match pattern like YYYY-MM-DD or YYYY-MM-DDTHH:mm:ssZ
    const iso8601Pattern = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d{3})?Z?)?$/;
    if (!iso8601Pattern.test(value)) {
      throw new Error(`Date must be in ISO 8601 format: "${value}"`);
    }
    const date = new Date(value);
    if (isNaN(date.getTime())) {
      throw new Error(`Cannot parse date value: "${value}"`);
    }
    return value;
  }) as unknown;
  
  // Attach options to the validator function for runtime
  if (opts) {
    (validator as Record<string, unknown>).default = opts.default;
    (validator as Record<string, unknown>).optional = opts.optional;
  }
  
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return validator as any;
}

export function timestamp<Opts extends { default?: number; optional?: boolean } = Record<string, never>>(
  opts?: Opts
): Opts extends { optional: true }
  ? Validator<number> & { optional: true; default?: Opts['default'] }
  : Validator<number> & { optional?: Opts['optional']; default?: Opts['default'] } {
  const validator = ((value: string) => {
    const num = Number(value);
    if (isNaN(num) || !Number.isInteger(num)) {
      throw new Error(`Invalid timestamp: "${value}"`);
    }
    if (num < 0) {
      throw new Error(`Invalid timestamp: "${value}"`);
    }
    if (num > 253402300799) { // Year 9999
      throw new Error(`Timestamp too large: "${value}"`);
    }
    return num;
  }) as unknown;
  
  // Attach options to the validator function for runtime
  if (opts) {
    (validator as Record<string, unknown>).default = opts.default;
    (validator as Record<string, unknown>).optional = opts.optional;
  }
  
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return validator as any;
}

export const resolve = resolveImpl;
export const safeResolve = safeResolveImpl;
