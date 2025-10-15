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
import { validateFile } from './validators';
import { join } from 'path';

/**
 * Lazy-loaded audit logger (only imported when audit is enabled)
 */
import type { AuditEvent } from './audit';

let auditLogger: ((event: AuditEvent) => void) | null = null;
let attachAuditSession: ((config: object) => string) | null = null;

async function logAuditEvent(event: AuditEvent): Promise<void> {
  if (!auditLogger) {
    const audit = await import('./audit');
    auditLogger = audit.logAuditEvent;
    attachAuditSession = audit.attachAuditSession;
  }
  auditLogger(event);
}

function logAuditEventSync(event: AuditEvent): void {
  if (!auditLogger) {
    // Sync context - load audit logger synchronously
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const audit = require('./audit');
      auditLogger = audit.logAuditEvent;
      attachAuditSession = audit.attachAuditSession;
    } catch {
      // If audit module can't be loaded, skip logging
      return;
    }
  }
  if (auditLogger) {
    auditLogger(event);
  }
}



/**
 * Convert simplified schema to standard EnvSchema
 */
export function normalizeSchema(schema: SimpleEnvSchema): EnvSchema {
  const normalized: EnvSchema = {};

  for (const [key, value] of Object.entries(schema)) {
    if (typeof value === 'function') {
      // Custom validator function - check if it has attached options
      const validator = value as unknown as Record<string, unknown>;
      const isFileValidator = validator.__isFileValidator === true;
      normalized[key] = { 
        type: isFileValidator ? 'file' : 'custom', 
        validator: value,
        ...(validator.default !== undefined && { default: validator.default }),
        ...(validator.optional !== undefined && { optional: validator.optional }),
        ...(validator.secretsDir !== undefined && { secretsDir: validator.secretsDir })
      };
    } else if (typeof value === 'string') {
      // String shorthand - infer type from string value
      const knownTypes = ['string', 'number', 'boolean', 'port', 'url', 'email', 'postgres', 'mysql', 'mongodb', 'redis', 'http', 'https', 'json', 'date', 'timestamp', 'duration', 'file'];
      
      if (value.endsWith('?')) {
        // Optional type or string
        const baseType = value.slice(0, -1);
        if (knownTypes.includes(baseType)) {
          normalized[key] = { type: baseType, optional: true };
        } else {
          normalized[key] = { type: 'string', optional: true };
        }
      } else if (value.includes(':')) {
        // Type with default value
        const [type, defaultValue] = value.split(':', 2);
        normalized[key] = { type, default: defaultValue };
      } else if (knownTypes.includes(value)) {
        // Plain type name - use built-in type
        normalized[key] = { type: value };
      } else {
        // Plain string - treat as default value
        normalized[key] = { 
          type: 'string', 
          default: value,
          validator: (val: string) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            if (val === '' && !(normalized[key] as any).allowEmpty) {
              throw new Error('String cannot be empty');
            }
            return val;
          }
        };
      }
    } else if (typeof value === 'number') {
      // Number shorthand - use as default value
      normalized[key] = { 
        type: 'number', 
        default: value,
        validator: (val: string) => {
          const num = Number(val);
          if (isNaN(num)) {
            throw new Error(`Invalid number: "${val}"`);
          }
          return num;
        }
      };
    } else if (typeof value === 'boolean') {
      // Boolean shorthand - use as default value
      normalized[key] = { 
        type: 'boolean', 
        default: value,
        validator: (val: string) => {
          const lowerValue = val.toLowerCase();
          if (['true', '1', 'yes', 'on'].includes(lowerValue)) {
            return true;
          }
          if (['false', '0', 'no', 'off', ''].includes(lowerValue)) {
            return false;
          }
          throw new Error(`Invalid boolean: "${val}"`);
        }
      };
    } else if (Array.isArray(value)) {
      // Array shorthand - use as enum with validation
      const enumValues = value.map(String);
      normalized[key] = { 
        type: 'string', 
        enum: enumValues,
        validator: (val: string, envKey?: string) => {
          if (!enumValues.includes(val)) {
            const keyName = envKey || key;
            throw new Error(`${keyName} must be one of: ${enumValues.join(', ')}`);
          }
          return val;
        }
      };
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
        env: resolver.load ? await resolver.load() : {}
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
            source: resolver.name || 'unknown',
            timestamp: Date.now(),
            ...(resolver.metadata?.cached !== undefined && { cached: Boolean(resolver.metadata.cached) })
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
        const env = resolver.load ? await resolver.load() : {};
        for (const [key, value] of Object.entries(env)) {
          if (value !== undefined) {
            // priority: 'first' - only set if not already defined
            if (mergedEnv[key] !== undefined) {
              // Skip: value already set by earlier resolver
              continue;
            }

            mergedEnv[key] = value;
            provenance[key] = {
              source: resolver.name || 'unknown',
              timestamp: Date.now(),
              ...(resolver.metadata?.cached !== undefined && { cached: Boolean(resolver.metadata.cached) })
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
            source: resolver.name || 'unknown',
            timestamp: Date.now(),
            ...(resolver.metadata?.cached !== undefined && { cached: Boolean(resolver.metadata.cached) })
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (policies.enforceAllowedSources && (policies.enforceAllowedSources as any)[key] && provenanceForKey) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const allowed = (policies.enforceAllowedSources as any)[key];
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
  const envVarRegex = /^[A-Za-z_][A-Za-z0-9_]*$/;

  for (const key of Object.keys(schema)) {
    if (!envVarRegex.test(key)) {
      errors.push(`Invalid environment variable name: "${key}". Environment variable names must contain only letters, numbers, and underscores, and cannot start with a number.`);
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
    priority = 'last',
    secretsDir: globalSecretsDir
  } = options;

  // Create result object early and attach audit session if needed
  const result: Record<string, unknown> = {};
  let sessionId: string | undefined;
  
  if (enableAudit) {
    // Ensure audit module is loaded
    if (!attachAuditSession) {
      const audit = await import('./audit');
      auditLogger = audit.logAuditEvent;
      attachAuditSession = audit.attachAuditSession;
    }
    if (attachAuditSession) {
      sessionId = attachAuditSession(result);
    }
  }

  // Validate environment variable names first
  const nameValidationErrors = validateEnvVarNames(schema);
  if (nameValidationErrors.length > 0) {
    if (enableAudit) {
      await logAuditEvent({
        type: 'validation_failure',
        timestamp: Date.now(),
        error: `Invalid environment variable names: ${nameValidationErrors.join(', ')}`,
        sessionId
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

  const errors: string[] = [];

  for (const [key, def] of Object.entries(schema)) {
    const defTyped = def as EnvDefinition;
    const rawValue = mergedEnv[key];

    // Policy checks
    const policyViolation = applyPolicies(key, defTyped, provenance[key], policies);
    if (policyViolation) {
      errors.push(policyViolation);
      if (enableAudit) {
        logAuditEvent({
          type: 'policy_violation',
          timestamp: Date.now(),
          key,
          source: provenance[key]?.source ?? 'unknown',
          error: policyViolation,
          sessionId
        });
      }
      continue;
    }

    try {
      // const type = defTyped.type || 'string';
      let validationResult: ValidationResult;

      // Handle missing values
      if (rawValue === undefined) {
        const effectiveSecretsDir = defTyped.secretsDir ?? globalSecretsDir;

        if (defTyped.type === 'file' && effectiveSecretsDir) {
          const fileName = key.toLowerCase().replace(/_/g, '-');
          const filePath = join(effectiveSecretsDir, fileName);
          const fileResult = validateFile(filePath, key);

          if (fileResult.valid) {
            validationResult = { success: true, value: fileResult.value };
            provenance[key] = {
              source: `secretsDir(${effectiveSecretsDir})`,
              timestamp: Date.now()
            };
          } else {
            validationResult = { success: false, error: fileResult.error ?? `Failed to read secret for ${key}` };
          }
        } else if (defTyped.default !== undefined) {
          validationResult = { success: true, value: defTyped.default };
        } else if (defTyped.optional) {
          validationResult = { success: true, value: undefined };
        } else {
          validationResult = { success: false, error: `Missing required environment variable: ${key}` };
        }
      } else {
        // All validation is handled by the EnvDefinition's validator function
        if (defTyped.validator) {
          try {
            const result = defTyped.validator(rawValue, key);
            validationResult = { success: true, value: result };
          } catch (error) {
            validationResult = { 
              success: false, 
              error: error instanceof Error ? error.message : `Validation failed for ${key}` 
            };
          }
        } else {
          // No validator - just return the raw value
          validationResult = { success: true, value: rawValue };
        }
      }

      if (!validationResult.success) {
        errors.push(validationResult.error!);
        if (enableAudit) {
          await logAuditEvent({
            type: 'validation_failure',
            timestamp: Date.now(),
            key,
            error: validationResult.error!,
            sessionId
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
            metadata: { cached: provenance[key]?.cached },
            sessionId
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
          error: message,
          sessionId
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
        metadata: { errorCount: errors.length },
        sessionId
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
      },
      sessionId
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
  const isProduction = (process.env.NODE_ENV || '').toLowerCase() === 'production';
  const {
    interpolate = false,
    strict = true,
    policies,
    enableAudit = isProduction,
    priority = 'last',
    secretsDir: globalSecretsDir
  } = options;

  // Create result object early and attach audit session if needed
  const result: Record<string, unknown> = {};
  let sessionId: string | undefined;
  
  if (enableAudit) {
    // Ensure audit module is loaded
    if (!attachAuditSession) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const audit = require('./audit');
        auditLogger = audit.logAuditEvent;
        attachAuditSession = audit.attachAuditSession;
      } catch {
        // Audit module can't be loaded
      }
    }
    if (attachAuditSession) {
      sessionId = attachAuditSession(result);
    }
  }

  // Validate environment variable names first
  const nameValidationErrors = validateEnvVarNames(schema);
  if (nameValidationErrors.length > 0) {
    if (enableAudit) {
      logAuditEventSync({
        type: 'validation_failure',
        timestamp: Date.now(),
        error: `Invalid environment variable names: ${nameValidationErrors.join(', ')}`,
        sessionId
      });
    }
    throw new Error(`Environment validation failed:\n${nameValidationErrors.map(e => `  - ${e}`).join('\n')}`);
  }

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

  const errors: string[] = [];

  for (const [key, def] of Object.entries(schema)) {
    const defTyped = def as EnvDefinition;
    const rawValue = mergedEnv[key];

    const policyViolation = applyPolicies(key, defTyped, provenance[key], policies);
    if (policyViolation) {
      errors.push(policyViolation);
      if (enableAudit) {
        logAuditEventSync({
          type: 'policy_violation',
          timestamp: Date.now(),
          key,
          source: provenance[key]?.source ?? 'unknown',
          error: policyViolation,
          sessionId
        });
      }
      continue;
    }

    try {
      // const type = defTyped.type || 'string';
      let validationResult: ValidationResult;

      // Handle missing values
      if (rawValue === undefined) {
        const effectiveSecretsDir = defTyped.secretsDir ?? globalSecretsDir;

        if (defTyped.type === 'file' && effectiveSecretsDir) {
          const fileName = key.toLowerCase().replace(/_/g, '-');
          const filePath = join(effectiveSecretsDir, fileName);
          const fileResult = validateFile(filePath, key);

          if (fileResult.valid) {
            validationResult = { success: true, value: fileResult.value };
            provenance[key] = {
              source: `secretsDir(${effectiveSecretsDir})`,
              timestamp: Date.now()
            };
          } else {
            validationResult = { success: false, error: fileResult.error ?? `Failed to read secret for ${key}` };
          }
        } else if (defTyped.default !== undefined) {
          validationResult = { success: true, value: defTyped.default };
        } else if (defTyped.optional) {
          validationResult = { success: true, value: undefined };
        } else {
          validationResult = { success: false, error: `Missing required environment variable: ${key}` };
        }
      } else {
        // All validation is handled by the EnvDefinition's validator function
        if (defTyped.validator) {
          try {
            const result = defTyped.validator(rawValue, key);
            validationResult = { success: true, value: result };
          } catch (error) {
            validationResult = { 
              success: false, 
              error: error instanceof Error ? error.message : `Validation failed for ${key}` 
            };
          }
        } else {
          // No validator - just return the raw value
          validationResult = { success: true, value: rawValue };
        }
      }

      if (!validationResult.success) {
        errors.push(validationResult.error!);
        if (enableAudit) {
          logAuditEventSync({
            type: 'validation_failure',
            timestamp: Date.now(),
            key,
            error: validationResult.error!,
            sessionId
          });
        }
      } else {
        result[key] = validationResult.value;
        // Audit ALL env var loads (not just secrets - all env vars are sensitive)
        if (enableAudit) {
          logAuditEventSync({
            type: 'env_loaded',
            timestamp: Date.now(),
            key,
            source: provenance[key]?.source ?? 'unknown',
            metadata: { cached: provenance[key]?.cached },
            sessionId
          });
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`${key}: ${message}`);
      if (enableAudit) {
        logAuditEventSync({
          type: 'validation_failure',
          timestamp: Date.now(),
          key,
          error: message,
          sessionId
        });
      }
    }
  }

  if (errors.length > 0) {
    if (enableAudit) {
      logAuditEventSync({
        type: 'validation_failure',
        timestamp: Date.now(),
        error: `${errors.length} validation error(s)`,
        metadata: { errorCount: errors.length },
        sessionId
      });
    }
    throw new Error(`Environment validation failed:\n${errors.map(e => `  - ${e}`).join('\n')}`);
  }

  if (enableAudit) {
    logAuditEventSync({
      type: 'validation_success',
      timestamp: Date.now(),
      metadata: {
        variableCount: Object.keys(schema).length
      },
      sessionId
    });
  }

  // Apply nested delimiter transformation if specified
  if (options.nestedDelimiter) {
    return applyNestedDelimiter(result, options.nestedDelimiter);
  }

  return result;
}
