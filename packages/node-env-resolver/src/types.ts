/**
 * Shared types for node-env-resolver
 */

// Core types
export interface EnvDefinition {
  /**
   * Type of the environment variable
   * 
   * Basic types (inline validation, ~2KB core):
   * - 'string': Any string value (default)
   * - 'number': Coerced to number
   * - 'boolean': Coerced to boolean
   * - 'custom': Custom validator function
   * 
   * Advanced types (lazy-loaded validators, tree-shakeable):
   * - 'postgres'/'postgresql': PostgreSQL connection URL
   * - 'mysql': MySQL connection URL
   * - 'mongodb': MongoDB connection URL (supports replica sets)
   * - 'redis': Redis connection URL
   * - 'http': HTTP or HTTPS URL
   * - 'https': HTTPS-only URL
   * - 'url': Generic URL
   * - 'email': Email address
   * - 'port': Port number 1-65535
   * - 'json': JSON value (returns parsed object)
   * - 'date': ISO 8601 date
   * - 'timestamp': Unix timestamp (seconds)
   */
  type?: 'string' | 'number' | 'boolean' | 'custom' |
        'postgres' | 'postgresql' | 'mysql' | 'mongodb' | 'redis' |
        'http' | 'https' | 'url' | 'email' | 'port' | 'json' | 'date' | 'timestamp';
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
  metadata?: Record<string, unknown>;
}

export interface ResolveOptions {
  interpolate?: boolean;
  strict?: boolean;
  policies?: PolicyOptions;
  enableAudit?: boolean;
  /**
   * Control merge behavior when multiple resolvers provide the same variable.
   *
   * - `'last'` (default): Later resolvers override earlier ones
   * - `'first'`: Earlier resolvers take precedence, later ones are skipped if value already set
   *
   * @example
   * // Local .env overrides AWS secrets (for development)
   * resolve.with(
   *   [dotenv(), { DATABASE_URL: 'url' }],
   *   [awsSecrets(), { DATABASE_URL: 'url' }],
   *   { priority: 'first' }  // dotenv wins
   * );
   *
   * @example
   * // AWS secrets override process.env (for production, default)
   * resolve.with(
   *   [processEnv(), { DATABASE_URL: 'url' }],
   *   [awsSecrets(), { DATABASE_URL: 'url' }]
   *   // priority: 'last' is default - AWS wins
   * );
   */
  priority?: 'first' | 'last';
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
  T['type'] extends 'port' ? number :
  T['type'] extends 'timestamp' ? number :
  T['type'] extends 'custom' ? unknown :
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
