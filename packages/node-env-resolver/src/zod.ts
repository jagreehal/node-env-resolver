/**
 * Zod integration for node-env-resolver
 * Import from 'node-env-resolver/zod' to use this
 */

import {
  processEnv, type Resolver, type PolicyOptions
} from './index';
import type { SafeResolveResult, ValidationIssue } from './validation-types';
async function resolveFromResolvers(resolvers: Resolver[], interpolate: boolean, strict: boolean) {
  let env: Record<string, string> = {};
  for (const resolver of resolvers) {
    try {
      const data = await resolver.load();
      env = { ...env, ...data };
    } catch (error) {
      if (strict) throw new Error(`Resolver ${resolver.name} failed: ${error instanceof Error ? error.message : error}`);
    }
  }
  
  if (interpolate) {
    for (const [key, value] of Object.entries(env)) {
      env[key] = value.replace(/\$\{([^}]+)\}/g, (_, varName) => env[varName] || '');
    }
  }
  
  return env;
}

export type InferZodOutput<T> = T extends { parse: (input: unknown) => infer R } ? R : never;

/**
 * Convert Zod error to unified ValidationIssue format
 */
function zodErrorToIssues(zodError: unknown): ValidationIssue[] {
  if (!zodError || typeof zodError !== 'object') {
    return [{ path: [], message: 'Validation failed', code: 'unknown_error' }];
  }

  const error = zodError as { issues?: Array<{ path: (string | number)[]; message: string; code?: string }> };

  if (!error.issues || !Array.isArray(error.issues)) {
    return [{ path: [], message: 'Validation failed', code: 'unknown_error' }];
  }

  return error.issues.map(issue => ({
    path: issue.path || [],
    message: issue.message,
    code: issue.code
  }));
}

/**
 * Resolve environment variables using Zod schema (throws on validation error)
 *
 * @example
 * ```ts
 * import { resolveZod } from 'node-env-resolver/zod';
 * import * as z from 'zod';
 *
 * const schema = z.object({
 *   PORT: z.coerce.number().default(3000),
 *   DATABASE_URL: z.string().url()
 * });
 *
 * const env = await resolveZod(schema);
 * console.log(env.PORT);  // number
 * ```
 */
export async function resolveZod<TSchema extends { parse: (input: unknown) => unknown }>(
  zodSchema: TSchema,
  options: { resolvers?: Resolver[]; interpolate?: boolean; strict?: boolean; policies?: PolicyOptions } = {}
): Promise<InferZodOutput<TSchema>> {
  const { resolvers = [processEnv()], interpolate = false, strict = true } = options;
  const mergedEnv = await resolveFromResolvers(resolvers, interpolate, strict);
  return zodSchema.parse(mergedEnv) as InferZodOutput<TSchema>;
}

/**
 * Safe version - returns result object instead of throwing (unified error format)
 *
 * @example
 * ```ts
 * import { safeResolveZod } from 'node-env-resolver/zod';
 * import * as z from 'zod';
 *
 * const schema = z.object({
 *   PORT: z.coerce.number(),
 *   DATABASE_URL: z.string().url()
 * });
 *
 * const result = await safeResolveZod(schema);
 *
 * if (result.success) {
 *   console.log(result.data.PORT);
 * } else {
 *   console.error(result.error);
 *   result.issues.forEach(issue => {
 *     console.log(`${issue.path.join('.')}: ${issue.message}`);
 *   });
 * }
 * ```
 */
export async function safeResolveZod<TSchema extends { safeParse: (input: unknown) => { success: boolean; data?: unknown; error?: unknown } }>(
  zodSchema: TSchema,
  options: { resolvers?: Resolver[]; interpolate?: boolean; strict?: boolean; policies?: PolicyOptions } = {}
): Promise<SafeResolveResult<InferZodOutput<TSchema>>> {
  try {
    const { resolvers = [processEnv()], interpolate = false, strict = true } = options;
    const mergedEnv = await resolveFromResolvers(resolvers, interpolate, strict);
    const result = zodSchema.safeParse(mergedEnv);

    if (result.success) {
      return { success: true, data: result.data as InferZodOutput<TSchema> };
    }

    const issues = zodErrorToIssues(result.error);
    const errorMessage = issues.map(issue => issue.message).join(', ');
    return { success: false, error: errorMessage, issues };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      issues: [{ path: [], message: error instanceof Error ? error.message : String(error), code: 'resolver_error' }]
    };
  }
}

function resolveFromResolversSync(resolvers: Resolver[], interpolate: boolean, strict: boolean) {
  let env: Record<string, string> = {};
  for (const resolver of resolvers) {
    try {
      if (!resolver.loadSync) {
        if (strict) throw new Error(`Resolver ${resolver.name} does not support sync loading`);
        continue;
      }
      const data = resolver.loadSync();
      env = { ...env, ...data };
    } catch (error) {
      if (strict) throw new Error(`Resolver ${resolver.name} failed: ${error instanceof Error ? error.message : error}`);
    }
  }

  if (interpolate) {
    for (const [key, value] of Object.entries(env)) {
      env[key] = value.replace(/\$\{([^}]+)\}/g, (_, varName) => env[varName] || '');
    }
  }

  return env;
}

/**
 * Sync version of resolveZod (throws on validation error)
 *
 * @example
 * ```ts
 * import { resolveSyncZod } from 'node-env-resolver/zod';
 * import * as z from 'zod';
 *
 * const schema = z.object({
 *   PORT: z.coerce.number().default(3000)
 * });
 *
 * const env = resolveSyncZod(schema);
 * console.log(env.PORT);
 * ```
 */
export function resolveSyncZod<TSchema extends { parse: (input: unknown) => unknown }>(
  zodSchema: TSchema,
  options: { resolvers?: Resolver[]; interpolate?: boolean; strict?: boolean; policies?: PolicyOptions } = {}
): InferZodOutput<TSchema> {
  const { resolvers = [processEnv()], interpolate = false, strict = true } = options;
  const mergedEnv = resolveFromResolversSync(resolvers, interpolate, strict);
  return zodSchema.parse(mergedEnv) as InferZodOutput<TSchema>;
}

/**
 * Safe sync version - returns result object instead of throwing (unified error format)
 *
 * @example
 * ```ts
 * import { safeResolveSyncZod } from 'node-env-resolver/zod';
 * import * as z from 'zod';
 *
 * const schema = z.object({
 *   PORT: z.coerce.number()
 * });
 *
 * const result = safeResolveSyncZod(schema);
 *
 * if (result.success) {
 *   console.log(result.data.PORT);
 * } else {
 *   console.error(result.error);
 *   result.issues.forEach(issue => {
 *     console.log(`${issue.path.join('.')}: ${issue.message}`);
 *   });
 * }
 * ```
 */
export function safeResolveSyncZod<TSchema extends { safeParse: (input: unknown) => { success: boolean; data?: unknown; error?: unknown } }>(
  zodSchema: TSchema,
  options: { resolvers?: Resolver[]; interpolate?: boolean; strict?: boolean; policies?: PolicyOptions } = {}
): SafeResolveResult<InferZodOutput<TSchema>> {
  try {
    const { resolvers = [processEnv()], interpolate = false, strict = true } = options;
    const mergedEnv = resolveFromResolversSync(resolvers, interpolate, strict);
    const result = zodSchema.safeParse(mergedEnv);

    if (result.success) {
      return { success: true, data: result.data as InferZodOutput<TSchema> };
    }

    const issues = zodErrorToIssues(result.error);
    const errorMessage = issues.map(issue => issue.message).join(', ');
    return { success: false, error: errorMessage, issues };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      issues: [{ path: [], message: error instanceof Error ? error.message : String(error), code: 'resolver_error' }]
    };
  }
}