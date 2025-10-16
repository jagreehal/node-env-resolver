/**
 * Built-in resolvers for environment variable resolution
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import type { Resolver } from './types';
/**
 * Options for the dotenv resolver
 */
export interface DotenvOptions {
  /** Path to the .env file (default: '.env') */
  path?: string;
  /** Enable environment-specific file loading (default: false) */
  expand?: boolean;
}

// Enhanced dotenv parser with escape sequences and edge case handling
const parseDotenv = (content: string) => {
  const env: Record<string, string> = {};
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]?.trim() ?? '';

    // Skip empty lines and comments
    if (!line || line[0] === '#') continue;

    const eqIndex = line.indexOf('=');
    if (eqIndex <= 0) continue; // Invalid line, skip

    const key = line.slice(0, eqIndex).trim();

    // Validate key format (alphanumeric + underscore, no leading digits)
    if (!/^[A-Z_][A-Z0-9_]*$/i.test(key)) continue;

    let value = line.slice(eqIndex + 1).trim();

    // Handle quoted values with escape sequences
    if (value.length >= 2) {
      const quote = value[0];
      if ((quote === '"' || quote === "'") && value[value.length - 1] === quote) {
        value = value.slice(1, -1);

        // Process escape sequences for double quotes only (like bash)
        if (quote === '"') {
          value = value
            .replace(/\\n/g, '\n')
            .replace(/\\r/g, '\r')
            .replace(/\\t/g, '\t')
            .replace(/\\\\/g, '\\')
            .replace(/\\"/g, '"')
            .replace(/\\'/g, "'");
        }
      }
    }

    // Handle unquoted values - trim and stop at comments
    else {
      const commentIndex = value.indexOf('#');
      if (commentIndex >= 0) {
        value = value.slice(0, commentIndex).trim();
      }
    }

    env[key] = value;
  }

  return env;
};

/**
 * Load configuration from .env files
 * Supports environment-specific files when expand=true
 *
 * @param options Path string or options object
 * @returns Resolver that loads from .env file(s)
 *
 * @example
 * ```ts
 * import { dotenv } from 'node-env-resolver/providers';
 *
 * // Simple .env file
 * const resolver = dotenv('.env');
 *
 * // Environment-specific files
 * const resolver = dotenv({ path: '.env', expand: true });
 * // Loads: .env.defaults, .env, .env.local, .env.development, .env.development.local
 * ```
 */
export function dotenv(options?: string | DotenvOptions): Resolver {
  const opts = typeof options === 'string' ? { path: options, expand: false } : { path: options?.path ?? '.env', expand: options?.expand ?? false };

  return {
    name: opts.expand ? `dotenv-expand(${opts.path})` : `dotenv(${opts.path})`,
    async load() {
      if (!opts.expand) {
        const p = join(process.cwd(), opts.path!);
        return existsSync(p) ? parseDotenv(readFileSync(p, 'utf8')) : {};
      }

      const base = opts.path!;
      const env = process.env.NODE_ENV || 'development';
      const files = [`${base}.defaults`, base, `${base}.local`, `${base}.${env}`, `${base}.${env}.local`];
      let merged: Record<string, string> = {};

      for (const file of files) {
        const p = join(process.cwd(), file);
        if (existsSync(p)) {
          try { merged = { ...merged, ...parseDotenv(readFileSync(p, 'utf8')) }; } catch { /* ignore file read errors */ }
        }
      }

      return merged;
    },
    loadSync() {
      if (!opts.expand) {
        const p = join(process.cwd(), opts.path!);
        return existsSync(p) ? parseDotenv(readFileSync(p, 'utf8')) : {};
      }

      const base = opts.path!;
      const env = process.env.NODE_ENV || 'development';
      const files = [`${base}.defaults`, base, `${base}.local`, `${base}.${env}`, `${base}.${env}.local`];
      let merged: Record<string, string> = {};

      for (const file of files) {
        const p = join(process.cwd(), file);
        if (existsSync(p)) {
          try { merged = { ...merged, ...parseDotenv(readFileSync(p, 'utf8')) }; } catch { /* ignore file read errors */ }
        }
      }

      return merged;
    }
  };
}

/**
 * Resolver that reads from process.env
 * This is the default resolver used when no custom resolvers are provided
 *
 * @returns Resolver that loads environment variables from process.env
 *
 * @example
 * ```ts
 * import { processEnv } from 'node-env-resolver/providers';
 *
 * const resolver = processEnv();
 * const env = await resolver.load(); // { PORT: '3000', NODE_ENV: 'development', ... }
 * ```
 */
export function processEnv(): Resolver {
  return {
    name: 'process.env',
    async load() {
      return { ...process.env } as Record<string, string>;
    },
    loadSync() {
      return { ...process.env } as Record<string, string>;
    }
  };
}
