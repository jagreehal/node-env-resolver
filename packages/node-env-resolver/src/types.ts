// Simple, clean type system for node-env-resolver

// Basic validator function type with optional metadata
export type Validator<T> = ((value: string) => T) & {
  optional?: boolean;
  default?: T;
};

// Simple schema is just a record of validator functions or simple values
export type SimpleEnvSchema = Record<string, Validator<unknown> | string | number | boolean | readonly string[]>;

// Simple type inference - extract return type and handle optional
export type InferSimpleValue<V> =
  V extends Validator<infer R>
    ? V extends { optional: true }
      ? R | undefined
      : R
    : V extends number
    ? number
    : V extends boolean
    ? boolean
    : V extends readonly (infer U)[]
    ? V extends { __optional: true }
      ? U | undefined
      : U
    : V extends string
    ? string
    : never;

export type InferSimpleSchema<T extends SimpleEnvSchema> = {
  [K in keyof T]: InferSimpleValue<T[K]>;
};

// For now, just use the simple schema type - the nested transformation happens at runtime
// TODO: Implement proper nested type inference
export type InferNestedSchema<T extends SimpleEnvSchema> = InferSimpleSchema<T>;

// Conditional return type based on whether nested delimiter is used
export type InferResolveResult<T extends SimpleEnvSchema, O extends ResolveOptions | undefined> = 
  O extends { nestedDelimiter: string } 
    ? InferNestedSchema<T>
    : InferSimpleSchema<T>;

// Resolver types - keeping the existing structure for now
export interface SyncResolver {
  loadSync(): Record<string, string>;
  load?(): Promise<Record<string, string>>;
  name?: string;
  metadata?: Record<string, unknown>;
}

export interface AsyncResolver {
  load(): Promise<Record<string, string>>;
  loadSync?(): Record<string, string>;
  name?: string;
  metadata?: Record<string, unknown>;
}

export type Resolver = SyncResolver | AsyncResolver;

// Helper functions
export const isSyncResolver = (resolver: Resolver): resolver is SyncResolver => {
  return 'loadSync' in resolver;
};

export const isAsyncOnlyResolver = (resolver: Resolver): resolver is AsyncResolver => {
  return 'load' in resolver && !('loadSync' in resolver);
};

// Options - adding back missing properties
export interface ResolveOptions {
  priority?: 'first' | 'last';
  nestedDelimiter?: string;
  validateDefaults?: boolean;
  secretsDir?: string;
  arraySeparator?: string;
  interpolate?: boolean;
  strict?: boolean;
  policies?: Record<string, unknown>;
  enableAudit?: boolean;
}

// Safe resolve result
export type SafeResolveResultType<T> = 
  | { success: true; data: T }
  | { success: false; error: string; details?: unknown };

// Extract schema type from a resolver tuple [Resolver, Schema]
type ExtractSchema<T> = T extends readonly [unknown, infer S] ? S : never;

// Helper: Convert union to intersection
// UnionToIntersection<A | B | C> = A & B & C
type UnionToIntersection<U> = (U extends unknown ? (k: U) => void : never) extends (k: infer I) => void
  ? I
  : never;

// For arrays/tuples of resolver pairs: extract all schemas as a union
// Then convert to intersection to merge them
type ExtractSchemasUnion<T> = T extends readonly (infer E)[]
  ? E extends readonly [unknown, infer S]
    ? S extends SimpleEnvSchema
      ? S
      : never
    : never
  : never;

// Merge all schemas from resolver array into a single intersection type
type MergedSchema<T> = UnionToIntersection<ExtractSchemasUnion<T>>;

// Infer the result type from merged schemas, applying InferSimpleValue to each property
// This handles multiple resolvers with same or different schemas
type InferMergedSchemaResult<T extends readonly [unknown, SimpleEnvSchema][]> =
  MergedSchema<T> extends SimpleEnvSchema
    ? { [K in keyof MergedSchema<T>]: InferSimpleValue<MergedSchema<T>[K]> }
    : Record<string, unknown>;

// Legacy type - kept for backward compatibility
type InferMergedSchema<T extends readonly [unknown, SimpleEnvSchema][]> = T extends readonly [
  unknown,
  infer S1,
  ...infer Rest
]
  ? Rest extends readonly [unknown, SimpleEnvSchema][]
    ? S1 & InferMergedSchema<Rest>
    : S1
  : T extends readonly [unknown, infer S]
  ? S
  : Record<string, never>;

// Export the merge types for use in function overloads
export type { InferMergedSchema, InferMergedSchemaResult, MergedSchema, ExtractSchema, UnionToIntersection };

// New object-based API configuration types
export interface ResolveConfig<T extends SimpleEnvSchema = SimpleEnvSchema> {
  schema?: T;
  resolvers?: readonly [SyncResolver, SimpleEnvSchema][];
  options?: Partial<ResolveOptions>;
}

export interface ResolveAsyncConfig<T extends SimpleEnvSchema = SimpleEnvSchema> {
  schema?: T;
  resolvers?: readonly [Resolver, SimpleEnvSchema][];
  options?: Partial<ResolveOptions>;
}

// Specific config types for better type inference
export interface ResolveConfigWithSchema<T extends SimpleEnvSchema> {
  schema: T;
  options?: Partial<ResolveOptions>;
}

export interface ResolveConfigWithResolvers<T extends readonly [SyncResolver, SimpleEnvSchema][]> {
  resolvers: T;
  options?: Partial<ResolveOptions>;
}

export interface ResolveAsyncConfigWithSchema<T extends SimpleEnvSchema> {
  schema: T;
  options?: Partial<ResolveOptions>;
}

export interface ResolveAsyncConfigWithResolvers<T extends readonly [Resolver, SimpleEnvSchema][]> {
  resolvers: T;
  options?: Partial<ResolveOptions>;
}

// Additional types needed by existing code
export type Provenance = {
  source: string;
  timestamp: number;
  metadata?: Record<string, unknown>;
  cached?: boolean;
};

export type PolicyOptions = {
  allowDotenvInProduction?: boolean;
  requireSecretsForSensitive?: boolean;
  blockInsecureProtocols?: boolean;
  enforceAllowedSources?: boolean;
};

export type SimpleEnvValue = Validator<unknown> | string | number | boolean | readonly string[];

// Legacy types for backward compatibility
export type EnvSchema = Record<string, unknown>;
export interface EnvDefinition {
  type?: string;
  validator?: (value: string, key?: string) => unknown;
  default?: unknown;
  optional?: boolean;
  secretsDir?: string;
}

// Additional legacy types
export type InferType = unknown;
export type InferSchema = unknown;
