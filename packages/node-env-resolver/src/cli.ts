/**
 * CLI argument parser resolver
 * Converts --kebab-case flags to SCREAMING_SNAKE_CASE env vars
 * 
 * @example
 * ```bash
 * node app.js --port 8080 --database-url postgres://localhost --verbose
 * ```
 * 
 * @example
 * ```ts
 * import { resolve } from 'node-env-resolver';
 * import { cliArgs } from 'node-env-resolver/cli';
 * 
 * const config = await resolveAsync(
 *   [cliArgs(), {
 *     PORT: 3000,
 *     DATABASE_URL: postgres(),
 *     VERBOSE: false
 *   }]
 * );
 * // config.PORT === 8080
 * // config.DATABASE_URL === 'postgres://localhost'
 * // config.VERBOSE === true
 * ```
 */

import type { Resolver } from './types';

export interface CliArgsOptions {
  /** Arguments to parse (default: process.argv.slice(2)) */
  argv?: string[];
  /** Prefix for flags (default: '--') */
  prefix?: string;
  /** Convert kebab-case to SCREAMING_SNAKE_CASE (default: true) */
  normalizeKeys?: boolean;
}

/**
 * Parse CLI arguments as environment variables
 * 
 * Supports:
 * - `--key value` → KEY=value
 * - `--key=value` → KEY=value
 * - `--flag` → FLAG=true (boolean flags)
 * - `--kebab-case` → KEBAB_CASE (auto-normalization)
 * 
 * @param options Configuration options
 * @returns Resolver that parses CLI arguments
 */
export function cliArgs(options: CliArgsOptions = {}): Resolver {
  const {
    argv = process.argv.slice(2),
    prefix = '--',
    normalizeKeys = true
  } = options;

  const parse = () => {
    const env: Record<string, string> = {};
    
    for (let i = 0; i < argv.length; i++) {
      const arg = argv[i];
      if (!arg.startsWith(prefix)) continue;
      
      let key = arg.slice(prefix.length);
      
      // Handle --key=value
      if (key.includes('=')) {
        const [k, v] = key.split('=', 2);
        key = normalizeKeys ? k.replace(/-/g, '_').toUpperCase() : k;
        env[key] = v;
        continue;
      }
      
      // Normalize key
      const normalizedKey = normalizeKeys ? key.replace(/-/g, '_').toUpperCase() : key;
      
      // Handle --key value or --flag
      const next = argv[i + 1];
      if (!next || next.startsWith(prefix)) {
        // Boolean flag
        env[normalizedKey] = 'true';
      } else {
        // Key-value pair
        env[normalizedKey] = next;
        i++; // Skip next arg
      }
    }
    
    return env;
  };

  return {
    name: 'cli-args',
    load() {
      return Promise.resolve(parse());
    },
    loadSync() {
      return parse();
    }
  };
}


