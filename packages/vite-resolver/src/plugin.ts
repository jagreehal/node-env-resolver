/**
 * Vite plugin for node-env-resolver
 *
 * Validates environment variables at config resolution time and
 * optionally injects validated env vars into Vite's define config.
 */

import type { Plugin } from 'vite';
import { writeFileSync, existsSync, readFileSync } from 'fs';
import { dirname } from 'path';
import { mkdirSync } from 'fs';
import { resolve, resolveAsyncFn, type ViteEnvConfig, type ViteOptions } from './index';
import type { SimpleEnvSchema } from 'node-env-resolver';

export interface PluginOptions<
  _TServer extends SimpleEnvSchema = SimpleEnvSchema,
  _TClient extends SimpleEnvSchema = SimpleEnvSchema,
> extends ViteOptions {
  /**
   * Whether to inject client env vars into Vite's define config
   * @default true
   */
  injectClientEnv?: boolean;

  /**
   * Auto-generate TypeScript definitions for import.meta.env
   * @default undefined (disabled)
   */
  generateTypes?: string;
}

/**
 * Infer TypeScript type from schema definition
 */
function inferType(definition: unknown): string {
  // Handle literal values (defaults)
  if (typeof definition === 'number') return 'number';
  if (typeof definition === 'boolean') return 'boolean';

  // Handle array oneOf
  if (Array.isArray(definition)) {
    const values = definition.map((v) => `'${v}'`).join(' | ');
    return values;
  }

  // Handle string type definitions
  if (typeof definition === 'string') {
    // Check if it's a literal default value
    if (
      !definition.includes(':') &&
      !definition.endsWith('?') &&
      ![
        'string',
        'number',
        'boolean',
        'url',
        'email',
        'postgres',
        'mysql',
        'mongodb',
        'redis',
        'http',
        'https',
        'port',
        'json',
        'date',
        'timestamp',
        'duration',
        'file',
        'string[]',
        'number[]',
        'url[]',
      ].includes(definition)
    ) {
      return 'string';
    }

    const isOptional = definition.endsWith('?');
    const baseType = definition.replace('?', '').split(':')[0];

    let tsType: string;
    if (
      baseType === 'string' ||
      baseType === 'url' ||
      baseType === 'email' ||
      baseType === 'postgres' ||
      baseType === 'mysql' ||
      baseType === 'mongodb' ||
      baseType === 'redis' ||
      baseType === 'http' ||
      baseType === 'https' ||
      baseType === 'date' ||
      baseType === 'file'
    ) {
      tsType = 'string';
    } else if (
      baseType === 'number' ||
      baseType === 'port' ||
      baseType === 'timestamp' ||
      baseType === 'duration'
    ) {
      tsType = 'number';
    } else if (baseType === 'boolean') {
      tsType = 'boolean';
    } else if (baseType === 'json') {
      tsType = 'unknown';
    } else if (baseType === 'string[]') {
      tsType = 'string[]';
    } else if (baseType === 'number[]') {
      tsType = 'number[]';
    } else if (baseType === 'url[]') {
      tsType = 'string[]';
    } else {
      tsType = 'string';
    }

    return isOptional ? `${tsType} | undefined` : tsType;
  }

  // Handle object form
  if (typeof definition === 'object' && definition !== null && 'type' in definition) {
    const def = definition as { type: string; optional?: boolean };
    const baseType = def.type.replace('?', '');
    let tsType: string;

    if (
      [
        'string',
        'url',
        'email',
        'postgres',
        'mysql',
        'mongodb',
        'redis',
        'http',
        'https',
        'date',
        'file',
      ].includes(baseType)
    ) {
      tsType = 'string';
    } else if (['number', 'port', 'timestamp', 'duration'].includes(baseType)) {
      tsType = 'number';
    } else if (baseType === 'boolean') {
      tsType = 'boolean';
    } else if (baseType === 'json') {
      tsType = 'unknown';
    } else if (baseType === 'string[]') {
      tsType = 'string[]';
    } else if (baseType === 'number[]') {
      tsType = 'number[]';
    } else {
      tsType = 'string';
    }

    return def.optional ? `${tsType} | undefined` : tsType;
  }

  // Handle custom validator functions
  if (typeof definition === 'function') {
    const func = definition as unknown as Record<string, unknown>;
    const isOptional = func.optional === true;

    // Try to infer type from function name or return type
    const funcStr = definition.toString();

    let tsType = 'string'; // Default

    // Check if it's a typed validator by checking the function body or attached metadata
    if (
      funcStr.includes('parseFloat') ||
      funcStr.includes('parseInt') ||
      funcStr.includes('Number(')
    ) {
      tsType = 'number';
    } else if (funcStr.includes('Boolean') || funcStr.includes("=== 'true'")) {
      tsType = 'boolean';
    } else if (funcStr.includes('JSON.parse')) {
      tsType = 'unknown';
    } else if (funcStr.includes('Array.isArray')) {
      tsType = 'string[]';
    }

    return isOptional ? `${tsType} | undefined` : tsType;
  }

  return 'string';
}

/**
 * Generate TypeScript definition file content
 */
function generateTypeDefinitions(clientSchema: SimpleEnvSchema): string {
  const lines: string[] = [
    '/// <reference types="vite/client" />',
    '',
    '/**',
    ' * Auto-generated by node-env-resolver-vite',
    ' * DO NOT EDIT MANUALLY - Changes will be overwritten',
    ' */',
    '',
    'interface ImportMetaEnv {',
  ];

  // Generate interface properties
  for (const [key, definition] of Object.entries(clientSchema)) {
    const tsType = inferType(definition);
    const readonly = '  readonly ';
    lines.push(`${readonly}${key}: ${tsType}`);
  }

  lines.push('}');
  lines.push('');
  lines.push('interface ImportMeta {');
  lines.push('  readonly env: ImportMetaEnv');
  lines.push('}');
  lines.push('');

  return lines.join('\n');
}

/**
 * Vite plugin for environment variable validation and injection
 *
 * @example
 * ```typescript
 * // vite.config.ts
 * import { defineConfig } from 'vite';
 * import { nodeEnvResolverPlugin } from 'node-env-resolver-vite/plugin';
 *
 * export default defineConfig({
 *   plugins: [
 *     nodeEnvResolverPlugin({
 *       server: {
 *         DATABASE_URL: postgres(),
 *         API_SECRET: string(),
 *       },
 *       client: {
 *         VITE_API_URL: url(),
 *         VITE_ENABLE_ANALYTICS: false,
 *       },
 *       generateTypes: 'src/vite-env.d.ts'  // Auto-generate types!
 *     })
 *   ]
 * });
 * ```
 */
export function nodeEnvResolverPlugin<
  TServer extends SimpleEnvSchema,
  TClient extends SimpleEnvSchema,
>(config: ViteEnvConfig<TServer, TClient>, options: PluginOptions<TServer, TClient> = {}): Plugin {
  const {
    injectClientEnv = true,
    generateTypes,
    async: isAsync = false,
    referenceHandlers,
    ...resolveOptions
  } = options;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let env: any;

  return {
    name: 'node-env-resolver-vite',

    async config() {
      try {
        if (isAsync) {
          env = await resolveAsyncFn(config, {
            ...resolveOptions,
            referenceHandlers: referenceHandlers as ViteOptions['referenceHandlers'],
          });
        } else {
          env = resolve(config, resolveOptions as Omit<ViteOptions, 'async' | 'referenceHandlers'>);
        }

        console.log('Environment variables validated successfully');
      } catch (error) {
        console.error('Environment validation failed:');
        throw error;
      }

      if (injectClientEnv && env.client) {
        const define: Record<string, string> = {};

        for (const [key, value] of Object.entries(env.client)) {
          const jsonValue = JSON.stringify(value);
          define[`import.meta.env.${key}`] = jsonValue;
        }

        return { define };
      }
    },

    configResolved(resolvedConfig) {
      if (resolvedConfig.command === 'serve' && resolvedConfig.mode === 'development') {
        console.log('\nEnvironment Configuration:');
        console.log(`  Mode: ${resolvedConfig.mode}`);
        console.log(`  Server vars: ${Object.keys(config.server).length}`);
        console.log(`  Client vars: ${Object.keys(config.client).length}`);

        // Generate TypeScript definitions if requested
        if (generateTypes) {
          try {
            const typePath = generateTypes.startsWith('/')
              ? generateTypes
              : `${resolvedConfig.root}/${generateTypes}`;

            // Check if file exists and contains custom content
            let shouldGenerate = true;
            if (existsSync(typePath)) {
              const existingContent = readFileSync(typePath, 'utf-8');
              // Only regenerate if it's our auto-generated file
              if (!existingContent.includes('Auto-generated by node-env-resolver-vite')) {
                shouldGenerate = false;
                console.log(
                  `  ⚠️  Skipping type generation: ${generateTypes} contains custom content`
                );
              }
            }

            if (shouldGenerate) {
              const typeDefinitions = generateTypeDefinitions(config.client);

              // Ensure directory exists
              const dir = dirname(typePath);
              if (!existsSync(dir)) {
                mkdirSync(dir, { recursive: true });
              }

              writeFileSync(typePath, typeDefinitions, 'utf-8');
              console.log(`  ✅ Generated TypeScript definitions: ${generateTypes}`);
            }
          } catch (error) {
            console.error(
              '  ⚠️  Failed to generate types:',
              error instanceof Error ? error.message : String(error)
            );
          }
        }

        console.log('');
      }
    },
  };
}

/**
 * Type-only export for plugin configuration
 */
export type { ViteEnvConfig, ViteOptions };
