import { SyncResolver } from './types';

/**
 * Resolver that reads from a plain object (Lambda/Workers env, tests, etc.)
 * Undefined values are skipped. The object is read at load time, not creation.
 *
 * @example
 * ```ts
 * import { resolve } from 'node-env-resolver';
 * import { fromObject } from 'node-env-resolver/resolvers';
 *
 * const config = resolve({
 *   resolvers: [[fromObject({ PORT: '8080' }), { PORT: port() }]],
 * });
 * ```
 */
export function fromObject(
  env: Record<string, string | undefined>,
  name = 'object',
): SyncResolver {
  const loadSync = () => {
    const out: Record<string, string> = {};
    for (const [key, value] of Object.entries(env)) {
      if (value !== undefined) {
        out[key] = value;
      }
    }
    return out;
  };
  return { name, load: async () => loadSync(), loadSync };
}

/**
 * Resolver that reads from process.env
 * This is the default resolver used when no custom resolvers are provided
 *
 * @returns SyncResolver that loads environment variables from process.env
 *
 * @example
 * ```ts
 * import { processEnv } from 'node-env-resolver';
 *
 * const resolver = processEnv();
 * const env = resolver.loadSync(); // { PORT: '3000', NODE_ENV: 'development', ... }
 * ```
 */
export function processEnv(): SyncResolver {
  return fromObject(process.env, 'process.env');
}
