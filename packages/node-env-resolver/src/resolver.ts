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
  strict: boolean
): Promise<{ mergedEnv: Record<string, string>; provenance: Record<string, Provenance> }> {
  const mergedEnv: Record<string, string> = {};
  const provenance: Record<string, Provenance> = {};

  for (const resolver of resolvers) {
    try {
      const env = await resolver.load();
      for (const [key, value] of Object.entries(env)) {
        if (value !== undefined) {
          mergedEnv[key] = value;
          provenance[key] = {
            source: resolver.name,
            timestamp: Date.now(),
          };
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
 * Resolve from resolvers (sync)
 */
function resolveFromResolversSync(
  resolvers: Resolver[],
  interpolate: boolean,
  strict: boolean
): { mergedEnv: Record<string, string>; provenance: Record<string, Provenance> } {
  const mergedEnv: Record<string, string> = {};
  const provenance: Record<string, Provenance> = {};

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
          mergedEnv[key] = value;
          provenance[key] = {
            source: resolver.name,
            timestamp: Date.now(),
          };
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
 * Internal resolver - used by both old resolve() and new env() APIs
 */
export async function resolveEnvInternal<T extends EnvSchema>(
  schema: T,
  options: ResolveOptions
): Promise<Record<string, unknown>> {
  const isProduction = (process.env.NODE_ENV || '').toLowerCase() === 'production';
  const {
    resolvers = [],
    interpolate = false,
    strict = true,
    policies,
    enableAudit = isProduction
  } = options;

  const { mergedEnv, provenance } = await resolveFromResolvers(resolvers, interpolate, strict);

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
  options: ResolveOptions
): Record<string, unknown> {
  const {
    resolvers = [],
    interpolate = false,
    strict = true,
    policies
  } = options;

  const { mergedEnv, provenance } = resolveFromResolversSync(resolvers, interpolate, strict);

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
