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
} from './types';import { toStandardSchema } from './standard-schema';import { logAuditEvent } from './audit';
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
        logAuditEvent({
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
        logAuditEvent({
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
      logAuditEvent({
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
      logAuditEvent({
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
      const standardDef = toStandardSchema(key, def);
      const validationResult = standardDef['~standard'].validate(rawValue);

      if (validationResult instanceof Promise) {
        const resolved = await validationResult;
        if (resolved.issues) {
          errors.push(...resolved.issues.map((issue) => issue.message));
        } else {
          result[key] = resolved.value;
        }
      } else {
        if (validationResult.issues) {
          errors.push(...validationResult.issues.map((issue) => issue.message));
          if (enableAudit) {
            logAuditEvent({
              type: 'validation_failure',
              timestamp: Date.now(),
              key,
              error: validationResult.issues.map((i) => i.message).join('; ')
            });
          }
        } else {
          result[key] = validationResult.value;
          // Audit ALL env var loads (not just secrets - all env vars are sensitive)
          if (enableAudit) {
            logAuditEvent({
              type: 'env_loaded',
              timestamp: Date.now(),
              key,
              source: provenance[key]?.source ?? 'unknown',
              metadata: { cached: provenance[key]?.cached }
            });
          }
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`${key}: ${message}`);
      if (enableAudit) {
        logAuditEvent({
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
      logAuditEvent({
        type: 'validation_failure',
        timestamp: Date.now(),
        error: `${errors.length} validation error(s)`,
        metadata: { errorCount: errors.length }
      });
    }
    throw new Error(`Environment validation failed:\n${errors.map(e => `  - ${e}`).join('\n')}`);
  }

  if (enableAudit) {
    logAuditEvent({
      type: 'validation_success',
      timestamp: Date.now(),
      metadata: {
        variableCount: Object.keys(schema).length
      }
    });
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
      const standardDef = toStandardSchema(key, def);
      const validationResult = standardDef['~standard'].validate(rawValue);

      if (validationResult instanceof Promise) {
        throw new Error(`resolveSync cannot validate '${key}' because validation is async`);
      }

      if (validationResult.issues) {
        errors.push(...validationResult.issues.map((issue) => issue.message));
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

  return result;
}
