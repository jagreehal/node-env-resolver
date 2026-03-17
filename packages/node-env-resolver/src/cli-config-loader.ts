import { existsSync } from 'fs';
import { resolve as resolvePath } from 'path';
import { pathToFileURL } from 'url';
import type { ResolveAsyncConfig, SimpleEnvSchema } from './types';

export interface EnvConfig extends ResolveAsyncConfig<SimpleEnvSchema> {
  schema: SimpleEnvSchema;
}

export interface LoadEnvConfigOptions {
  configPath?: string;
}

const DEFAULT_CONFIG_CANDIDATES = ['env.config.mjs', 'env.config.js'];

function findConfigPath(explicitPath?: string): string {
  if (explicitPath) {
    const abs = resolvePath(process.cwd(), explicitPath);
    if (!existsSync(abs)) {
      throw new Error(
        `Config file not found at ${explicitPath}. Pass a valid --config path or create env.config.js/env.config.mjs in the current directory.`,
      );
    }
    return abs;
  }

  for (const candidate of DEFAULT_CONFIG_CANDIDATES) {
    const abs = resolvePath(process.cwd(), candidate);
    if (existsSync(abs)) return abs;
  }

  throw new Error(
    'No config file found. Create env.config.js or env.config.mjs in the current directory, or pass --config <path>.',
  );
}

function assertNotTypeScriptConfig(path: string): void {
  if (path.endsWith('.ts') || path.endsWith('.mts') || path.endsWith('.cts')) {
    throw new Error(
      [
        'TypeScript config files are not loaded automatically.',
        'Use Node with a loader such as tsx, for example:',
        '',
        '  node --import tsx ./node_modules/node-env-resolver/dist/cli-main.js load --config env.config.ts',
      ].join('\n'),
    );
  }
}

export async function loadEnvConfig(
  options: LoadEnvConfigOptions = {},
): Promise<EnvConfig> {
  const configPath = findConfigPath(options.configPath);
  assertNotTypeScriptConfig(configPath);

  const url = pathToFileURL(configPath).href;
  const mod = await import(url);

  const candidate =
    (mod && (mod.default ?? mod.config ?? mod.env)) ?? undefined;

  if (!candidate || typeof candidate !== 'object') {
    throw new Error(
      `Config file at ${configPath} does not export a valid EnvConfig. Export an object with a "schema" property.`,
    );
  }

  const config = candidate as EnvConfig;

  if (!config.schema || typeof config.schema !== 'object') {
    throw new Error(
      `EnvConfig from ${configPath} is missing a "schema" object. Ensure it matches { schema, resolvers?, options? }.`,
    );
  }

  return config;
}

