/**
 * Built-in resolvers for environment variable resolution
 */

import { readFileSync, existsSync } from 'fs';
import { join, resolve as resolvePath } from 'path';
import type { Resolver } from './types';

export { processEnv } from './process-env';

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
      if (
        (quote === '"' || quote === "'") &&
        value[value.length - 1] === quote
      ) {
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
 * import { dotenv } from 'node-env-resolver/resolvers';
 *
 * // Simple .env file
 * const config = await resolveAsync([
 *   dotenv('.env'),
 *   { PORT: 3000, API_KEY: string() }
 * ]);
 *
 * // Environment-specific files
 * const config = await resolveAsync([
 *   dotenv({ path: '.env', expand: true }),
 *   { PORT: 3000 }
 * ]);
 * // Loads: .env.defaults, .env, .env.local, .env.development, .env.development.local
 * ```
 */
export function dotenv(options?: string | DotenvOptions): Resolver {
  const opts =
    typeof options === 'string'
      ? { path: options, expand: false }
      : { path: options?.path ?? '.env', expand: options?.expand ?? false };

  return {
    name: opts.expand ? `dotenv-expand(${opts.path})` : `dotenv(${opts.path})`,
    async load() {
      if (!opts.expand) {
        const p = resolvePath(process.cwd(), opts.path!);
        return existsSync(p) ? parseDotenv(readFileSync(p, 'utf8')) : {};
      }

      const base = opts.path!;
      const env = process.env.NODE_ENV || 'development';
      const files = [
        `${base}.defaults`,
        base,
        `${base}.local`,
        `${base}.${env}`,
        `${base}.${env}.local`,
      ];
      let merged: Record<string, string> = {};

      for (const file of files) {
        const p = resolvePath(process.cwd(), file);
        if (existsSync(p)) {
          try {
            merged = { ...merged, ...parseDotenv(readFileSync(p, 'utf8')) };
          } catch {
            /* ignore file read errors */
          }
        }
      }

      return merged;
    },
    loadSync() {
      if (!opts.expand) {
        const p = resolvePath(process.cwd(), opts.path!);
        return existsSync(p) ? parseDotenv(readFileSync(p, 'utf8')) : {};
      }

      const base = opts.path!;
      const env = process.env.NODE_ENV || 'development';
      const files = [
        `${base}.defaults`,
        base,
        `${base}.local`,
        `${base}.${env}`,
        `${base}.${env}.local`,
      ];
      let merged: Record<string, string> = {};

      for (const file of files) {
        const p = resolvePath(process.cwd(), file);
        if (existsSync(p)) {
          try {
            merged = { ...merged, ...parseDotenv(readFileSync(p, 'utf8')) };
          } catch {
            /* ignore file read errors */
          }
        }
      }

      return merged;
    },
  };
}

/**
 * Load configuration from package.json
 * Reads version, name, and config fields by default
 *
 * @param options Optional configuration
 * @returns Resolver that loads from package.json
 *
 * @example
 * ```ts
 * import { packageJson } from 'node-env-resolver/resolvers';
 *
 * // Loads: VERSION, NAME, CONFIG_* from package.json
 * const config = await resolveAsync([
 *   packageJson(),
 *   { VERSION: string(), NAME: string() }
 * ]);
 * ```
 */
export function packageJson(options?: {
  path?: string;
  fields?: string[];
}): Resolver {
  const opts = {
    path: options?.path ?? 'package.json',
    fields: options?.fields ?? ['version', 'name', 'config'],
  };

  return {
    name: 'package.json',
    async load() {
      const fullPath = resolvePath(process.cwd(), opts.path);
      if (!existsSync(fullPath)) return {};

      try {
        const content = readFileSync(fullPath, 'utf8');
        const pkg = JSON.parse(content);
        const env: Record<string, string> = {};

        for (const field of opts.fields) {
          const value = pkg[field];
          if (value === undefined) continue;

          if (field === 'config' && typeof value === 'object') {
            // Flatten config object: { api: { key: 'x' } } → CONFIG_API_KEY=x
            const flatten = (obj: unknown, prefix: string) => {
              if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
                for (const [k, v] of Object.entries(obj)) {
                  const key = `${prefix}_${k.toUpperCase()}`;
                  if (v && typeof v === 'object' && !Array.isArray(v)) {
                    flatten(v, key);
                  } else {
                    env[key] = String(v);
                  }
                }
              }
            };
            flatten(value, 'CONFIG');
          } else {
            // Simple field: version → VERSION, name → NAME
            env[field.toUpperCase()] = String(value);
          }
        }

        return env;
      } catch (error) {
        throw new Error(
          `Failed to read package.json: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    },
    loadSync() {
      const fullPath = resolvePath(process.cwd(), opts.path);
      if (!existsSync(fullPath)) return {};

      try {
        const content = readFileSync(fullPath, 'utf8');
        const pkg = JSON.parse(content);
        const env: Record<string, string> = {};

        for (const field of opts.fields) {
          const value = pkg[field];
          if (value === undefined) continue;

          if (field === 'config' && typeof value === 'object') {
            // Flatten config object
            const flatten = (obj: unknown, prefix: string) => {
              if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
                for (const [k, v] of Object.entries(obj)) {
                  const key = `${prefix}_${k.toUpperCase()}`;
                  if (v && typeof v === 'object' && !Array.isArray(v)) {
                    flatten(v, key);
                  } else {
                    env[key] = String(v);
                  }
                }
              }
            };
            flatten(value, 'CONFIG');
          } else {
            env[field.toUpperCase()] = String(value);
          }
        }

        return env;
      } catch (error) {
        throw new Error(
          `Failed to read package.json: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    },
  };
}

/**
 * Load configuration from a remote HTTP/HTTPS endpoint
 * Expects JSON response
 *
 * @param url URL to fetch config from
 * @param options Optional fetch options
 * @returns Resolver that loads from HTTP
 *
 * @example
 * ```ts
 * import { http } from 'node-env-resolver/resolvers';
 *
 * // Fetch config from remote endpoint
 * const config = await resolveAsync([
 *   http('https://config.example.com/app.json'),
 *   { PORT: 3000, API_KEY: string() }
 * ]);
 * ```
 */
export function http(
  url: string,
  options?: RequestInit & { timeout?: number },
): Resolver {
  return {
    name: `http(${url})`,
    async load() {
      try {
        const controller = new AbortController();
        const timeout = options?.timeout ?? 5000;
        const timeoutId = setTimeout(() => controller.abort(), timeout);

        const response = await fetch(url, {
          ...options,
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();

        // Flatten nested objects
        const flattened: Record<string, string> = {};
        const flatten = (obj: unknown, prefix = '') => {
          if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
            for (const [key, value] of Object.entries(obj)) {
              const newKey = prefix ? `${prefix}_${key}` : key;
              if (value && typeof value === 'object' && !Array.isArray(value)) {
                flatten(value, newKey);
              } else {
                flattened[newKey.toUpperCase()] = String(value);
              }
            }
          }
        };
        flatten(data);

        return flattened;
      } catch (error) {
        if ((error as Error).name === 'AbortError') {
          throw new Error(
            `HTTP request timeout after ${options?.timeout ?? 5000}ms`,
          );
        }
        throw new Error(
          `Failed to fetch config from ${url}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    },
  };
}

/**
 * Load configuration from a JSON file
 *
 * @param path Path to JSON file (relative to cwd)
 * @returns Resolver that loads from JSON file
 *
 * @example
 * ```ts
 * import { resolve } from 'node-env-resolver';
 * import { json } from 'node-env-resolver/resolvers';
 *
 * const config = await resolveAsync(
 *   [json('config.json'), { PORT: 3000 }]
 * );
 * ```
 */
export function json(path: string = 'config.json'): Resolver {
  return {
    name: `json(${path})`,
    async load() {
      const fullPath = resolvePath(process.cwd(), path);
      if (!existsSync(fullPath)) return {};

      try {
        const content = readFileSync(fullPath, 'utf8');
        const parsed = JSON.parse(content);

        // Flatten nested objects to dot notation for compatibility
        const flattened: Record<string, string> = {};
        const flatten = (obj: unknown, prefix = '') => {
          if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
            for (const [key, value] of Object.entries(obj)) {
              const newKey = prefix ? `${prefix}_${key}` : key;
              if (value && typeof value === 'object' && !Array.isArray(value)) {
                flatten(value, newKey);
              } else {
                flattened[newKey.toUpperCase()] = String(value);
              }
            }
          }
        };
        flatten(parsed);

        return flattened;
      } catch (error) {
        throw new Error(
          `Failed to parse JSON file ${path}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    },
    loadSync() {
      const fullPath = resolvePath(process.cwd(), path);
      if (!existsSync(fullPath)) return {};

      try {
        const content = readFileSync(fullPath, 'utf8');
        const parsed = JSON.parse(content);

        // Flatten nested objects to dot notation for compatibility
        const flattened: Record<string, string> = {};
        const flatten = (obj: unknown, prefix = '') => {
          if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
            for (const [key, value] of Object.entries(obj)) {
              const newKey = prefix ? `${prefix}_${key}` : key;
              if (value && typeof value === 'object' && !Array.isArray(value)) {
                flatten(value, newKey);
              } else {
                flattened[newKey.toUpperCase()] = String(value);
              }
            }
          }
        };
        flatten(parsed);

        return flattened;
      } catch (error) {
        throw new Error(
          `Failed to parse JSON file ${path}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    },
  };
}

/**
 * Load secrets from a directory (Docker secrets / Kubernetes mounted secrets)
 * Each file in the directory becomes an environment variable (filename = key, content = value)
 *
 * @param path Path to secrets directory (relative to cwd)
 * @returns Resolver that loads from secrets directory
 *
 * @example
 * ```ts
 * import { resolve } from 'node-env-resolver';
 * import { secrets } from 'node-env-resolver/resolvers';
 *
 * const config = await resolveAsync(
 *   [secrets('/run/secrets'), { DB_PASSWORD: string() }]
 * );
 * ```
 */
export function secrets(path: string = '/run/secrets'): Resolver {
  return {
    name: `secrets(${path})`,
    async load() {
      const { readdirSync, statSync } = await import('fs');
      const fullPath = resolvePath(process.cwd(), path);

      if (!existsSync(fullPath)) return {};

      try {
        const files = readdirSync(fullPath);
        const env: Record<string, string> = {};

        for (const file of files) {
          const filePath = join(fullPath, file);
          const stat = statSync(filePath);

          // Only process regular files, skip directories and symlinks
          if (!stat.isFile()) continue;

          // Normalize filename to uppercase environment variable name
          const key = file.toUpperCase().replace(/[.-]/g, '_');
          const value = readFileSync(filePath, 'utf8').trim();

          env[key] = value;
        }

        return env;
      } catch (error) {
        throw new Error(
          `Failed to read secrets from ${path}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    },
    loadSync() {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { readdirSync, statSync } = require('fs');
      const fullPath = resolvePath(process.cwd(), path);

      if (!existsSync(fullPath)) return {};

      try {
        const files = readdirSync(fullPath);
        const env: Record<string, string> = {};

        for (const file of files) {
          const filePath = join(fullPath, file);
          const stat = statSync(filePath);

          // Only process regular files, skip directories and symlinks
          if (!stat.isFile()) continue;

          // Normalize filename to uppercase environment variable name
          const key = file.toUpperCase().replace(/[.-]/g, '_');
          const value = readFileSync(filePath, 'utf8').trim();

          env[key] = value;
        }

        return env;
      } catch (error) {
        throw new Error(
          `Failed to read secrets from ${path}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    },
  };
}

/**
 * YAML configuration file resolver interface
 * Requires 'js-yaml' as a peer dependency (install separately for tree-shaking)
 */
export interface YamlOptions {
  /** Path to the YAML file (default: 'config.yaml') */
  path?: string;
}

/**
 * Load configuration from a YAML file
 * Requires 'js-yaml' package to be installed separately
 *
 * @param options Path string or options object
 * @returns Resolver that loads from YAML file
 *
 * @example
 * ```ts
 * import { resolve } from 'node-env-resolver';
 * import { yaml } from 'node-env-resolver/resolvers';
 *
 * const config = await resolveAsync(
 *   [yaml('config.yaml'), { PORT: 3000 }]
 * );
 * ```
 */
export function yaml(options?: string | YamlOptions): Resolver {
  const opts =
    typeof options === 'string'
      ? { path: options }
      : { path: options?.path ?? 'config.yaml' };

  return {
    name: `yaml(${opts.path})`,
    async load() {
      const fullPath = join(process.cwd(), opts.path!);
      if (!existsSync(fullPath)) return {};

      try {
        // Dynamic import for tree-shaking (only loads if YAML is used)
        // @ts-expect-error - js-yaml is an optional peer dependency
        const { load } = await import('js-yaml');
        const content = readFileSync(fullPath, 'utf8');
        const parsed = load(content);

        // Flatten nested objects to underscore notation for compatibility
        const flattened: Record<string, string> = {};
        const flatten = (obj: unknown, prefix = '') => {
          if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
            for (const [key, value] of Object.entries(obj)) {
              const newKey = prefix ? `${prefix}_${key}` : key;
              if (value && typeof value === 'object' && !Array.isArray(value)) {
                flatten(value, newKey);
              } else {
                flattened[newKey.toUpperCase()] = String(value);
              }
            }
          }
        };
        flatten(parsed);

        return flattened;
      } catch (error) {
        if (
          (error as { code?: string }).code === 'MODULE_NOT_FOUND' ||
          (error as Error).message?.includes('Cannot find package')
        ) {
          throw new Error(
            `YAML resolver requires 'js-yaml' package. Install it with:\n` +
              `  npm install js-yaml\n` +
              `  # or\n` +
              `  pnpm add js-yaml`,
          );
        }
        throw new Error(
          `Failed to parse YAML file ${opts.path}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    },
    loadSync() {
      const fullPath = join(process.cwd(), opts.path!);
      if (!existsSync(fullPath)) return {};

      try {
        // Require for sync context
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { load } = require('js-yaml');
        const content = readFileSync(fullPath, 'utf8');
        const parsed = load(content);

        // Flatten nested objects to underscore notation for compatibility
        const flattened: Record<string, string> = {};
        const flatten = (obj: unknown, prefix = '') => {
          if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
            for (const [key, value] of Object.entries(obj)) {
              const newKey = prefix ? `${prefix}_${key}` : key;
              if (value && typeof value === 'object' && !Array.isArray(value)) {
                flatten(value, newKey);
              } else {
                flattened[newKey.toUpperCase()] = String(value);
              }
            }
          }
        };
        flatten(parsed);

        return flattened;
      } catch (error) {
        if (
          (error as { code?: string }).code === 'MODULE_NOT_FOUND' ||
          (error as Error).message?.includes('Cannot find package')
        ) {
          throw new Error(
            `YAML resolver requires 'js-yaml' package. Install it with:\n` +
              `  npm install js-yaml\n` +
              `  # or\n` +
              `  pnpm add js-yaml`,
          );
        }
        throw new Error(
          `Failed to parse YAML file ${opts.path}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    },
  };
}

/**
 * TOML configuration file resolver interface
 * Requires 'smol-toml' as a peer dependency (install separately for tree-shaking)
 */
export interface TomlOptions {
  /** Path to the TOML file (default: 'config.toml') */
  path?: string;
}

/**
 * Load configuration from a TOML file
 * Requires 'smol-toml' package to be installed separately
 *
 * @param options Path string or options object
 * @returns Resolver that loads from TOML file
 *
 * @example
 * ```ts
 * import { resolve } from 'node-env-resolver';
 * import { toml } from 'node-env-resolver/resolvers';
 *
 * const config = await resolveAsync(
 *   [toml('config.toml'), { PORT: 3000 }]
 * );
 * ```
 */
export function toml(options?: string | TomlOptions): Resolver {
  const opts =
    typeof options === 'string'
      ? { path: options }
      : { path: options?.path ?? 'config.toml' };

  return {
    name: `toml(${opts.path})`,
    async load() {
      const fullPath = resolvePath(process.cwd(), opts.path!);
      if (!existsSync(fullPath)) return {};

      try {
        // Dynamic import for tree-shaking (only loads if TOML is used)
        // @ts-expect-error - smol-toml is an optional peer dependency
        const { parse } = await import('smol-toml');
        const content = readFileSync(fullPath, 'utf8');
        const parsed = parse(content);

        // Flatten nested objects to underscore notation for compatibility
        const flattened: Record<string, string> = {};
        const flatten = (obj: unknown, prefix = '') => {
          if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
            for (const [key, value] of Object.entries(obj)) {
              const newKey = prefix ? `${prefix}_${key}` : key;
              if (value && typeof value === 'object' && !Array.isArray(value)) {
                flatten(value, newKey);
              } else {
                flattened[newKey.toUpperCase()] = String(value);
              }
            }
          }
        };
        flatten(parsed);

        return flattened;
      } catch (error) {
        if (
          (error as { code?: string }).code === 'MODULE_NOT_FOUND' ||
          (error as Error).message?.includes('Cannot find package')
        ) {
          throw new Error(
            `TOML resolver requires 'smol-toml' package. Install it with:\n` +
              `  npm install smol-toml\n` +
              `  # or\n` +
              `  pnpm add smol-toml`,
          );
        }
        throw new Error(
          `Failed to parse TOML file ${opts.path}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    },
    loadSync() {
      const fullPath = resolvePath(process.cwd(), opts.path!);
      if (!existsSync(fullPath)) return {};

      try {
        // Require for sync context
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { parse } = require('smol-toml');
        const content = readFileSync(fullPath, 'utf8');
        const parsed = parse(content);

        // Flatten nested objects to underscore notation for compatibility
        const flattened: Record<string, string> = {};
        const flatten = (obj: unknown, prefix = '') => {
          if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
            for (const [key, value] of Object.entries(obj)) {
              const newKey = prefix ? `${prefix}_${key}` : key;
              if (value && typeof value === 'object' && !Array.isArray(value)) {
                flatten(value, newKey);
              } else {
                flattened[newKey.toUpperCase()] = String(value);
              }
            }
          }
        };
        flatten(parsed);

        return flattened;
      } catch (error) {
        if (
          (error as { code?: string }).code === 'MODULE_NOT_FOUND' ||
          (error as Error).message?.includes('Cannot find package')
        ) {
          throw new Error(
            `TOML resolver requires 'smol-toml' package. Install it with:\n` +
              `  npm install smol-toml\n` +
              `  # or\n` +
              `  pnpm add smol-toml`,
          );
        }
        throw new Error(
          `Failed to parse TOML file ${opts.path}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    },
  };
}
