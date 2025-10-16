import { SyncResolver } from "./types";

/**
 * Resolver that reads from process.env
 * This is the default resolver used when no custom resolvers are provided
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