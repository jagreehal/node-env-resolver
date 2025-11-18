/**
 * Shared validation functions for advanced environment variable types
 * Import these when you need advanced validation beyond basic string/number/boolean
 *
 * These validators are tree-shakeable - only included if you use advanced types like:
 * 'postgres', 'mysql', 'mongodb', 'redis', 'http', 'https', 'url', 'email', 'port', 'json', 'date', 'timestamp'
 */

import { Validator } from './types';

/**
 * Result of a validation operation
 */
export interface ValidationResult {
  /** Whether the validation passed */
  valid: boolean;
  /** Error message if validation failed */
  error?: string;
  /** Parsed/transformed value if validation succeeded */
  value?: unknown;
}

/**
 * Validate PostgreSQL connection string
 * Checks for postgres:// or postgresql:// URLs
 *
 * @param value - Connection string to validate
 * @returns Validation result with success/error information
 */
export function validatePostgres(value: string): ValidationResult {
  if (!/^postgres(ql)?:\/\/.+/.test(value)) {
    return { valid: false, error: 'Invalid PostgreSQL URL' };
  }
  try {
    new URL(value);
    return { valid: true };
  } catch {
    return { valid: false, error: 'Invalid PostgreSQL URL' };
  }
}

/**
 * Validate MySQL connection string
 * Checks for mysql:// URLs
 *
 * @param value - Connection string to validate
 * @returns Validation result with success/error information
 */
export function validateMysql(value: string): ValidationResult {
  if (!/^mysql:\/\/.+/.test(value)) {
    return { valid: false, error: 'Invalid MySQL URL' };
  }
  try {
    new URL(value);
    return { valid: true };
  } catch {
    return { valid: false, error: 'Invalid MySQL URL' };
  }
}

/**
 * Validate MongoDB connection string
 * Supports mongodb:// and mongodb+srv:// with replica sets
 *
 * @param value - Connection string to validate
 * @returns Validation result with success/error information
 */
export function validateMongodb(value: string): ValidationResult {
  if (!/^mongodb(\+srv)?:\/\/.+/.test(value)) {
    return { valid: false, error: 'Invalid MongoDB URL' };
  }
  // MongoDB supports multiple hosts (replica sets), so we can't use new URL()
  // Validate basic structure instead
  const mongoPattern = /^mongodb(\+srv)?:\/\/([^@]+@)?[^/]+(\/[^?]*)?(\\?.*)?$/;
  if (!mongoPattern.test(value)) {
    return { valid: false, error: 'Invalid MongoDB URL' };
  }
  return { valid: true };
}

/**
 * Validate Redis connection string
 * Supports redis:// and rediss:// (TLS)
 *
 * @param value - Connection string to validate
 * @returns Validation result with success/error information
 */
export function validateRedis(value: string): ValidationResult {
  if (!/^rediss?:\/\/.+/.test(value)) {
    return { valid: false, error: 'Invalid Redis URL' };
  }
  try {
    new URL(value);
    return { valid: true };
  } catch {
    return { valid: false, error: 'Invalid Redis URL' };
  }
}
/**
 * Validate generic URL (with protocol whitelist for security)
 * Only allows safe protocols: http, https, ws, wss, ftp, ftps, file, postgres, mysql, mongodb, redis
 *
 * @param value - URL to validate
 * @returns Validation result with success/error information
 */
export function validateUrl(value: string): ValidationResult {
  try {
    const url = new URL(value);
    const allowedProtocols = [
      'http:',
      'https:',
      'ws:',
      'wss:',
      'ftp:',
      'ftps:',
      'file:',
      'postgres:',
      'postgresql:',
      'mysql:',
      'mongodb:',
      'redis:',
      'rediss:',
    ];
    if (!allowedProtocols.includes(url.protocol)) {
      return {
        valid: false,
        error: `URL protocol '${url.protocol}' is not allowed`,
      };
    }
    return { valid: true };
  } catch {
    return { valid: false, error: 'Invalid URL' };
  }
}

/**
 * Validate email address using RFC-compliant regex
 * Also checks maximum length (254 characters)
 *
 * @param value - Email address to validate
 * @returns Validation result with success/error information
 */
export function validateEmail(value: string): ValidationResult {
  const emailRegex =
    /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
  if (!emailRegex.test(value)) {
    return { valid: false, error: 'Invalid email' };
  }
  if (value.length > 254) {
    return { valid: false, error: 'Invalid email' };
  }
  return { valid: true };
}

/**
 * Validate port number (1-65535)
 *
 * @param value - Port number to validate
 * @returns Validation result with success/error information
 */
export function validatePort(value: string): ValidationResult {
  const num = Number(value);
  if (num !== num || num < 1 || num > 65535) {
    return { valid: false, error: 'Invalid port' };
  }
  return { valid: true };
}

/**
 * Validate number
 * Converts string to number and checks if it's a valid number
 *
 * @param value - Number string to validate
 * @returns Validation result with success/error information
 */
export function validateNumber(value: string): ValidationResult {
  const num = Number(value);
  if (num !== num) {
    return { valid: false, error: 'Invalid number' };
  }
  return { valid: true };
}

/**
 * Validate boolean
 * Accepts: true/1/yes/on, false/0/no/off
 *
 * @param value - Boolean string to validate
 * @returns Validation result with success/error information
 */
export function validateBoolean(value: string): ValidationResult {
  const lower = value.toLowerCase();
  if (
    ['true', '1', 'yes', 'on', 'false', '0', 'no', 'off', ''].includes(lower)
  ) {
    return { valid: true };
  }
  return { valid: false, error: 'Invalid boolean' };
}


/**
 * Validate and normalize date string to ISO 8601
 * Accepts various formats and coerces them to YYYY-MM-DD or ISO 8601 datetime
 *
 * @param value - Date string to validate
 * @returns Validation result with success/error information
 */
export function validateDate(value: string): ValidationResult {
  // Try to parse the date
  const date = new Date(value);
  if (isNaN(date.getTime())) {
    return { valid: false, error: 'Invalid date - cannot parse date value' };
  }

  // Check for common ISO 8601 formats (already valid)
  const isoPattern =
    /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d{1,3})?(Z|[+-]\d{2}:\d{2})?)?$/;
  if (isoPattern.test(value)) {
    // For YYYY-MM-DD format, ensure the parsed date matches what was provided
    // This catches things like 2025-02-30 which would parse but are invalid
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      const [year, month, day] = value.split('-').map(Number);
      if (
        date.getUTCFullYear() !== year ||
        date.getUTCMonth() + 1 !== month ||
        date.getUTCDate() !== day
      ) {
        return { valid: false, error: 'Invalid date value' };
      }
    }
    return { valid: true };
  }

  // If not ISO format, it's parseable but not in the right format
  // We could coerce it, but for env vars we want explicit ISO 8601
  return {
    valid: false,
    error:
      'Date must be in ISO 8601 format (YYYY-MM-DD or YYYY-MM-DDTHH:mm:ss.sssZ)',
  };
}

/**
 * Validate Unix timestamp (seconds since epoch)
 * Validates positive integers representing Unix timestamps
 *
 * @param value - Timestamp string to validate
 * @returns Validation result with success/error information
 */
export function validateTimestamp(value: string): ValidationResult {
  // Ensure it's an integer (no decimals)
  if (!/^\d+$/.test(value)) {
    return { valid: false, error: 'Invalid timestamp' };
  }
  const num = Number(value);
  if (isNaN(num) || num < 0) {
    return { valid: false, error: 'Invalid timestamp' };
  }
  // Check if it's a reasonable timestamp (not too far in the future)
  // Allow up to year 9999 (253402300799 seconds)
  if (num > 253402300799) {
    return { valid: false, error: 'Timestamp too large' };
  }
  return { valid: true };
}

/**
 * Validate and parse time duration (Go-style: 5s, 2h, 30m, etc.)
 * Returns milliseconds
 * Supports formats like: 5s, 2h, 30m, 1.5h, 2h30m, etc.
 *
 * @param value - Duration string to validate
 * @returns Validation result with parsed value in milliseconds
 */
export function validateDuration(
  value: string,
): ValidationResult & { value?: number } {
  // Match patterns like: 5s, 2h, 30m, 1.5h, 2h30m, etc.
  const durationRegex = /^(\d+(?:\.\d+)?)(ms|s|m|h|d)$/;
  const combinedRegex =
    /^(?:(\d+(?:\.\d+)?)h)?(?:(\d+(?:\.\d+)?)m)?(?:(\d+(?:\.\d+)?)s)?(?:(\d+(?:\.\d+)?)ms)?$/;

  // Try simple format first (e.g., "5s", "2h")
  const simpleMatch = value.match(durationRegex);
  if (simpleMatch) {
    const amount = parseFloat(simpleMatch[1]);
    const unit = simpleMatch[2];

    const multipliers: Record<string, number> = {
      ms: 1,
      s: 1000,
      m: 60 * 1000,
      h: 60 * 60 * 1000,
      d: 24 * 60 * 60 * 1000,
    };

    return { valid: true, value: Math.floor(amount * multipliers[unit]) };
  }

  // Try combined format (e.g., "2h30m", "1h30m15s")
  const combinedMatch = value.match(combinedRegex);
  if (combinedMatch && combinedMatch[0]) {
    let totalMs = 0;
    if (combinedMatch[1])
      totalMs += parseFloat(combinedMatch[1]) * 60 * 60 * 1000; // hours
    if (combinedMatch[2]) totalMs += parseFloat(combinedMatch[2]) * 60 * 1000; // minutes
    if (combinedMatch[3]) totalMs += parseFloat(combinedMatch[3]) * 1000; // seconds
    if (combinedMatch[4]) totalMs += parseFloat(combinedMatch[4]); // milliseconds

    if (totalMs > 0) {
      return { valid: true, value: Math.floor(totalMs) };
    }
  }

  return {
    valid: false,
    error: 'Duration must be in format: 5s, 2h, 30m, 1h30m, etc.',
  };
}

/**
 * Read and validate file content
 * Reads the file at the path specified in the value
 *
 * @param value - File path to read
 * @param key - Optional env var key name (for error messages)
 * @returns ValidationResult with file content or error
 */
export function validateFile(value: string, key?: string): ValidationResult {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require('fs');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { resolve } = require('path');
    // Resolve file path relative to current working directory
    const resolvedPath = resolve(process.cwd(), value);
    const content = fs.readFileSync(resolvedPath, 'utf8').trim();
    return { valid: true, value: content };
  } catch (error) {
    const keyInfo = key ? ` for ${key}` : '';
    return {
      valid: false,
      error: `Failed to read file${keyInfo}: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * HTTP/HTTPS URL validator function factory
 * Creates a validator that accepts both http:// and https:// URLs
 *
 * @param opts - Validation options
 * @returns HTTP URL validator
 */
export function http<
  Opts extends { default?: string; optional?: boolean } = Record<string, never>,
>(
  opts?: Opts,
): Opts extends { optional: true }
  ? Validator<string> & { optional: true; default?: Opts['default'] }
  : Validator<string> & {
      optional?: Opts['optional'];
      default?: Opts['default'];
    } {
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

/**
 * JSON validator function factory
 * Creates a validator that parses JSON strings
 *
 * @param opts - Validation options
 * @returns JSON validator
 */
export function json<
  Opts extends { default?: unknown; optional?: boolean } = Record<
    string,
    never
  >,
>(
  opts?: Opts,
): Opts extends { optional: true }
  ? Validator<unknown> & { optional: true; default?: Opts['default'] }
  : Validator<unknown> & {
      optional?: Opts['optional'];
      default?: Opts['default'];
    } {
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


/**
 * String validator with length and pattern validation
 *
 * @param opts Validation options
 * @returns String validator
 *
 * @example
 * ```ts
 * import { string } from 'node-env-resolver/validators';
 *
 * const config = resolve({
 *   API_KEY: string({ min: 32, pattern: '^[a-zA-Z0-9]+$' }),
 *   NAME: string({ optional: true, max: 100 }),
 *   DESCRIPTION: string({ allowEmpty: true })
 * });
 * ```
 */
export function string<
  Opts extends {
    /** Default value if not provided */
    default?: string;
    /** Make the field optional */
    optional?: boolean;
    /** Minimum string length */
    min?: number;
    /** Maximum string length */
    max?: number;
    /** Allow empty strings */
    allowEmpty?: boolean;
    /** Regex pattern to validate against */
    pattern?: string;
  } = Record<string, never>,
>(
  opts?: Opts,
): Opts extends { optional: true }
  ? Validator<string> & { optional: true; default?: Opts['default'] }
  : Validator<string> & {
      optional?: Opts['optional'];
      default?: Opts['default'];
    } {
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
      const keyPrefix = key
        ? `${key} does not match required pattern`
        : 'String does not match pattern';
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

/**
 * Number validator with range validation
 *
 * @param opts Validation options
 * @returns Number validator
 *
 * @example
 * ```ts
 * import { number } from 'node-env-resolver/validators';
 *
 * const config = resolve({
 *   PORT: number({ min: 1, max: 65535 }),
 *   TIMEOUT: number({ default: 5000, optional: true }),
 *   MAX_RETRIES: number({ min: 0, max: 10 })
 * });
 * ```
 */
export function number<
  Opts extends {
    /** Default value if not provided */
    default?: number;
    /** Make the field optional */
    optional?: boolean;
    /** Minimum number value */
    min?: number;
    /** Maximum number value */
    max?: number;
  } = Record<string, never>,
>(
  opts?: Opts,
): Opts extends { optional: true }
  ? Validator<number> & { optional: true; default?: Opts['default'] }
  : Validator<number> & {
      optional?: Opts['optional'];
      default?: Opts['default'];
    } {
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

/**
 * Boolean validator with string coercion
 * Accepts: true/1/yes/on, false/0/no/off
 *
 * @param opts Validation options
 * @returns Boolean validator
 *
 * @example
 * ```ts
 * import { boolean } from 'node-env-resolver/validators';
 *
 * const config = resolve({
 *   DEBUG: boolean({ default: false }),
 *   ENABLE_LOGGING: boolean(),
 *   FEATURE_FLAG: boolean({ optional: true })
 * });
 * ```
 */
export function boolean<
  Opts extends { 
    /** Default value if not provided */
    default?: boolean; 
    /** Make the field optional */
    optional?: boolean 
  } = Record<string, never>,
>(
  opts?: Opts,
): Opts extends { optional: true }
  ? Validator<boolean> & { optional: true; default?: Opts['default'] }
  : Validator<boolean> & {
      optional?: Opts['optional'];
      default?: Opts['default'];
    } {
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

/**
 * URL validator using the built-in URL constructor
 *
 * @param opts Validation options
 * @returns URL validator
 *
 * @example
 * ```ts
 * import { url } from 'node-env-resolver/validators';
 *
 * const config = resolve({
 *   API_URL: url(),
 *   WEBHOOK_URL: url({ optional: true }),
 *   BASE_URL: url({ default: 'https://api.example.com' })
 * });
 * ```
 */
export function url<
  Opts extends { 
    /** Default value if not provided */
    default?: string; 
    /** Make the field optional */
    optional?: boolean 
  } = Record<string, never>,
>(
  opts?: Opts,
): Opts extends { optional: true }
  ? Validator<string> & { optional: true; default?: Opts['default'] }
  : Validator<string> & {
      optional?: Opts['optional'];
      default?: Opts['default'];
    } {
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

/**
 * Email address validator using regex pattern
 *
 * @param opts Validation options
 * @returns Email validator
 *
 * @example
 * ```ts
 * import { email } from 'node-env-resolver/validators';
 *
 * const config = resolve({
 *   ADMIN_EMAIL: email(),
 *   CONTACT_EMAIL: email({ optional: true }),
 *   SUPPORT_EMAIL: email({ default: 'support@example.com' })
 * });
 * ```
 */
export function email<
  Opts extends { 
    /** Default value if not provided */
    default?: string; 
    /** Make the field optional */
    optional?: boolean 
  } = Record<string, never>,
>(
  opts?: Opts,
): Opts extends { optional: true }
  ? Validator<string> & { optional: true; default?: Opts['default'] }
  : Validator<string> & {
      optional?: Opts['optional'];
      default?: Opts['default'];
    } {
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

/**
 * Port number validator (1-65535)
 *
 * @param opts Validation options
 * @returns Port validator
 *
 * @example
 * ```ts
 * import { port } from 'node-env-resolver/validators';
 *
 * const config = resolve({
 *   PORT: port({ default: 3000 }),
 *   REDIS_PORT: port(),
 *   MONITORING_PORT: port({ optional: true })
 * });
 * ```
 */
export function port<
  Opts extends { 
    /** Default value if not provided */
    default?: number; 
    /** Make the field optional */
    optional?: boolean 
  } = Record<string, never>,
>(
  opts?: Opts,
): Opts extends { optional: true }
  ? Validator<number> & { optional: true; default?: Opts['default'] }
  : Validator<number> & {
      optional?: Opts['optional'];
      default?: Opts['default'];
    } {
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

/**
 * PostgreSQL connection string validator
 * Validates postgres:// and postgresql:// URLs
 *
 * @param opts Validation options
 * @returns PostgreSQL URL validator
 *
 * @example
 * ```ts
 * import { postgres } from 'node-env-resolver/validators';
 *
 * const config = resolve({
 *   DATABASE_URL: postgres(),
 *   BACKUP_DB_URL: postgres({ optional: true }),
 *   TEST_DATABASE_URL: postgres({ default: 'postgres://localhost:5432/test' })
 * });
 * ```
 */
export function postgres<
  Opts extends { 
    /** Default value if not provided */
    default?: string; 
    /** Make the field optional */
    optional?: boolean 
  } = Record<string, never>,
>(
  opts?: Opts,
): Opts extends { optional: true }
  ? Validator<string> & { optional: true; default?: Opts['default'] }
  : Validator<string> & {
      optional?: Opts['optional'];
      default?: Opts['default'];
    } {
  const validator = ((value: string) => {
    if (
      !value.startsWith('postgres://') &&
      !value.startsWith('postgresql://')
    ) {
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

/**
 * MySQL connection string validator
 * Validates mysql:// URLs
 *
 * @param opts Validation options
 * @returns MySQL URL validator
 *
 * @example
 * ```ts
 * import { mysql } from 'node-env-resolver/validators';
 *
 * const config = resolve({
 *   MYSQL_URL: mysql(),
 *   READ_REPLICA_URL: mysql({ optional: true }),
 *   TEST_MYSQL_URL: mysql({ default: 'mysql://localhost:3306/test' })
 * });
 * ```
 */
export function mysql<
  Opts extends {
    /** Default value if not provided */
    default?: string;
    /** Make the field optional */
    optional?: boolean;
  } = Record<string, never>,
>(
  opts?: Opts,
): Opts extends { optional: true }
  ? Validator<string> & { optional: true; default?: Opts['default'] }
  : Validator<string> & {
      optional?: Opts['optional'];
      default?: Opts['default'];
    } {
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

/**
 * MongoDB connection string validator
 * Validates mongodb:// and mongodb+srv:// URLs
 *
 * @param opts Validation options
 * @returns MongoDB URL validator
 *
 * @example
 * ```ts
 * import { mongodb } from 'node-env-resolver/validators';
 *
 * const config = resolve({
 *   MONGODB_URL: mongodb(),
 *   MONGODB_ATLAS_URL: mongodb({ optional: true }),
 *   TEST_MONGODB_URL: mongodb({ default: 'mongodb://localhost:27017/test' })
 * });
 * ```
 */
export function mongodb<
  Opts extends { 
    /** Default value if not provided */
    default?: string; 
    /** Make the field optional */
    optional?: boolean 
  } = Record<string, never>,
>(
  opts?: Opts,
): Opts extends { optional: true }
  ? Validator<string> & { optional: true; default?: Opts['default'] }
  : Validator<string> & {
      optional?: Opts['optional'];
      default?: Opts['default'];
    } {
  const validator = ((value: string) => {
    if (
      !value.startsWith('mongodb://') &&
      !value.startsWith('mongodb+srv://')
    ) {
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

/**
 * Redis connection string validator
 * Validates redis:// and rediss:// URLs
 *
 * @param opts Validation options
 * @returns Redis URL validator
 *
 * @example
 * ```ts
 * import { redis } from 'node-env-resolver/validators';
 *
 * const config = resolve({
 *   REDIS_URL: redis(),
 *   REDIS_CACHE_URL: redis({ optional: true }),
 *   TEST_REDIS_URL: redis({ default: 'redis://localhost:6379/0' })
 * });
 * ```
 */
export function redis<
  Opts extends { 
    /** Default value if not provided */
    default?: string; 
    /** Make the field optional */
    optional?: boolean 
  } = Record<string, never>,
>(
  opts?: Opts,
): Opts extends { optional: true }
  ? Validator<string> & { optional: true; default?: Opts['default'] }
  : Validator<string> & {
      optional?: Opts['optional'];
      default?: Opts['default'];
    } {
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


/**
 * HTTPS-only URL validator
 * Only accepts URLs starting with https://
 *
 * @param opts Validation options
 * @returns HTTPS URL validator
 *
 * @example
 * ```ts
 * import { https } from 'node-env-resolver/validators';
 *
 * const config = resolve({
 *   API_URL: https(),
 *   WEBHOOK_URL: https({ optional: true }),
 *   SECURE_URL: https({ default: 'https://api.example.com' })
 * });
 * ```
 */
export function https<
  Opts extends { 
    /** Default value if not provided */
    default?: string; 
    /** Make the field optional */
    optional?: boolean 
  } = Record<string, never>,
>(
  opts?: Opts,
): Opts extends { optional: true }
  ? Validator<string> & { optional: true; default?: Opts['default'] }
  : Validator<string> & {
      optional?: Opts['optional'];
      default?: Opts['default'];
    } {
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

/**
 * String array validator
 * Splits comma-separated values into an array
 *
 * @param opts Validation options
 * @returns String array validator
 *
 * @example
 * ```ts
 * import { stringArray } from 'node-env-resolver/validators';
 *
 * const config = resolve({
 *   ALLOWED_ORIGINS: stringArray(), // "a.com,b.com,c.com"
 *   FEATURES: stringArray({ separator: ':' }), // "feature1:feature2"
 *   TAGS: stringArray({ optional: true })
 * });
 * ```
 */
export function stringArray<
  Opts extends {
    /** Default value if not provided */
    default?: string[];
    /** Make the field optional */
    optional?: boolean;
    /** Separator character (default: ',') */
    separator?: string;
  } = Record<string, never>,
>(
  opts?: Opts,
): Opts extends { optional: true }
  ? Validator<string[]> & { optional: true; default?: Opts['default'] }
  : Validator<string[]> & {
      optional?: Opts['optional'];
      default?: Opts['default'];
    } {
  const validator = ((value: string) => {
    const separator = opts?.separator || ',';
    return value
      .split(separator)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  }) as unknown;

  // Attach options to the validator function for runtime
  if (opts) {
    (validator as Record<string, unknown>).default = opts.default;
    (validator as Record<string, unknown>).optional = opts.optional;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return validator as any;
}

/**
 * Number array validator
 * Splits comma-separated values into an array of numbers
 *
 * @param opts Validation options
 * @returns Number array validator
 *
 * @example
 * ```ts
 * import { numberArray } from 'node-env-resolver/validators';
 *
 * const config = resolve({
 *   PORTS: numberArray(), // "3000,3001,3002"
 *   TIMEOUTS: numberArray({ separator: ':' }), // "1000:2000:3000"
 *   RETRY_COUNTS: numberArray({ optional: true })
 * });
 * ```
 */
export function numberArray<
  Opts extends {
    /** Default value if not provided */
    default?: number[];
    /** Make the field optional */
    optional?: boolean;
    /** Separator character (default: ',') */
    separator?: string;
  } = Record<string, never>,
>(
  opts?: Opts,
): Opts extends { optional: true }
  ? Validator<number[]> & { optional: true; default?: Opts['default'] }
  : Validator<number[]> & {
      optional?: Opts['optional'];
      default?: Opts['default'];
    } {
  const validator = ((value: string) => {
    const separator = opts?.separator || ',';
    return value.split(separator).map((s) => {
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

/**
 * URL array validator
 * Splits comma-separated URLs into an array with URL validation
 *
 * @param opts Validation options
 * @returns URL array validator
 *
 * @example
 * ```ts
 * import { urlArray } from 'node-env-resolver/validators';
 *
 * const config = resolve({
 *   API_ENDPOINTS: urlArray(), // "https://api1.com,https://api2.com"
 *   WEBHOOK_URLS: urlArray({ separator: ':' }),
 *   BACKUP_URLS: urlArray({ optional: true })
 * });
 * ```
 */
export function urlArray<
  Opts extends {
    /** Default value if not provided */
    default?: string[];
    /** Make the field optional */
    optional?: boolean;
    /** Separator character (default: ',') */
    separator?: string;
  } = Record<string, never>,
>(
  opts?: Opts,
): Opts extends { optional: true }
  ? Validator<string[]> & { optional: true; default?: Opts['default'] }
  : Validator<string[]> & {
      optional?: Opts['optional'];
      default?: Opts['default'];
    } {
  const validator = ((value: string) => {
    const separator = opts?.separator || ',';
    const urls = value
      .split(separator)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
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

/**
 * One-of validator for enum-like values
 * Validates that the value is one of the provided options
 *
 * @param values Array of allowed values
 * @param opts Validation options
 * @returns One-of validator
 *
 * @example
 * ```ts
 * import { oneOf } from 'node-env-resolver/validators';
 *
 * const config = resolve({
 *   NODE_ENV: oneOf(['development', 'production', 'test'] as const),
 *   LOG_LEVEL: oneOf(['debug', 'info', 'warn', 'error'] as const),
 *   MODE: oneOf(['dev', 'prod'] as const, { optional: true })
 * });
 * ```
 */
export function oneOf<
  T extends readonly (string | number)[],
  Opts extends { 
    /** Default value if not provided */
    default?: T[number]; 
    /** Make the field optional */
    optional?: boolean 
  } = Record<string, never>,
>(
  values: T,
  opts?: Opts,
): Opts extends { optional: true }
  ? Validator<T[number]> & { optional: true; default?: Opts['default'] }
  : Validator<T[number]> & {
      optional?: Opts['optional'];
      default?: Opts['default'];
    } {
  const validator = ((value: string) => {
    if (!values.includes(value as T[number])) {
      throw new Error(
        `Invalid value: "${value}". Allowed values: ${values.join(', ')}`,
      );
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

/**
 * Enum validator - validates that a value is one of the allowed values
 * This is an alias for `oneOf()` with a more descriptive name for enum validation
 *
 * @param values Array of allowed values
 * @param opts Validation options (optional, default)
 * @returns Enum validator
 *
 * @example
 * ```ts
 * import { enumOf } from 'node-env-resolver/validators';
 *
 * const config = resolve({
 *   NODE_ENV: enumOf(['development', 'production', 'test'] as const),
 *   LOG_LEVEL: enumOf(['error', 'warn', 'info', 'debug'] as const, { optional: true }),
 *   PROTOCOL: enumOf(['http', 'grpc'] as const, { default: 'http' }),
 * });
 * // config.NODE_ENV is typed as 'development' | 'production' | 'test'
 * // config.LOG_LEVEL is typed as 'error' | 'warn' | 'info' | 'debug' | undefined
 * // config.PROTOCOL is typed as 'http' | 'grpc'
 * ```
 */
export function enumOf<
  T extends readonly (string | number)[],
  Opts extends {
    /** Default value if not provided */
    default?: T[number];
    /** Make the field optional */
    optional?: boolean
  } = Record<string, never>,
>(
  values: T,
  opts?: Opts,
): Opts extends { optional: true }
  ? Validator<T[number]> & { optional: true; default?: Opts['default'] }
  : Validator<T[number]> & {
      optional?: Opts['optional'];
      default?: Opts['default'];
    } {
  return oneOf(values, opts);
}

/**
 * Marks an array enum as optional
 * Allows the array literal syntax to support optional values
 *
 * @param values Array of enum values to mark as optional
 * @returns The same array with optional metadata attached
 *
 * @example
 * ```ts
 * import { optional } from 'node-env-resolver/validators';
 *
 * const config = resolve({
 *   // Required enum (must be set to one of these values)
 *   NODE_ENV: ['development', 'production', 'test'] as const,
 *
 *   // Optional enum (can be undefined or one of these values)
 *   PROTOCOL: optional(['http', 'grpc'] as const),
 *   LOG_LEVEL: optional(['error', 'warn', 'info', 'debug'] as const),
 * });
 * // config.NODE_ENV is typed as 'development' | 'production' | 'test'
 * // config.PROTOCOL is typed as 'http' | 'grpc' | undefined
 * // config.LOG_LEVEL is typed as 'error' | 'warn' | 'info' | 'debug' | undefined
 * ```
 */
export function optional<T extends readonly (string | number)[]>(
  values: T,
): T & { __optional: true } {
  // Create a new array with the same values to avoid mutating the original
  const wrapped = [...values] as unknown as T & { __optional: true };
  // Attach the optional marker
  (wrapped as { __optional: true }).__optional = true;
  return wrapped;
}

/**
 * Duration validator with time unit parsing
 * Converts duration strings to milliseconds
 * Supports: s (seconds), m (minutes), h (hours), d (days)
 *
 * @param opts Validation options
 * @returns Duration validator
 *
 * @example
 * ```ts
 * import { duration } from 'node-env-resolver/validators';
 *
 * const config = resolve({
 *   CACHE_TTL: duration(), // "5m" → 300000ms
 *   TIMEOUT: duration({ default: 30000 }), // "30s" → 30000ms
 *   RETRY_DELAY: duration({ optional: true }) // "2h" → 7200000ms
 * });
 * ```
 */
export function duration<
  Opts extends { 
    /** Default value if not provided */
    default?: number; 
    /** Make the field optional */
    optional?: boolean 
  } = Record<string, never>,
>(
  opts?: Opts,
): Opts extends { optional: true }
  ? Validator<number> & { optional: true; default?: Opts['default'] }
  : Validator<number> & {
      optional?: Opts['optional'];
      default?: Opts['default'];
    } {
  const validator = ((value: string) => {
    // Simple duration parser - converts to milliseconds
    const match = value.match(/^(\d+)([smhd])$/);
    if (!match) {
      throw new Error(
        `Invalid duration: "${value}". Use format like "5s", "2m", "1h", "1d"`,
      );
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

/**
 * File content validator
 * Reads the content of a file from the filesystem
 *
 * @param opts Validation options
 * @returns File content validator
 *
 * @example
 * ```ts
 * import { file } from 'node-env-resolver/validators';
 *
 * const config = resolve({
 *   SSL_KEY: file(), // Reads content of SSL_KEY file path
 *   CONFIG_FILE: file({ optional: true }),
 *   DEFAULT_CERT: file({ default: './certs/default.pem' })
 * });
 * ```
 */
export function file<
  Opts extends {
    /** Default value if not provided */
    default?: string;
    /** Make the field optional */
    optional?: boolean;
    /** Base directory for secrets (Docker/K8s) */
    secretsDir?: string;
  } = Record<string, never>,
>(
  opts?: Opts,
): Opts extends { optional: true }
  ? Validator<string> & {
      optional: true;
      default?: Opts['default'];
      secretsDir?: Opts['secretsDir'];
    }
  : Validator<string> & {
      optional?: Opts['optional'];
      default?: Opts['default'];
      secretsDir?: Opts['secretsDir'];
    } {
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
      throw new Error(
        `Failed to read file: ${error instanceof Error ? error.message : String(error)}`,
      );
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

/**
 * Secret value validator
 * A generic validator for secret values with no specific validation
 *
 * @param opts Validation options
 * @returns Secret validator
 *
 * @example
 * ```ts
 * import { secret } from 'node-env-resolver/validators';
 *
 * const config = resolve({
 *   API_SECRET: secret(),
 *   ENCRYPTION_KEY: secret({ optional: true }),
 *   JWT_SECRET: secret({ default: 'fallback-secret' })
 * });
 * ```
 */
export function secret<
  Opts extends { 
    /** Default value if not provided */
    default?: string; 
    /** Make the field optional */
    optional?: boolean 
  } = Record<string, never>,
>(
  opts?: Opts,
): Opts extends { optional: true }
  ? Validator<string> & { optional: true; default?: Opts['default'] }
  : Validator<string> & {
      optional?: Opts['optional'];
      default?: Opts['default'];
    } {
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

/**
 * Custom validator function
 * Allows you to define your own validation logic
 *
 * @param validator Custom validation function
 * @param opts Validation options
 * @returns Custom validator
 *
 * @example
 * ```ts
 * import { custom } from 'node-env-resolver/validators';
 *
 * const config = resolve({
 *   CUSTOM_PORT: custom((value) => {
 *     const port = parseInt(value, 10);
 *     if (port < 1000 || port > 9999) {
 *       throw new Error('Port must be between 1000-9999');
 *     }
 *     return port;
 *   }),
 *   API_VERSION: custom((value) => {
 *     if (!value.match(/^v\d+\.\d+$/)) {
 *       throw new Error('Invalid API version format');
 *     }
 *     return value;
 *   }, { optional: true })
 * });
 * ```
 */
export function custom<
  T = unknown,
  Opts extends { 
    /** Default value if not provided */
    default?: T; 
    /** Make the field optional */
    optional?: boolean 
  } = Record<string, never>,
>(
  validator: (value: string) => T,
  opts?: Opts,
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

/**
 * ISO 8601 date validator
 * Validates dates in YYYY-MM-DD or YYYY-MM-DDTHH:mm:ssZ format
 *
 * @param opts Validation options
 * @returns Date validator
 *
 * @example
 * ```ts
 * import { date } from 'node-env-resolver/validators';
 *
 * const config = resolve({
 *   START_DATE: date(), // "2024-01-01" or "2024-01-01T12:00:00Z"
 *   END_DATE: date({ optional: true }),
 *   DEFAULT_DATE: date({ default: '2024-01-01' })
 * });
 * ```
 */
export function date<
  Opts extends { 
    /** Default value if not provided */
    default?: string; 
    /** Make the field optional */
    optional?: boolean 
  } = Record<string, never>,
>(
  opts?: Opts,
): Opts extends { optional: true }
  ? Validator<string> & { optional: true; default?: Opts['default'] }
  : Validator<string> & {
      optional?: Opts['optional'];
      default?: Opts['default'];
    } {
  const validator = ((value: string) => {
    // Validate ISO 8601 date format - must match pattern like YYYY-MM-DD or YYYY-MM-DDTHH:mm:ssZ
    const iso8601Pattern =
      /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d{3})?Z?)?$/;
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

/**
 * Unix timestamp validator
 * Validates positive integers representing Unix timestamps
 *
 * @param opts Validation options
 * @returns Timestamp validator
 *
 * @example
 * ```ts
 * import { timestamp } from 'node-env-resolver/validators';
 *
 * const config = resolve({
 *   CREATED_AT: timestamp(), // "1640995200"
 *   UPDATED_AT: timestamp({ optional: true }),
 *   EXPIRES_AT: timestamp({ default: 1640995200 })
 * });
 * ```
 */
export function timestamp<
  Opts extends { 
    /** Default value if not provided */
    default?: number; 
    /** Make the field optional */
    optional?: boolean 
  } = Record<string, never>,
>(
  opts?: Opts,
): Opts extends { optional: true }
  ? Validator<number> & { optional: true; default?: Opts['default'] }
  : Validator<number> & {
      optional?: Opts['optional'];
      default?: Opts['default'];
    } {
  const validator = ((value: string) => {
    const num = Number(value);
    if (isNaN(num) || !Number.isInteger(num)) {
      throw new Error(`Invalid timestamp: "${value}"`);
    }
    if (num < 0) {
      throw new Error(`Invalid timestamp: "${value}"`);
    }
    if (num > 253402300799) {
      // Year 9999
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