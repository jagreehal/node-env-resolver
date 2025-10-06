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

export async function resolveEnvWithZod<TSchema extends { parse: (input: unknown) => unknown }>(
  zodSchema: TSchema,
  options: { resolvers?: Resolver[]; interpolate?: boolean; strict?: boolean; policies?: PolicyOptions } = {}
): Promise<InferZodOutput<TSchema>> {
  const { resolvers = [processEnv()], interpolate = false, strict = true } = options;
  const mergedEnv = await resolveFromResolvers(resolvers, interpolate, strict);
  return zodSchema.parse(mergedEnv) as InferZodOutput<TSchema>;
}