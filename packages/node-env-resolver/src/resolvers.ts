/**
 * Built-in resolvers for environment variable resolution
 */

import { readFileSync, existsSync } from 'fs';
import { join, resolve as resolvePath } from 'path';
import type { Resolver, SyncResolver, Validator } from './types';
export interface DotenvOptions {
  path?: string;
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

export function processEnv(): SyncResolver {
  return {
    name: 'process.env',
    async load() {
      return { ...process.env } as Record<string, string>;
    },
    loadSync() {
      return { ...process.env } as Record<string, string>;
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

export function string<
  Opts extends {
    default?: string;
    optional?: boolean;
    min?: number;
    max?: number;
    allowEmpty?: boolean;
    pattern?: string;
  } = Record<string, never>,
>(
  opts?: Opts,
): Opts extends { optional: true }
  ? Validator<string> & { optional: true; default?: Opts['default'] }
  : Validator<string> & {
      optional?: Opts['optional'];
      default?: Opts['default'];
    } {
  const validator = ((value: string, key?: string) => {
    if (value === '' && !opts?.allowEmpty) {
      throw new Error('String cannot be empty');
    }
    if (opts?.min !== undefined && value.length < opts.min) {
      throw new Error(`String too short (min: ${opts.min})`);
    }
    if (opts?.max !== undefined && value.length > opts.max) {
      throw new Error(`String too long (max: ${opts.max})`);
    }
    if (opts?.pattern && !new RegExp(opts.pattern).test(value)) {
      const keyPrefix = key
        ? `${key} does not match required pattern`
        : 'String does not match pattern';
      throw new Error(keyPrefix);
    }
    return value;
  }) as unknown;

  // Attach options to the validator function for runtime
  if (opts) {
    (validator as Record<string, unknown>).default = opts.default;
    (validator as Record<string, unknown>).optional = opts.optional;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return validator as any;
}

export function number<
  Opts extends {
    default?: number;
    optional?: boolean;
    min?: number;
    max?: number;
  } = Record<string, never>,
>(
  opts?: Opts,
): Opts extends { optional: true }
  ? Validator<number> & { optional: true; default?: Opts['default'] }
  : Validator<number> & {
      optional?: Opts['optional'];
      default?: Opts['default'];
    } {
  const validator = ((value: string) => {
    const num = Number(value);
    if (isNaN(num)) {
      throw new Error(`Invalid number: "${value}"`);
    }
    if (opts?.min !== undefined && num < opts.min) {
      throw new Error(`Number too small (min: ${opts.min})`);
    }
    if (opts?.max !== undefined && num > opts.max) {
      throw new Error(`Number too large (max: ${opts.max})`);
    }
    return num;
  }) as unknown;

  // Attach options to the validator function for runtime
  if (opts) {
    (validator as Record<string, unknown>).default = opts.default;
    (validator as Record<string, unknown>).optional = opts.optional;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return validator as any;
}

export function boolean<
  Opts extends { default?: boolean; optional?: boolean } = Record<
    string,
    never
  >,
>(
  opts?: Opts,
): Opts extends { optional: true }
  ? Validator<boolean> & { optional: true; default?: Opts['default'] }
  : Validator<boolean> & {
      optional?: Opts['optional'];
      default?: Opts['default'];
    } {
  const validator = ((value: string) => {
    const lowerValue = value.toLowerCase();
    if (['true', '1', 'yes', 'on'].includes(lowerValue)) {
      return true;
    }
    if (['false', '0', 'no', 'off', ''].includes(lowerValue)) {
      return false;
    }
    throw new Error(`Invalid boolean: "${value}"`);
  }) as unknown;

  // Attach options to the validator function for runtime
  if (opts) {
    (validator as Record<string, unknown>).default = opts.default;
    (validator as Record<string, unknown>).optional = opts.optional;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return validator as any;
}

// Additional validator functions
export function url<
  Opts extends { default?: string; optional?: boolean } = Record<string, never>,
>(
  opts?: Opts,
): Opts extends { optional: true }
  ? Validator<string> & { optional: true; default?: Opts['default'] }
  : Validator<string> & {
      optional?: Opts['optional'];
      default?: Opts['default'];
    } {
  const validator = ((value: string) => {
    try {
      new URL(value);
      return value;
    } catch {
      throw new Error(`Invalid URL: "${value}"`);
    }
  }) as unknown;

  // Attach options to the validator function for runtime
  if (opts) {
    (validator as Record<string, unknown>).default = opts.default;
    (validator as Record<string, unknown>).optional = opts.optional;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return validator as any;
}

export function email<
  Opts extends { default?: string; optional?: boolean } = Record<string, never>,
>(
  opts?: Opts,
): Opts extends { optional: true }
  ? Validator<string> & { optional: true; default?: Opts['default'] }
  : Validator<string> & {
      optional?: Opts['optional'];
      default?: Opts['default'];
    } {
  const validator = ((value: string) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(value)) {
      throw new Error(`Invalid email: "${value}"`);
    }
    return value;
  }) as unknown;

  // Attach options to the validator function for runtime
  if (opts) {
    (validator as Record<string, unknown>).default = opts.default;
    (validator as Record<string, unknown>).optional = opts.optional;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return validator as any;
}

export function port<
  Opts extends { default?: number; optional?: boolean } = Record<string, never>,
>(
  opts?: Opts,
): Opts extends { optional: true }
  ? Validator<number> & { optional: true; default?: Opts['default'] }
  : Validator<number> & {
      optional?: Opts['optional'];
      default?: Opts['default'];
    } {
  const validator = ((value: string) => {
    const num = Number(value);
    if (isNaN(num) || num < 1 || num > 65535) {
      throw new Error(`Invalid port: "${value}"`);
    }
    return num;
  }) as unknown;

  // Attach options to the validator function for runtime
  if (opts) {
    (validator as Record<string, unknown>).default = opts.default;
    (validator as Record<string, unknown>).optional = opts.optional;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return validator as any;
}

export function postgres<
  Opts extends { default?: string; optional?: boolean } = Record<string, never>,
>(
  opts?: Opts,
): Opts extends { optional: true }
  ? Validator<string> & { optional: true; default?: Opts['default'] }
  : Validator<string> & {
      optional?: Opts['optional'];
      default?: Opts['default'];
    } {
  const validator = ((value: string) => {
    if (
      !value.startsWith('postgres://') &&
      !value.startsWith('postgresql://')
    ) {
      throw new Error(`Invalid PostgreSQL URL: "${value}"`);
    }
    return value;
  }) as unknown;

  // Attach options to the validator function for runtime
  if (opts) {
    (validator as Record<string, unknown>).default = opts.default;
    (validator as Record<string, unknown>).optional = opts.optional;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return validator as any;
}

export function mysql<
  Opts extends { default?: string; optional?: boolean } = Record<string, never>,
>(
  opts?: Opts,
): Opts extends { optional: true }
  ? Validator<string> & { optional: true; default?: Opts['default'] }
  : Validator<string> & {
      optional?: Opts['optional'];
      default?: Opts['default'];
    } {
  const validator = ((value: string) => {
    if (!value.startsWith('mysql://')) {
      throw new Error(`Invalid MySQL URL: "${value}"`);
    }
    return value;
  }) as unknown;

  // Attach options to the validator function for runtime
  if (opts) {
    (validator as Record<string, unknown>).default = opts.default;
    (validator as Record<string, unknown>).optional = opts.optional;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return validator as any;
}

export function mongodb<
  Opts extends { default?: string; optional?: boolean } = Record<string, never>,
>(
  opts?: Opts,
): Opts extends { optional: true }
  ? Validator<string> & { optional: true; default?: Opts['default'] }
  : Validator<string> & {
      optional?: Opts['optional'];
      default?: Opts['default'];
    } {
  const validator = ((value: string) => {
    if (
      !value.startsWith('mongodb://') &&
      !value.startsWith('mongodb+srv://')
    ) {
      throw new Error(`Invalid MongoDB URL: "${value}"`);
    }
    return value;
  }) as unknown;

  // Attach options to the validator function for runtime
  if (opts) {
    (validator as Record<string, unknown>).default = opts.default;
    (validator as Record<string, unknown>).optional = opts.optional;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return validator as any;
}

export function redis<
  Opts extends { default?: string; optional?: boolean } = Record<string, never>,
>(
  opts?: Opts,
): Opts extends { optional: true }
  ? Validator<string> & { optional: true; default?: Opts['default'] }
  : Validator<string> & {
      optional?: Opts['optional'];
      default?: Opts['default'];
    } {
  const validator = ((value: string) => {
    if (!value.startsWith('redis://') && !value.startsWith('rediss://')) {
      throw new Error(`Invalid Redis URL: "${value}"`);
    }
    return value;
  }) as unknown;

  // Attach options to the validator function for runtime
  if (opts) {
    (validator as Record<string, unknown>).default = opts.default;
    (validator as Record<string, unknown>).optional = opts.optional;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return validator as any;
}


export function https<
  Opts extends { default?: string; optional?: boolean } = Record<string, never>,
>(
  opts?: Opts,
): Opts extends { optional: true }
  ? Validator<string> & { optional: true; default?: Opts['default'] }
  : Validator<string> & {
      optional?: Opts['optional'];
      default?: Opts['default'];
    } {
  const validator = ((value: string) => {
    if (!value.startsWith('https://')) {
      throw new Error(`Invalid HTTPS URL: "${value}"`);
    }
    return value;
  }) as unknown;

  // Attach options to the validator function for runtime
  if (opts) {
    (validator as Record<string, unknown>).default = opts.default;
    (validator as Record<string, unknown>).optional = opts.optional;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return validator as any;
}

export function stringArray<
  Opts extends {
    default?: string[];
    optional?: boolean;
    separator?: string;
  } = Record<string, never>,
>(
  opts?: Opts,
): Opts extends { optional: true }
  ? Validator<string[]> & { optional: true; default?: Opts['default'] }
  : Validator<string[]> & {
      optional?: Opts['optional'];
      default?: Opts['default'];
    } {
  const validator = ((value: string) => {
    const separator = opts?.separator || ',';
    return value
      .split(separator)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  }) as unknown;

  // Attach options to the validator function for runtime
  if (opts) {
    (validator as Record<string, unknown>).default = opts.default;
    (validator as Record<string, unknown>).optional = opts.optional;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return validator as any;
}

export function numberArray<
  Opts extends {
    default?: number[];
    optional?: boolean;
    separator?: string;
  } = Record<string, never>,
>(
  opts?: Opts,
): Opts extends { optional: true }
  ? Validator<number[]> & { optional: true; default?: Opts['default'] }
  : Validator<number[]> & {
      optional?: Opts['optional'];
      default?: Opts['default'];
    } {
  const validator = ((value: string) => {
    const separator = opts?.separator || ',';
    return value.split(separator).map((s) => {
      const num = Number(s.trim());
      if (isNaN(num)) {
        throw new Error(`Invalid number in array: "${s}"`);
      }
      return num;
    });
  }) as unknown;

  // Attach options to the validator function for runtime
  if (opts) {
    (validator as Record<string, unknown>).default = opts.default;
    (validator as Record<string, unknown>).optional = opts.optional;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return validator as any;
}

export function urlArray<
  Opts extends {
    default?: string[];
    optional?: boolean;
    separator?: string;
  } = Record<string, never>,
>(
  opts?: Opts,
): Opts extends { optional: true }
  ? Validator<string[]> & { optional: true; default?: Opts['default'] }
  : Validator<string[]> & {
      optional?: Opts['optional'];
      default?: Opts['default'];
    } {
  const validator = ((value: string) => {
    const separator = opts?.separator || ',';
    const urls = value
      .split(separator)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    for (const url of urls) {
      try {
        new URL(url);
      } catch {
        throw new Error(`Invalid URL in array: "${url}"`);
      }
    }
    return urls;
  }) as unknown;

  // Attach options to the validator function for runtime
  if (opts) {
    (validator as Record<string, unknown>).default = opts.default;
    (validator as Record<string, unknown>).optional = opts.optional;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return validator as any;
}

export function enums<
  T extends readonly (string | number)[],
  Opts extends { default?: T[number]; optional?: boolean } = Record<
    string,
    never
  >,
>(
  values: T,
  opts?: Opts,
): Opts extends { optional: true }
  ? Validator<T[number]> & { optional: true; default?: Opts['default'] }
  : Validator<T[number]> & {
      optional?: Opts['optional'];
      default?: Opts['default'];
    } {
  const validator = ((value: string) => {
    if (!values.includes(value as T[number])) {
      throw new Error(
        `Invalid enum value: "${value}". Allowed values: ${values.join(', ')}`,
      );
    }
    return value as T[number];
  }) as unknown;

  // Attach options to the validator function for runtime
  if (opts) {
    (validator as Record<string, unknown>).default = opts.default;
    (validator as Record<string, unknown>).optional = opts.optional;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return validator as any;
}

export function duration<
  Opts extends { default?: number; optional?: boolean } = Record<string, never>,
>(
  opts?: Opts,
): Opts extends { optional: true }
  ? Validator<number> & { optional: true; default?: Opts['default'] }
  : Validator<number> & {
      optional?: Opts['optional'];
      default?: Opts['default'];
    } {
  const validator = ((value: string) => {
    // Simple duration parser - converts to milliseconds
    const match = value.match(/^(\d+)([smhd])$/);
    if (!match) {
      throw new Error(
        `Invalid duration: "${value}". Use format like "5s", "2m", "1h", "1d"`,
      );
    }
    const [, num, unit] = match;
    const multipliers = { s: 1000, m: 60000, h: 3600000, d: 86400000 };
    const multiplier = multipliers[unit as keyof typeof multipliers];
    return Number(num) * multiplier;
  }) as unknown;

  // Attach options to the validator function for runtime
  if (opts) {
    (validator as Record<string, unknown>).default = opts.default;
    (validator as Record<string, unknown>).optional = opts.optional;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return validator as any;
}

export function file<
  Opts extends {
    default?: string;
    optional?: boolean;
    secretsDir?: string;
  } = Record<string, never>,
>(
  opts?: Opts,
): Opts extends { optional: true }
  ? Validator<string> & {
      optional: true;
      default?: Opts['default'];
      secretsDir?: Opts['secretsDir'];
    }
  : Validator<string> & {
      optional?: Opts['optional'];
      default?: Opts['default'];
      secretsDir?: Opts['secretsDir'];
    } {
  const validator = ((value: string) => {
    // Read file content from the provided path
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const fs = require('fs');
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { resolve } = require('path');
      // Resolve file path relative to current working directory
      const resolvedPath = resolve(process.cwd(), value);
      const content = fs.readFileSync(resolvedPath, 'utf8').trim();
      return content;
    } catch (error) {
      throw new Error(
        `Failed to read file: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }) as unknown;

  // Attach options to the validator function for runtime
  if (opts) {
    (validator as Record<string, unknown>).default = opts.default;
    (validator as Record<string, unknown>).optional = opts.optional;
    (validator as Record<string, unknown>).secretsDir = opts.secretsDir;
  }

  // Mark this as a file validator for secretsDir support
  (validator as Record<string, unknown>).__isFileValidator = true;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return validator as any;
}

export function secret<
  Opts extends { default?: string; optional?: boolean } = Record<string, never>,
>(
  opts?: Opts,
): Opts extends { optional: true }
  ? Validator<string> & { optional: true; default?: Opts['default'] }
  : Validator<string> & {
      optional?: Opts['optional'];
      default?: Opts['default'];
    } {
  const validator = ((value: string) => {
    // For now, just return the secret value
    return value;
  }) as unknown;

  // Attach options to the validator function for runtime
  if (opts) {
    (validator as Record<string, unknown>).default = opts.default;
    (validator as Record<string, unknown>).optional = opts.optional;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return validator as any;
}

export function custom<
  T = unknown,
  Opts extends { default?: T; optional?: boolean } = Record<string, never>,
>(
  validator: (value: string) => T,
  opts?: Opts,
): Opts extends { optional: true }
  ? Validator<T> & { optional: true; default?: Opts['default'] }
  : Validator<T> & { optional?: Opts['optional']; default?: Opts['default'] } {
  const validatorWithOptions = validator as unknown;

  // Attach options to the validator function for runtime
  if (opts) {
    (validatorWithOptions as Record<string, unknown>).default = opts.default;
    (validatorWithOptions as Record<string, unknown>).optional = opts.optional;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return validatorWithOptions as any;
}

// Date and timestamp validators
export function date<
  Opts extends { default?: string; optional?: boolean } = Record<string, never>,
>(
  opts?: Opts,
): Opts extends { optional: true }
  ? Validator<string> & { optional: true; default?: Opts['default'] }
  : Validator<string> & {
      optional?: Opts['optional'];
      default?: Opts['default'];
    } {
  const validator = ((value: string) => {
    // Validate ISO 8601 date format - must match pattern like YYYY-MM-DD or YYYY-MM-DDTHH:mm:ssZ
    const iso8601Pattern =
      /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d{3})?Z?)?$/;
    if (!iso8601Pattern.test(value)) {
      throw new Error(`Date must be in ISO 8601 format: "${value}"`);
    }
    const date = new Date(value);
    if (isNaN(date.getTime())) {
      throw new Error(`Cannot parse date value: "${value}"`);
    }
    return value;
  }) as unknown;

  // Attach options to the validator function for runtime
  if (opts) {
    (validator as Record<string, unknown>).default = opts.default;
    (validator as Record<string, unknown>).optional = opts.optional;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return validator as any;
}

export function timestamp<
  Opts extends { default?: number; optional?: boolean } = Record<string, never>,
>(
  opts?: Opts,
): Opts extends { optional: true }
  ? Validator<number> & { optional: true; default?: Opts['default'] }
  : Validator<number> & {
      optional?: Opts['optional'];
      default?: Opts['default'];
    } {
  const validator = ((value: string) => {
    const num = Number(value);
    if (isNaN(num) || !Number.isInteger(num)) {
      throw new Error(`Invalid timestamp: "${value}"`);
    }
    if (num < 0) {
      throw new Error(`Invalid timestamp: "${value}"`);
    }
    if (num > 253402300799) {
      // Year 9999
      throw new Error(`Timestamp too large: "${value}"`);
    }
    return num;
  }) as unknown;

  // Attach options to the validator function for runtime
  if (opts) {
    (validator as Record<string, unknown>).default = opts.default;
    (validator as Record<string, unknown>).optional = opts.optional;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return validator as any;
}