/**
 * Valibot integration for node-env-resolver
 * Import from 'node-env-resolver/valibot' to use this
 *
 * @example
 * ```ts
 * import { resolveValibot } from 'node-env-resolver/valibot';
 * import * as v from 'valibot';
 *
 * const schema = v.object({
 *   PORT: v.pipe(v.string(), v.transform(Number)),
 *   DATABASE_URL: v.pipe(v.string(), v.url())
 * });
 *
 * const config = await resolveValibot(schema);
 * ```
 */

import {
  type Resolver,
  type PolicyOptions,
  type Provenance,
  type ReferenceOptions,
} from './index';
import { processEnv } from './resolvers';
import { resolveReferences, resolveReferencesSync } from './references';
import type { SafeResolveResult, ValidationIssue } from './validation-types';

type ResolveValibotOptions = {
  resolvers?: Resolver[];
  interpolate?: boolean;
  strict?: boolean;
  policies?: PolicyOptions;
  references?: ReferenceOptions;
};

async function resolveFromResolvers(
  resolvers: Resolver[],
  interpolate: boolean,
  strict: boolean,
  references?: ReferenceOptions,
) {
  let env: Record<string, string> = {};
  const provenance: Record<string, Provenance> = {};
  for (const resolver of resolvers) {
    try {
      const data = resolver.load ? await resolver.load() : {};
      env = { ...env, ...data };
      for (const [key, value] of Object.entries(data)) {
        if (value !== undefined) {
          provenance[key] = {
            source: resolver.name || 'unknown',
            timestamp: Date.now(),
          };
        }
      }
    } catch (error) {
      if (strict)
        throw new Error(
          `Resolver ${resolver.name} failed: ${error instanceof Error ? error.message : error}`,
          { cause: error },
        );
    }
  }

  if (interpolate) {
    for (const [key, value] of Object.entries(env)) {
      env[key] = value.replace(
        /\$\{([^}]+)\}/g,
        (_, varName) => env[varName] || '',
      );
    }
  }

  await resolveReferences(env, provenance, references);

  return { env, provenance };
}

function resolveFromResolversSync(
  resolvers: Resolver[],
  interpolate: boolean,
  strict: boolean,
  references?: ReferenceOptions,
) {
  let env: Record<string, string> = {};
  const provenance: Record<string, Provenance> = {};
  for (const resolver of resolvers) {
    try {
      if (!resolver.loadSync) {
        if (strict)
          throw new Error(
            `Resolver ${resolver.name} does not support sync loading`,
          );
        continue;
      }
      const data = resolver.loadSync();
      env = { ...env, ...data };
      for (const [key, value] of Object.entries(data)) {
        if (value !== undefined) {
          provenance[key] = {
            source: resolver.name || 'unknown',
            timestamp: Date.now(),
          };
        }
      }
    } catch (error) {
      if (strict)
        throw new Error(
          `Resolver ${resolver.name} failed: ${error instanceof Error ? error.message : error}`,
          { cause: error },
        );
    }
  }

  if (interpolate) {
    for (const [key, value] of Object.entries(env)) {
      env[key] = value.replace(
        /\$\{([^}]+)\}/g,
        (_, varName) => env[varName] || '',
      );
    }
  }

  resolveReferencesSync(env, provenance, references);

  return { env, provenance };
}

/**
 * Type inference for Valibot schema output
 * Uses Valibot's InferOutput if available, falls back to generic inference
 */
export type InferValibotOutput<T> = T extends { _types?: { output: infer O } }
  ? O
  : T extends { parse: (input: unknown) => infer R }
    ? R
    : unknown;

/**
 * Convert Valibot issues to unified ValidationIssue format
 */
function valibotIssuesToIssues(vIssues: unknown): ValidationIssue[] {
  if (!vIssues || !Array.isArray(vIssues)) {
    return [{ path: [], message: 'Validation failed', code: 'unknown_error' }];
  }

  return vIssues.map((issue: unknown) => {
    if (!issue || typeof issue !== 'object') {
      return { path: [], message: 'Validation failed', code: 'unknown_error' };
    }

    const vIssue = issue as {
      path?: Array<{ key: string | number }>;
      message?: string;
      type?: string;
    };

    return {
      path: vIssue.path?.map((p) => p.key) || [],
      message: vIssue.message || 'Validation failed',
      code: vIssue.type,
    };
  });
}

/**
 * Resolve environment variables using Valibot schema (throws on validation error)
 *
 * @example
 * ```ts
 * import { resolveValibot } from 'node-env-resolver/valibot';
 * import * as v from 'valibot';
 *
 * const schema = v.object({
 *   PORT: v.pipe(v.string(), v.transform(Number)),
 *   DATABASE_URL: v.pipe(v.string(), v.url())
 * });
 *
 * const env = await resolveValibot(schema);
 * console.log(env.PORT);  // number
 * ```
 */
export async function resolveValibot<
  TSchema extends { parseAsync: (input: unknown) => Promise<unknown> },
>(
  valibotSchema: TSchema,
  options: ResolveValibotOptions = {},
): Promise<InferValibotOutput<TSchema>> {
  const {
    resolvers = [processEnv()],
    interpolate = false,
    strict = true,
    references,
  } = options;
  const { env: mergedEnv } = await resolveFromResolvers(
    resolvers,
    interpolate,
    strict,
    references,
  );
  return valibotSchema.parseAsync(mergedEnv) as Promise<
    InferValibotOutput<TSchema>
  >;
}

/**
 * Safe version - returns result object instead of throwing (unified error format)
 *
 * @example
 * ```ts
 * import { safeResolveValibot } from 'node-env-resolver/valibot';
 * import * as v from 'valibot';
 *
 * const schema = v.object({
 *   PORT: v.pipe(v.string(), v.transform(Number)),
 *   DATABASE_URL: v.pipe(v.string(), v.url())
 * });
 *
 * const result = await safeResolveValibot(schema);
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
export async function safeResolveValibot<
  TSchema extends {
    safeParseAsync: (
      input: unknown,
    ) => Promise<{ success: boolean; output?: unknown; issues?: unknown }>;
  },
>(
  valibotSchema: TSchema,
  options: ResolveValibotOptions = {},
): Promise<SafeResolveResult<InferValibotOutput<TSchema>>> {
  try {
    const {
      resolvers = [processEnv()],
      interpolate = false,
      strict = true,
      references,
    } = options;
    const { env: mergedEnv } = await resolveFromResolvers(
      resolvers,
      interpolate,
      strict,
      references,
    );
    const result = await valibotSchema.safeParseAsync(mergedEnv);

    if (result.success) {
      return {
        success: true,
        data: result.output as InferValibotOutput<TSchema>,
      };
    }

    const issues = valibotIssuesToIssues(result.issues);
    const errorMessage = issues.map((issue) => issue.message).join(', ');
    return { success: false, error: errorMessage, issues };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      issues: [
        {
          path: [],
          message: error instanceof Error ? error.message : String(error),
          code: 'resolver_error',
        },
      ],
    };
  }
}

/**
 * Sync version of resolveValibot (throws on validation error)
 *
 * @example
 * ```ts
 * import { resolveSyncValibot } from 'node-env-resolver/valibot';
 * import * as v from 'valibot';
 *
 * const schema = v.object({
 *   PORT: v.pipe(v.string(), v.transform(Number))
 * });
 *
 * const env = resolveSyncValibot(schema);
 * console.log(env.PORT);
 * ```
 */
export function resolveSyncValibot<
  TSchema extends { parse: (input: unknown) => unknown },
>(
  valibotSchema: TSchema,
  options: ResolveValibotOptions = {},
): InferValibotOutput<TSchema> {
  const {
    resolvers = [processEnv()],
    interpolate = false,
    strict = true,
    references,
  } = options;
  const { env: mergedEnv } = resolveFromResolversSync(
    resolvers,
    interpolate,
    strict,
    references,
  );
  return valibotSchema.parse(mergedEnv) as InferValibotOutput<TSchema>;
}

/**
 * Safe sync version - returns result object instead of throwing (unified error format)
 *
 * @example
 * ```ts
 * import { safeResolveSyncValibot } from 'node-env-resolver/valibot';
 * import * as v from 'valibot';
 *
 * const schema = v.object({
 *   PORT: v.pipe(v.string(), v.transform(Number))
 * });
 *
 * const result = safeResolveSyncValibot(schema);
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
export function safeResolveSyncValibot<
  TSchema extends {
    safeParse: (input: unknown) => {
      success: boolean;
      output?: unknown;
      issues?: unknown;
    };
  },
>(
  valibotSchema: TSchema,
  options: ResolveValibotOptions = {},
): SafeResolveResult<InferValibotOutput<TSchema>> {
  try {
    const {
      resolvers = [processEnv()],
      interpolate = false,
      strict = true,
      references,
    } = options;
    const { env: mergedEnv } = resolveFromResolversSync(
      resolvers,
      interpolate,
      strict,
      references,
    );
    const result = valibotSchema.safeParse(mergedEnv);

    if (result.success) {
      return {
        success: true,
        data: result.output as InferValibotOutput<TSchema>,
      };
    }

    const issues = valibotIssuesToIssues(result.issues);
    const errorMessage = issues.map((issue) => issue.message).join(', ');
    return { success: false, error: errorMessage, issues };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      issues: [
        {
          path: [],
          message: error instanceof Error ? error.message : String(error),
          code: 'resolver_error',
        },
      ],
    };
  }
}
