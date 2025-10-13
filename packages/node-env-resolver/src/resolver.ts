/**
 * Internal resolver functions - extracted for use by both old and new APIs
 */

import type {
  Resolver,
  EnvSchema,
  EnvDefinition,
  SimpleEnvSchema,
  ResolveOptions,
  PolicyOptions,
  Provenance,
} from './types';

/**
 * Lazy-loaded audit logger (only imported when audit is enabled)
 */
import type { AuditEvent } from './audit';

let auditLogger: ((event: AuditEvent) => void) | null = null;
async function logAuditEvent(event: AuditEvent): Promise<void> {
  if (!auditLogger) {
    const audit = await import('./audit');
    auditLogger = audit.logAuditEvent;
  }
  auditLogger(event);
}

function logAuditEventSync(event: AuditEvent): void {
  if (!auditLogger) {
    // Sync context - use require for CommonJS compatibility or dynamic import with top-level handling
    // For now, skip audit in sync mode if not already loaded
    return;
  }
  auditLogger(event);
}

/**
 * Validators - imported at module level for sync validation support
 * This allows advanced types (url, email, postgres, etc.) to work in sync contexts like Next.js
 */
import * as validatorsModule from './validators';

/**
 * Lazy-loaded validators reference (only set when advanced types are used)
 */
let validators: typeof import('./validators') | null = null;

async function loadValidators() {
  if (!validators) {
    validators = validatorsModule;
  }
  return validators;
}

function loadValidatorsSync() {
  if (!validators) {
    // Use the pre-imported validators module for sync validation
    validators = validatorsModule;
  }
  return validators;
}

/**
 * Types that require advanced validators
 */
const ADVANCED_TYPES = new Set([
  'postgres', 'postgresql', 'mysql', 'mongodb', 'redis',
  'http', 'https', 'url', 'email', 'port', 'json', 'date', 'timestamp', 'duration', 'file', 'url[]'
]);

/**
 * Parse shorthand syntax into EnvDefinition
 */
function parseShorthand(value: string): EnvDefinition {
  // Check for pattern syntax: 'string:/regex/'
  const patternMatch = value.match(/^(\w+):(\/.*\/)$/);
  if (patternMatch) {
    const [, type, pattern] = patternMatch;
    return {
      type: type as EnvDefinition['type'],
      pattern: pattern?.slice(1, -1) ?? '' // Remove slashes
    } as EnvDefinition;
  }

  // Check for default value syntax: 'type:default'
  const colonIndex = value.indexOf(':');
  if (colonIndex > 0 && colonIndex < value.length - 1) {
    const type = value.slice(0, colonIndex).replace(/[?]/g, '');
    const defaultStr = value.slice(colonIndex + 1);
    const isOptional = value.includes('?');

    let defaultValue: unknown = defaultStr;
    if (type === 'number' || type === 'port' || type === 'timestamp') {
      defaultValue = Number(defaultStr);
    } else if (type === 'boolean') {
      defaultValue = defaultStr === 'true';
    } else if (type === 'json') {
      try {
        defaultValue = JSON.parse(defaultStr);
      } catch {
        // Keep as string if JSON parse fails
      }
    }

    return {
      type: type as EnvDefinition['type'],
      default: defaultValue,
      ...(isOptional && { optional: true })
    } as EnvDefinition;
  }

  // Parse modifiers (only ? for optional)
  const isOptional = value.endsWith('?');
  const baseType = value.replace(/[?]/g, '') as EnvDefinition['type'];

  return {
    type: baseType || 'string',
    ...(isOptional && { optional: true })
  };
}

/**
 * Convert simplified schema to standard EnvSchema
 */
export function normalizeSchema(schema: SimpleEnvSchema): EnvSchema {
  const normalized: EnvSchema = {};

  for (const [key, value] of Object.entries(schema)) {
    if (typeof value === 'string') {
      normalized[key] = parseShorthand(value);
    } else if (typeof value === 'number') {
      normalized[key] = { type: 'number', default: value };
    } else if (typeof value === 'boolean') {
      normalized[key] = { type: 'boolean', default: value };
    } else if (Array.isArray(value)) {
      normalized[key] = { type: 'string', enum: value };
    } else if (typeof value === 'function') {
      // Custom validator function
      normalized[key] = { type: 'custom', validator: value };
    } else {
      // Already an EnvDefinition
      normalized[key] = value as EnvDefinition;
    }
  }

  return normalized;
}

/**
 * Simple interpolation
 */
function interpolateValue(value: string, allEnv: Record<string, string>): string {
  return value.replace(/\$\{([^}]+)\}/g, (match, varName) => {
    return allEnv[varName] || match;
  });
}

/**
 * Inline validation for basic types (no external dependencies)
 * Core types: string, number, boolean, enum, pattern, custom
 * Advanced types lazy-load validators from validators.ts
 */
interface ValidationResult {
  success: boolean;
  value?: unknown;
  error?: string;
}

function validateBasicType(
  key: string,
  def: EnvDefinition,
  rawValue: string | undefined,
  validateDefaults = false
): ValidationResult {
  const type = def.type || 'string';

  // Handle missing values
  if (rawValue === undefined) {
    if (def.default !== undefined) {
      // If validateDefaults is true, validate the default value
      if (validateDefaults) {
        // Convert default to string for validation (except for custom validators)
        const defaultAsString = String(def.default);
        return validateBasicType(key, { ...def, default: undefined }, defaultAsString, false);
      }
      return { success: true, value: def.default };
    }
    if (def.optional) {
      return { success: true, value: undefined };
    }
    return { success: false, error: `Missing required environment variable: ${key}` };
  }
  
  // Handle empty strings - reject by default unless allowEmpty is true
  if (rawValue === '' && !def.allowEmpty) {
    if (def.default !== undefined) {
      return { success: true, value: def.default };
    }
    if (def.optional) {
      return { success: true, value: undefined };
    }
    return { success: false, error: `${key} cannot be empty` };
  }

  // Handle enum validation
  if (def.enum) {
    if (!def.enum.includes(rawValue)) {
      return {
        success: false,
        error: `${key} must be one of: ${def.enum.join(', ')}`
      };
    }
    return { success: true, value: rawValue };
  }

  // Handle pattern validation
  if (def.pattern) {
    const regex = new RegExp(def.pattern);
    if (!regex.test(rawValue)) {
      return {
        success: false,
        error: `${key} does not match required pattern: ${def.pattern}`
      };
    }
    // Pattern validation doesn't change type - continue to type validation
  }

  // Type-specific validation (basic types only)
  switch (type) {
    case 'string': {
      if (def.min !== undefined && rawValue.length < def.min) {
        return {
          success: false,
          error: `${key} must be at least ${def.min} characters`
        };
      }
      if (def.max !== undefined && rawValue.length > def.max) {
        return {
          success: false,
          error: `${key} must be at most ${def.max} characters`
        };
      }
      return { success: true, value: rawValue };
    }

    case 'number': {
      const num = Number(rawValue);
      if (isNaN(num)) {
        return { success: false, error: `${key}: Invalid number` };
      }
      if (def.min !== undefined && num < def.min) {
        return {
          success: false,
          error: `${key} must be at least ${def.min}`
        };
      }
      if (def.max !== undefined && num > def.max) {
        return {
          success: false,
          error: `${key} must be at most ${def.max}`
        };
      }
      return { success: true, value: num };
    }

    case 'boolean': {
      const lowerValue = rawValue.toLowerCase();
      if (!['true', '1', 'yes', 'on', 'false', '0', 'no', 'off', ''].includes(lowerValue)) {
        return { success: false, error: `${key}: Invalid boolean` };
      }
      const boolValue = ['true', '1', 'yes', 'on'].includes(lowerValue);
      return { success: true, value: boolValue };
    }

    case 'string[]': {
      const separator = def.separator || ',';
      const items = rawValue.split(separator).map(s => s.trim()).filter(s => s.length > 0);
      return { success: true, value: items };
    }

    case 'number[]': {
      const separator = def.separator || ',';
      const items = rawValue.split(separator).map(s => s.trim()).filter(s => s.length > 0);
      const numbers: number[] = [];
      for (const item of items) {
        const num = Number(item);
        if (isNaN(num)) {
          return { success: false, error: `${key}: Invalid number in array: "${item}"` };
        }
        numbers.push(num);
      }
      return { success: true, value: numbers };
    }

    case 'custom': {
      if (!def.validator) {
        return {
          success: false,
          error: `Custom validator function is required for type 'custom'`
        };
      }
      try {
        const result = def.validator(rawValue);
        return { success: true, value: result };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : `Custom validation failed for ${key}`
        };
      }
    }

    // Advanced types need validators
    default:
      return { success: false, error: 'NEEDS_ADVANCED_VALIDATION' };
  }
}

/**
 * Advanced validation using lazy-loaded validators (async)
 */
async function validateAdvancedTypeAsync(
  key: string,
  def: EnvDefinition,
  rawValue: string | undefined,
  validateDefaults = false,
  options?: ResolveOptions
): Promise<ValidationResult> {
  const type = def.type || 'string';

  // Handle missing values (except for 'file' type with secretsDir)
  if (rawValue === undefined || rawValue === '') {
    // Special case: 'file' type with secretsDir can construct path without env var
    if (type === 'file' && (def.secretsDir || options?.secretsDir)) {
      // Continue to file handling below
    } else if (def.default !== undefined) {
      // If validateDefaults is true, validate the default value
      if (validateDefaults) {
        // Convert default to string for validation
        const defaultAsString = String(def.default);
        return await validateAdvancedTypeAsync(key, { ...def, default: undefined }, defaultAsString, false, options);
      }
      return { success: true, value: def.default };
    } else if (def.optional) {
      return { success: true, value: undefined };
    } else {
      return { success: false, error: `Missing required environment variable: ${key}` };
    }
  }

  const v = await loadValidators();

  // At this point, rawValue is guaranteed to be a string (or we handle it specially in file case)
  // TypeScript needs assertion for validators that don't handle undefined
  const valueToValidate = rawValue!;

  // Call appropriate validator based on type
  let validatorResult;
  switch (type) {
    case 'postgres':
    case 'postgresql':
      validatorResult = v.validatePostgres(valueToValidate);
      break;
    case 'mysql':
      validatorResult = v.validateMysql(valueToValidate);
      break;
    case 'mongodb':
      validatorResult = v.validateMongodb(valueToValidate);
      break;
    case 'redis':
      validatorResult = v.validateRedis(valueToValidate);
      break;
    case 'http':
      validatorResult = v.validateHttp(valueToValidate);
      break;
    case 'https':
      validatorResult = v.validateHttps(valueToValidate);
      break;
    case 'url':
      validatorResult = v.validateUrl(valueToValidate);
      break;
    case 'email':
      validatorResult = v.validateEmail(valueToValidate);
      break;
    case 'port':
      validatorResult = v.validatePort(valueToValidate);
      if (validatorResult.valid) {
        return { success: true, value: Number(valueToValidate) };
      }
      break;
    case 'json':
      validatorResult = v.validateJson(valueToValidate);
      if (validatorResult.valid) {
        return { success: true, value: JSON.parse(valueToValidate) };
      }
      break;
    case 'date':
      validatorResult = v.validateDate(valueToValidate);
      break;
    case 'timestamp':
      validatorResult = v.validateTimestamp(valueToValidate);
      if (validatorResult.valid) {
        return { success: true, value: Number(valueToValidate) };
      }
      break;
    case 'duration':
      validatorResult = v.validateDuration(valueToValidate);
      if (validatorResult.valid) {
        return { success: true, value: validatorResult.value };
      }
      break;
    case 'file': {
      // Handle secretsDir: construct path if rawValue is missing
      let filePath = rawValue;
      if (!filePath) {
        const secretsDir = def.secretsDir || options?.secretsDir;
        if (secretsDir) {
          // Convert SCREAMING_SNAKE_CASE to kebab-case (K8s convention)
          // DB_PASSWORD → db-password
          const fileName = key.toLowerCase().replace(/_/g, '-');
          filePath = `${secretsDir}/${fileName}`;
        }
      }
      if (!filePath) {
        return { success: false, error: `${key}: No file path provided and no secretsDir configured` };
      }
      validatorResult = v.validateFile(filePath, key);
      break;
    }
    case 'url[]': {
      const separator = def.separator || ',';
      const items = valueToValidate.split(separator).map(s => s.trim()).filter(s => s.length > 0);
      const urls: string[] = [];
      for (const item of items) {
        const urlResult = v.validateUrl(item);
        if (!urlResult.valid) {
          return { success: false, error: `${key}: Invalid URL in array: "${item}" - ${urlResult.error}` };
        }
        urls.push(item);
      }
      return { success: true, value: urls };
    }
    default:
      return { success: false, error: `Unknown type: ${type}` };
  }

  if (!validatorResult.valid) {
    return { success: false, error: `${key}: ${validatorResult.error}` };
  }

  // Some validators return a transformed value (e.g., file content, parsed duration)
  const finalValue = 'value' in validatorResult && validatorResult.value !== undefined 
    ? validatorResult.value 
    : rawValue;
    
  return { success: true, value: finalValue };
}

/**
 * Advanced validation using lazy-loaded validators (sync)
 */
function validateAdvancedTypeSync(
  key: string,
  def: EnvDefinition,
  rawValue: string | undefined,
  validateDefaults = false,
  options?: ResolveOptions
): ValidationResult {
  const type = def.type || 'string';

  // Handle missing values (except for 'file' type with secretsDir)
  if (rawValue === undefined || rawValue === '') {
    // Special case: 'file' type with secretsDir can construct path without env var
    if (type === 'file' && (def.secretsDir || options?.secretsDir)) {
      // Continue to file handling below
    } else if (def.default !== undefined) {
      // If validateDefaults is true, validate the default value
      if (validateDefaults) {
        // Convert default to string for validation
        const defaultAsString = String(def.default);
        return validateAdvancedTypeSync(key, { ...def, default: undefined }, defaultAsString, false, options);
      }
      return { success: true, value: def.default };
    } else if (def.optional) {
      return { success: true, value: undefined };
    } else {
      return { success: false, error: `Missing required environment variable: ${key}` };
    }
  }

  try {
    const v = loadValidatorsSync();

    // At this point, rawValue is guaranteed to be a string (or we handle it specially in file case)
    // TypeScript needs assertion for validators that don't handle undefined
    const valueToValidate = rawValue!;

    // Call appropriate validator based on type
    let validatorResult;
    switch (type) {
      case 'postgres':
      case 'postgresql':
        validatorResult = v.validatePostgres(valueToValidate);
      break;
      case 'mysql':
        validatorResult = v.validateMysql(valueToValidate);
      break;
      case 'mongodb':
        validatorResult = v.validateMongodb(valueToValidate);
      break;
      case 'redis':
        validatorResult = v.validateRedis(valueToValidate);
      break;
      case 'http':
        validatorResult = v.validateHttp(valueToValidate);
      break;
      case 'https':
        validatorResult = v.validateHttps(valueToValidate);
      break;
      case 'url':
        validatorResult = v.validateUrl(valueToValidate);
      break;
      case 'email':
        validatorResult = v.validateEmail(valueToValidate);
      break;
      case 'port':
        validatorResult = v.validatePort(valueToValidate);
        if (validatorResult.valid) {
          return { success: true, value: Number(valueToValidate) };
        }
        break;
      case 'json':
        validatorResult = v.validateJson(valueToValidate);
        if (validatorResult.valid) {
          return { success: true, value: JSON.parse(valueToValidate) };
        }
        break;
      case 'date':
        validatorResult = v.validateDate(valueToValidate);
      break;
      case 'timestamp':
        validatorResult = v.validateTimestamp(valueToValidate);
        if (validatorResult.valid) {
          return { success: true, value: Number(valueToValidate) };
        }
        break;
      case 'duration':
        validatorResult = v.validateDuration(valueToValidate);
        if (validatorResult.valid) {
          return { success: true, value: validatorResult.value };
        }
        break;
      case 'file': {
        // Handle secretsDir: construct path if rawValue is missing
        let filePath = rawValue;
        if (!filePath) {
          const secretsDir = def.secretsDir || options?.secretsDir;
          if (secretsDir) {
            // Convert SCREAMING_SNAKE_CASE to kebab-case (K8s convention)
            // DB_PASSWORD → db-password
            const fileName = key.toLowerCase().replace(/_/g, '-');
            filePath = `${secretsDir}/${fileName}`;
          }
        }
        if (!filePath) {
          return { success: false, error: `${key}: No file path provided and no secretsDir configured` };
        }
        validatorResult = v.validateFile(filePath, key);
        break;
      }
      case 'url[]': {
        const separator = def.separator || ',';
        const items = valueToValidate.split(separator).map(s => s.trim()).filter(s => s.length > 0);
        const urls: string[] = [];
        for (const item of items) {
          const urlResult = v.validateUrl(item);
          if (!urlResult.valid) {
            return { success: false, error: `${key}: Invalid URL in array: "${item}" - ${urlResult.error}` };
          }
          urls.push(item);
        }
        return { success: true, value: urls };
      }
      default:
        return { success: false, error: `Unknown type: ${type}` };
    }

    if (!validatorResult.valid) {
      return { success: false, error: `${key}: ${validatorResult.error}` };
    }

    // Some validators return a transformed value (e.g., file content, parsed duration)
    const finalValue = 'value' in validatorResult && validatorResult.value !== undefined 
      ? validatorResult.value 
      : rawValue;
      
    return { success: true, value: finalValue };
  } catch {
    return { 
      success: false, 
      error: `${key}: Advanced type '${type}' requires async validation. Use resolve.with() or preload validators.`
    };
  }
}

/**
 * Resolve from resolvers (async)
 */
async function resolveFromResolvers(
  resolvers: Resolver[],
  interpolate: boolean,
  strict: boolean,
  priority: 'first' | 'last' = 'last',
  allSchemaKeys?: Set<string>
): Promise<{ mergedEnv: Record<string, string>; provenance: Record<string, Provenance> }> {
  const mergedEnv: Record<string, string> = {};
  const provenance: Record<string, Provenance> = {};

  // Optimization: parallel execution for priority: 'last'
  // When priority is 'last', resolver order doesn't affect which values win
  // (last write wins), so we can call all resolvers in parallel for better performance
  if (priority === 'last') {
    const results = await Promise.allSettled(
      resolvers.map(async (resolver) => ({
        resolver,
        env: await resolver.load()
      }))
    );

    for (const result of results) {
      if (result.status === 'rejected') {
        const error = result.reason;
        await logAuditEvent({
          type: 'resolver_error',
          timestamp: Date.now(),
          source: 'unknown',
          error: error instanceof Error ? error.message : String(error)
        });

        if (strict) {
          throw new Error(`Resolver failed: ${error instanceof Error ? error.message : error}`);
        }
        continue;
      }

      const { resolver, env } = result.value;
      for (const [key, value] of Object.entries(env)) {
        if (value !== undefined) {
          mergedEnv[key] = value;
          provenance[key] = {
            source: resolver.name,
            timestamp: Date.now(),
            ...(resolver.metadata?.cached !== undefined && { cached: resolver.metadata.cached as boolean })
          };
        }
      }
    }
  } else {
    // priority: 'first' - sequential execution with early termination
    // Resolvers must run in order, but we can skip remaining resolvers
    // if all required keys are already satisfied
    for (const resolver of resolvers) {
      try {
        const env = await resolver.load();
        for (const [key, value] of Object.entries(env)) {
          if (value !== undefined) {
            // priority: 'first' - only set if not already defined
            if (mergedEnv[key] !== undefined) {
              // Skip: value already set by earlier resolver
              continue;
            }

            mergedEnv[key] = value;
            provenance[key] = {
              source: resolver.name,
              timestamp: Date.now(),
              ...(resolver.metadata?.cached !== undefined && { cached: resolver.metadata.cached as boolean })
            };
          }
        }

        // Optimization: early termination
        // If we have ALL schema keys (including optional and defaults), skip remaining resolvers
        if (allSchemaKeys && allSchemaKeys.size > 0) {
          const hasAllKeys = Array.from(allSchemaKeys).every(key => mergedEnv[key] !== undefined);
          if (hasAllKeys) {
            break;
          }
        }
      } catch (error) {
        await logAuditEvent({
          type: 'resolver_error',
          timestamp: Date.now(),
          source: resolver.name,
          error: error instanceof Error ? error.message : String(error)
        });

        if (strict) {
          throw new Error(`Resolver ${resolver.name} failed: ${error instanceof Error ? error.message : error}`);
        }
      }
    }
  }

  if (interpolate) {
    for (const [key, value] of Object.entries(mergedEnv)) {
      mergedEnv[key] = interpolateValue(value, mergedEnv);
    }
  }

  return { mergedEnv, provenance };
}

/**
 * Resolve from resolvers (sync)
 */
function resolveFromResolversSync(
  resolvers: Resolver[],
  interpolate: boolean,
  strict: boolean,
  priority: 'first' | 'last' = 'last',
  allSchemaKeys?: Set<string>
): { mergedEnv: Record<string, string>; provenance: Record<string, Provenance> } {
  const mergedEnv: Record<string, string> = {};
  const provenance: Record<string, Provenance> = {};

  // Note: sync resolvers cannot be parallelized, always sequential
  for (const resolver of resolvers) {
    try {
      if (!resolver.loadSync) {
        if (strict) {
          throw new Error(`Resolver ${resolver.name} has no loadSync() method`);
        }
        continue;
      }

      const env = resolver.loadSync();
      for (const [key, value] of Object.entries(env)) {
        if (value !== undefined) {
          // priority: 'first' - only set if not already defined
          // priority: 'last' - always overwrite (default behavior)
          if (priority === 'first' && mergedEnv[key] !== undefined) {
            // Skip: value already set by earlier resolver
            continue;
          }

          mergedEnv[key] = value;
          provenance[key] = {
            source: resolver.name,
            timestamp: Date.now(),
            ...(resolver.metadata?.cached !== undefined && { cached: resolver.metadata.cached as boolean })
          };
        }
      }

      // Optimization: early termination for priority: 'first'
      // If we have ALL schema keys (including optional and defaults), skip remaining resolvers
      if (priority === 'first' && allSchemaKeys && allSchemaKeys.size > 0) {
        const hasAllKeys = Array.from(allSchemaKeys).every(key => mergedEnv[key] !== undefined);
        if (hasAllKeys) {
          break;
        }
      }
    } catch (error) {
      logAuditEventSync({
        type: 'resolver_error',
        timestamp: Date.now(),
        source: resolver.name,
        error: error instanceof Error ? error.message : String(error)
      });

      if (strict) {
        throw new Error(`Resolver ${resolver.name} failed: ${error instanceof Error ? error.message : error}`);
      }
    }
  }

  if (interpolate) {
    for (const [key, value] of Object.entries(mergedEnv)) {
      mergedEnv[key] = interpolateValue(value, mergedEnv);
    }
  }

  return { mergedEnv, provenance };
}

/**
 * Apply security policies
 */
function applyPolicies(
  key: string,
  def: EnvDefinition,
  provenanceForKey: Provenance | undefined,
  policies: PolicyOptions | undefined
): string | null {
  if (!policies) return null;

  const isProduction = (process.env.NODE_ENV || '').toLowerCase() === 'production';

  // In production, .env files are forbidden by default (secure by default)
  // process.env is ALWAYS allowed (Vercel, AWS, Docker, etc. use process.env, NOT .env files)
  if (
    isProduction &&
    provenanceForKey &&
    provenanceForKey.source.startsWith('dotenv(')
  ) {
    const policy = policies.allowDotenvInProduction;

    // If true, allow all vars from .env
    if (policy === true) {
      return null;
    }

    // If array, only allow specific vars
    if (Array.isArray(policy)) {
      if (!policy.includes(key)) {
        return `${key} cannot be sourced from .env files in production. Use process.env or cloud resolvers. To allow: policies.allowDotenvInProduction: ['${key}'] or set to true for all.`;
      }
      return null;
    }

    // Default: forbid all .env in production
    return `${key} cannot be sourced from .env files in production (secure default). Production platforms (Vercel, AWS, etc.) use process.env. To allow .env in production: policies.allowDotenvInProduction: true`;
  }

  if (policies.enforceAllowedSources && policies.enforceAllowedSources[key] && provenanceForKey) {
    const allowed = policies.enforceAllowedSources[key];
    if (!allowed.includes(provenanceForKey.source)) {
      return `${key} must be sourced from one of: ${allowed.join(', ')} (actual: ${provenanceForKey.source})`;
    }
  }

  return null;
}

/**
 * Validate environment variable names
 */
function validateEnvVarNames(schema: EnvSchema): string[] {
  const errors: string[] = [];
  const envVarRegex = /^[A-Z_][A-Z0-9_]*$/;

  for (const key of Object.keys(schema)) {
    if (!envVarRegex.test(key)) {
      errors.push(`Invalid environment variable name: "${key}". Environment variable names must contain only uppercase letters, numbers, and underscores, and cannot start with a number.`);
    }
  }

  return errors;
}

/**
 * Transform flat object with delimited keys into nested object
 * Example: { 'DATABASE__HOST': 'localhost' } → { database: { host: 'localhost' } }
 */
function applyNestedDelimiter(
  flat: Record<string, unknown>,
  delimiter: string
): Record<string, unknown> {
  const nested: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(flat)) {
    if (!key.includes(delimiter)) {
      // No delimiter in key, keep as-is
      nested[key] = value;
      continue;
    }

    // Split key by delimiter and build nested structure
    const parts = key.split(delimiter);
    let current: Record<string, unknown> = nested;

    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i]!.toLowerCase(); // Lowercase for nested keys
      if (!(part in current)) {
        current[part] = {};
      }
      // Type assertion: we know it's an object because we just created it
      current = current[part] as Record<string, unknown>;
    }

    // Set the final value
    const lastPart = parts[parts.length - 1]!.toLowerCase();
    current[lastPart] = value;
  }

  return nested;
}

/**
 * Internal resolver - used by both old resolve() and new env() APIs
 */
export async function resolveEnvInternal<T extends EnvSchema>(
  schema: T,
  resolvers: Resolver[],
  options: ResolveOptions
): Promise<Record<string, unknown>> {
  const isProduction = (process.env.NODE_ENV || '').toLowerCase() === 'production';
  const {
    interpolate = false,
    strict = true,
    policies,
    enableAudit = isProduction,
    priority = 'last'
  } = options;

  // Validate environment variable names first
  const nameValidationErrors = validateEnvVarNames(schema);
  if (nameValidationErrors.length > 0) {
    if (enableAudit) {
      await logAuditEvent({
        type: 'validation_failure',
        timestamp: Date.now(),
        error: `Invalid environment variable names: ${nameValidationErrors.join(', ')}`
      });
    }
    throw new Error(`Environment validation failed:\n${nameValidationErrors.map(e => `  - ${e}`).join('\n')}`);
  }

  // Collect all schema keys for early termination optimization
  // Early termination happens when ALL keys (not just required) are satisfied
  const allSchemaKeys = new Set<string>(Object.keys(schema));

  const { mergedEnv, provenance } = await resolveFromResolvers(
    resolvers,
    interpolate,
    strict,
    priority,
    allSchemaKeys
  );

  const result: Record<string, unknown> = {};
  const errors: string[] = [];

  for (const [key, def] of Object.entries(schema)) {
    const rawValue = mergedEnv[key];

    // Policy checks
    const policyViolation = applyPolicies(key, def, provenance[key], policies);
    if (policyViolation) {
      errors.push(policyViolation);
      if (enableAudit) {
        logAuditEvent({
          type: 'policy_violation',
          timestamp: Date.now(),
          key,
          source: provenance[key]?.source ?? 'unknown',
          error: policyViolation
        });
      }
      continue;
    }

    try {
      const type = def.type || 'string';
      let validationResult: ValidationResult;

      // Check if type needs advanced validation
      if (ADVANCED_TYPES.has(type)) {
        validationResult = await validateAdvancedTypeAsync(key, def, rawValue, options.validateDefaults, options);
      } else {
        validationResult = validateBasicType(key, def, rawValue, options.validateDefaults);
        // If basic validation says it needs advanced validation, try that
        if (!validationResult.success && validationResult.error === 'NEEDS_ADVANCED_VALIDATION') {
          validationResult = await validateAdvancedTypeAsync(key, def, rawValue, options.validateDefaults, options);
        }
      }

      if (!validationResult.success) {
        errors.push(validationResult.error!);
        if (enableAudit) {
          await logAuditEvent({
            type: 'validation_failure',
            timestamp: Date.now(),
            key,
            error: validationResult.error!
          });
        }
      } else {
        result[key] = validationResult.value;
        // Audit ALL env var loads (not just secrets - all env vars are sensitive)
        if (enableAudit) {
          await logAuditEvent({
            type: 'env_loaded',
            timestamp: Date.now(),
            key,
            source: provenance[key]?.source ?? 'unknown',
            metadata: { cached: provenance[key]?.cached }
          });
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`${key}: ${message}`);
      if (enableAudit) {
        await logAuditEvent({
          type: 'validation_failure',
          timestamp: Date.now(),
          key,
          error: message
        });
      }
    }
  }

  if (errors.length > 0) {
    if (enableAudit) {
      await logAuditEvent({
        type: 'validation_failure',
        timestamp: Date.now(),
        error: `${errors.length} validation error(s)`,
        metadata: { errorCount: errors.length }
      });
    }
    throw new Error(`Environment validation failed:\n${errors.map(e => `  - ${e}`).join('\n')}`);
  }

  if (enableAudit) {
    await logAuditEvent({
      type: 'validation_success',
      timestamp: Date.now(),
      metadata: {
        variableCount: Object.keys(schema).length
      }
    });
  }

  // Apply nested delimiter transformation if specified
  if (options.nestedDelimiter) {
    return applyNestedDelimiter(result, options.nestedDelimiter);
  }

  return result;
}

/**
 * Internal sync resolver
 */
export function resolveEnvInternalSync<T extends EnvSchema>(
  schema: T,
  resolvers: Resolver[],
  options: ResolveOptions
): Record<string, unknown> {
  // Validate environment variable names first
  const nameValidationErrors = validateEnvVarNames(schema);
  if (nameValidationErrors.length > 0) {
    throw new Error(`Environment validation failed:\n${nameValidationErrors.map(e => `  - ${e}`).join('\n')}`);
  }

  const {
    interpolate = false,
    strict = true,
    policies,
    priority = 'last'
  } = options;

  // Collect all schema keys for early termination optimization
  // Early termination happens when ALL keys (not just required) are satisfied
  const allSchemaKeys = new Set<string>(Object.keys(schema));

  const { mergedEnv, provenance } = resolveFromResolversSync(
    resolvers,
    interpolate,
    strict,
    priority,
    allSchemaKeys
  );

  const result: Record<string, unknown> = {};
  const errors: string[] = [];

  for (const [key, def] of Object.entries(schema)) {
    const rawValue = mergedEnv[key];

    const policyViolation = applyPolicies(key, def, provenance[key], policies);
    if (policyViolation) {
      errors.push(policyViolation);
      continue;
    }

    try {
      const type = def.type || 'string';
      let validationResult: ValidationResult;

      // Check if type needs advanced validation
      if (ADVANCED_TYPES.has(type)) {
        // In sync context, try to use pre-loaded validators
        validationResult = validateAdvancedTypeSync(key, def, rawValue, options.validateDefaults, options);
      } else {
        validationResult = validateBasicType(key, def, rawValue, options.validateDefaults);
        // If basic validation says it needs advanced validation, try sync version
        if (!validationResult.success && validationResult.error === 'NEEDS_ADVANCED_VALIDATION') {
          validationResult = validateAdvancedTypeSync(key, def, rawValue, options.validateDefaults, options);
        }
      }

      if (!validationResult.success) {
        errors.push(validationResult.error!);
      } else {
        result[key] = validationResult.value;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`${key}: ${message}`);
    }
  }

  if (errors.length > 0) {
    throw new Error(`Environment validation failed:\n${errors.map(e => `  - ${e}`).join('\n')}`);
  }

  // Apply nested delimiter transformation if specified
  if (options.nestedDelimiter) {
    return applyNestedDelimiter(result, options.nestedDelimiter);
  }

  return result;
}
