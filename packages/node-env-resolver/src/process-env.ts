import { SyncResolver } from "./types";

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
  return {
    name: 'process.env',
    async load() {
      const env: Record<string, string> = {};
      for (const [key, value] of Object.entries(process.env)) {
        if (value !== undefined) {
          env[key] = value;
        }
      }
      return env;
    },
    loadSync() {
      const env: Record<string, string> = {};
      for (const [key, value] of Object.entries(process.env)) {
        if (value !== undefined) {
          env[key] = value;
        }
      }
      return env;
    }
  };
}