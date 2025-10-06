/**
 * Shared validation functions for environment variable types
 * Used by both standard-schema.ts and web.ts
 */

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Validate PostgreSQL connection string
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
 * Validate HTTP/HTTPS URL (accepts both)
 */
export function validateHttp(value: string): ValidationResult {
  if (!/^https?:\/\/.+/.test(value)) {
    return { valid: false, error: 'Invalid HTTP URL' };
  }
  try {
    new URL(value);
    return { valid: true };
  } catch {
    return { valid: false, error: 'Invalid HTTP URL' };
  }
}

/**
 * Validate HTTPS URL only (strict)
 */
export function validateHttps(value: string): ValidationResult {
  if (!/^https:\/\/.+/.test(value)) {
    return { valid: false, error: 'Invalid HTTPS URL' };
  }
  try {
    new URL(value);
    return { valid: true };
  } catch {
    return { valid: false, error: 'Invalid HTTPS URL' };
  }
}

/**
 * Validate generic URL (with protocol whitelist for security)
 */
export function validateUrl(value: string): ValidationResult {
  try {
    const url = new URL(value);
    const allowedProtocols = ['http:', 'https:', 'ws:', 'wss:', 'ftp:', 'ftps:', 'file:', 'postgres:', 'postgresql:', 'mysql:', 'mongodb:', 'redis:', 'rediss:'];
    if (!allowedProtocols.includes(url.protocol)) {
      return { valid: false, error: `URL protocol '${url.protocol}' is not allowed` };
    }
    return { valid: true };
  } catch {
    return { valid: false, error: 'Invalid URL' };
  }
}

/**
 * Validate email address
 */
export function validateEmail(value: string): ValidationResult {
  const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
  if (!emailRegex.test(value)) {
    return { valid: false, error: 'Invalid email' };
  }
  if (value.length > 254) {
    return { valid: false, error: 'Invalid email' };
  }
  return { valid: true };
}

/**
 * Validate port number
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
 */
export function validateBoolean(value: string): ValidationResult {
  const lower = value.toLowerCase();
  if (['true', '1', 'yes', 'on', 'false', '0', 'no', 'off', ''].includes(lower)) {
    return { valid: true };
  }
  return { valid: false, error: 'Invalid boolean' };
}

/**
 * Validate JSON
 */
export function validateJson(value: string): ValidationResult {
  try {
    JSON.parse(value);
    return { valid: true };
  } catch {
    return { valid: false, error: 'Invalid JSON' };
  }
}

/**
 * Validate and normalize date string to ISO 8601
 * Accepts various formats and coerces them to YYYY-MM-DD or ISO 8601 datetime
 */
export function validateDate(value: string): ValidationResult {
  // Try to parse the date
  const date = new Date(value);
  if (isNaN(date.getTime())) {
    return { valid: false, error: 'Invalid date - cannot parse date value' };
  }

  // Check for common ISO 8601 formats (already valid)
  const isoPattern = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d{1,3})?(Z|[+-]\d{2}:\d{2})?)?$/;
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
  return { valid: false, error: 'Date must be in ISO 8601 format (YYYY-MM-DD or YYYY-MM-DDTHH:mm:ss.sssZ)' };
}

/**
 * Validate Unix timestamp (seconds since epoch)
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
