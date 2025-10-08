/**
 * Zod integration for node-env-resolver
 * Import from 'node-env-resolver/zod' to use this
 */

import {
  processEnv, type Resolver, type PolicyOptions
} from './index.js';
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
 * Convert a Zod schema to Standard Schema format
 */
export function zodToStandardSchema<T extends { safeParseAsync: (input: unknown) => Promise<{ success: boolean; data?: unknown; error?: { issues: Array<{ message: string; path: unknown[] }> } }> }>(zodSchema: T) {
  return {
    '~standard': {
      version: 1 as const,
      vendor: 'zod',
      validate: async (value: unknown) => {
        const result = await zodSchema.safeParseAsync(value);
        if (result.success) {
          return { value: result.data };
        }
        return {
          issues: result.error?.issues.map(issue => ({
            message: issue.message,
            path: issue.path
          })) || [{
            message: 'Zod validation failed',
            path: []
          }]
        };
      },
      types: {
        input: {} as unknown,
        output: {} as InferZodOutput<T>
      }
    }
  };
}

/**
 * Resolve environment variables using Zod schema (throws on validation error)
 *
 * @example
 * ```ts
 * import { resolveZod } from 'node-env-resolver/zod';
 * import { z } from 'zod';
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
 * Safe version - returns result object instead of throwing (Zod-like pattern)
 *
 * @example
 * ```ts
 * import { safeResolveZod } from 'node-env-resolver/zod';
 * import { z } from 'zod';
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
 * }
 * ```
 */
export async function safeResolveZod<TSchema extends { safeParse: (input: unknown) => { success: boolean; data?: unknown; error?: { issues: Array<{ message: string }> } } }>(
  zodSchema: TSchema,
  options: { resolvers?: Resolver[]; interpolate?: boolean; strict?: boolean; policies?: PolicyOptions } = {}
): Promise<
  | { success: true; data: InferZodOutput<TSchema> }
  | { success: false; error: string }
> {
  try {
    const { resolvers = [processEnv()], interpolate = false, strict = true } = options;
    const mergedEnv = await resolveFromResolvers(resolvers, interpolate, strict);
    const result = zodSchema.safeParse(mergedEnv);

    if (result.success) {
      return { success: true, data: result.data as InferZodOutput<TSchema> };
    }

    const errorMessage = result.error?.issues.map(issue => issue.message).join(', ') || 'Validation failed';
    return { success: false, error: errorMessage };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
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
 * import { z } from 'zod';
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
 * Safe sync version - returns result object instead of throwing
 *
 * @example
 * ```ts
 * import { safeResolveSyncZod } from 'node-env-resolver/zod';
 * import { z } from 'zod';
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
 * }
 * ```
 */
export function safeResolveSyncZod<TSchema extends { safeParse: (input: unknown) => { success: boolean; data?: unknown; error?: { issues: Array<{ message: string }> } } }>(
  zodSchema: TSchema,
  options: { resolvers?: Resolver[]; interpolate?: boolean; strict?: boolean; policies?: PolicyOptions } = {}
):
  | { success: true; data: InferZodOutput<TSchema> }
  | { success: false; error: string }
{
  try {
    const { resolvers = [processEnv()], interpolate = false, strict = true } = options;
    const mergedEnv = resolveFromResolversSync(resolvers, interpolate, strict);
    const result = zodSchema.safeParse(mergedEnv);

    if (result.success) {
      return { success: true, data: result.data as InferZodOutput<TSchema> };
    }

    const errorMessage = result.error?.issues.map(issue => issue.message).join(', ') || 'Validation failed';
    return { success: false, error: errorMessage };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}