/**
 * Shared types for node-env-resolver
 */

// Core types
export interface EnvDefinition {
  type?: 'string' | 'number' | 'boolean' | 'url' | 'email' | 'json' | 'port' | 'postgres' | 'postgresql' | 'mysql' | 'mongodb' | 'redis' | 'http' | 'https' | 'date' | 'timestamp' | 'custom';
  enum?: readonly string[];
  default?: string | number | boolean;
  optional?: boolean;
  description?: string;
  pattern?: string;
  min?: number;
  max?: number;
  validator?: (value: string) => unknown;
}

export interface EnvSchema {
  [key: string]: EnvDefinition;
}

export interface Resolver {
  name: string;
  load(): Promise<Record<string, string>>;
  loadSync?(): Record<string, string>;
}

export interface ResolveOptions {
  resolvers?: Resolver[];
  interpolate?: boolean;
  strict?: boolean;
  policies?: PolicyOptions;
  enableAudit?: boolean;
}

export interface Provenance {
  source: string;
  timestamp: number;
  cached?: boolean;
}

export interface PolicyOptions {
  /**
   * Control loading from .env files in production.
   *
   * - `undefined` (default): .env files completely ignored in production (secure default)
   * - `true`: Allow all vars from .env in production (NOT recommended)
   * - `string[]`: Allow only specific vars from .env in production
   *
   * Note: `process.env` is ALWAYS used regardless of this setting.
   * Production platforms (Vercel, AWS, Docker, etc.) inject via process.env, NOT .env files.
   *
   * @example allowDotenvInProduction: true  // Allow all (not recommended)
   * @example allowDotenvInProduction: ['PORT', 'NODE_ENV']  // Allow specific vars
   */
  allowDotenvInProduction?: boolean | string[];
  enforceAllowedSources?: Record<string, string[]>;
}

// Simplified schema types
export type SimpleEnvValue =
  | string
  | number
  | boolean
  | readonly string[]
  | EnvDefinition
  | ((value: string) => unknown);

export interface SimpleEnvSchema {
  [key: string]: SimpleEnvValue;
}

// Type inference
export type InferType<T extends EnvDefinition> =
  T['enum'] extends readonly (infer U)[] ? U :
  T['type'] extends 'number' ? number :
  T['type'] extends 'boolean' ? boolean :
  T['type'] extends 'url' ? string :
  T['type'] extends 'port' ? number :
  T['type'] extends 'timestamp' ? number :
  T['type'] extends 'json' ? unknown :
  T['type'] extends 'postgres' | 'postgresql' | 'mysql' | 'mongodb' | 'redis' | 'http' | 'https' | 'date' ? string :
  string;

export type InferSchema<T extends EnvSchema> = {
  [K in keyof T]: T[K]['optional'] extends true
    ? InferType<T[K]> | undefined
    : T[K]['default'] extends unknown
    ? InferType<T[K]>
    : InferType<T[K]>;
};

// Type-level transformation for SimpleEnvSchema
type InferSimpleValue<V> =
  V extends EnvDefinition
    ? InferType<V>
    : V extends (value: string) => infer R
    ? R
    : V extends number
    ? number
    : V extends boolean
    ? boolean
    : V extends readonly (infer U)[]
    ? U
    : V extends 'number' | `number?` | `number:${string}` | 'port' | `port?` | `port:${string}` | 'timestamp' | `timestamp?` | `timestamp:${string}`
    ? number
    : V extends 'boolean' | `boolean?` | `boolean:${string}`
    ? boolean
    : V extends string
    ? string
    : never;

type InferOptional<V> =
  V extends string
    ? V extends `${string}?`
      ? true
      : false
    : V extends EnvDefinition
    ? V['optional'] extends true
      ? true
      : false
    : false;

export type InferSimpleSchema<T extends SimpleEnvSchema> = {
  [K in keyof T]: InferOptional<T[K]> extends true
    ? InferSimpleValue<T[K]> | undefined
    : InferSimpleValue<T[K]>;
};
