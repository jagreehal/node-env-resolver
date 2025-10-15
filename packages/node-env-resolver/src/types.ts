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
    ? U
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
