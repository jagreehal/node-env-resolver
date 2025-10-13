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
   * Array types (comma-separated by default):
   * - 'string[]': Array of strings (e.g., 'a,b,c' → ['a', 'b', 'c'])
   * - 'number[]': Array of numbers (e.g., '1,2,3' → [1, 2, 3])
   * - 'url[]': Array of URLs
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
   * - 'duration': Time duration (e.g., '5s', '2h', '30m' → milliseconds)
   * - 'file': Read content from file path
   */
  type?: 'string' | 'number' | 'boolean' | 'custom' |
        'string[]' | 'number[]' | 'url[]' |
        'postgres' | 'postgresql' | 'mysql' | 'mongodb' | 'redis' |
        'http' | 'https' | 'url' | 'email' | 'port' | 'json' | 'date' | 'timestamp' | 'duration' | 'file';
  enum?: readonly string[];
  default?: string | number | boolean | string[] | number[];
  optional?: boolean;
  description?: string;
  pattern?: string;
  min?: number;
  max?: number;
  validator?: (value: string) => unknown;
  /** Allow empty strings (default: false - empty strings are rejected) */
  allowEmpty?: boolean;
  /** Separator for array types (default: ',') */
  separator?: string;
  /** Per-field secrets directory (overrides global secretsDir option) */
  secretsDir?: string;
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
  /**
   * Transform flat environment variables into nested objects using a delimiter.
   *
   * When specified, keys like `DATABASE__HOST` become nested as `{ database: { host: '...' } }`
   *
   * @example
   * ```ts
   * // With delimiter '__'
   * process.env.DATABASE__HOST = 'localhost';
   * process.env.DATABASE__PORT = '5432';
   *
   * const config = resolve({
   *   'DATABASE__HOST': 'string',
   *   'DATABASE__PORT': 'port'
   * }, { nestedDelimiter: '__' });
   *
   * // Result: { database: { host: 'localhost', port: 5432 } }
   * ```
   */
  nestedDelimiter?: string;
  /**
   * Validate default values using the same validators as environment values.
   *
   * When `true`, default values are validated to ensure they match the specified type.
   * This catches configuration errors at startup instead of runtime.
   *
   * @default false
   *
   * @example
   * ```ts
   * const config = resolve({
   *   PORT: 99999, // Invalid port number!
   *   DATABASE_URL: 'not-a-url' // Invalid URL!
   * }, { validateDefaults: true });
   * // Throws: Port must be between 1 and 65535
   * ```
   */
  validateDefaults?: boolean;
  /**
   * Global secrets directory for file reading (type: 'file').
   *
   * When specified, variables with `type: 'file'` will read from `secretsDir/lowercase_key_name`
   * if no env var value is provided. Useful for Docker/Kubernetes secrets.
   *
   * Can be overridden per-field using the `secretsDir` property in EnvDefinition.
   *
   * @example
   * ```ts
   * const config = resolve({
   *   DB_PASSWORD: 'file',  // Reads from /run/secrets/db_password
   *   API_KEY: 'file'       // Reads from /run/secrets/api_key
   * }, { secretsDir: '/run/secrets' });
   * ```
   */
  secretsDir?: string;
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
  T['type'] extends 'duration' ? number :
  T['type'] extends 'string[]' ? string[] :
  T['type'] extends 'number[]' ? number[] :
  T['type'] extends 'url[]' ? string[] :
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
    : V extends 'number' | `number?` | `number:${string}` | 'port' | `port?` | `port:${string}` | 'timestamp' | `timestamp?` | `timestamp:${string}` | 'duration' | `duration?` | `duration:${string}`
    ? number
    : V extends 'boolean' | `boolean?` | `boolean:${string}`
    ? boolean
    : V extends 'string[]' | `string[]?` | `string[]:${string}`
    ? string[]
    : V extends 'number[]' | `number[]?` | `number[]:${string}`
    ? number[]
    : V extends 'url[]' | `url[]?` | `url[]:${string}`
    ? string[]
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
