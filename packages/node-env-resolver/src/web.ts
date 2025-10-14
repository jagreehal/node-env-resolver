/**
 * Client/server split API for web applications
 * Import from 'node-env-resolver/web' to use client-safe environment resolution
 */

import { resolve } from './index';
import { processEnv, dotenv } from './resolvers';
import type { Resolver, EnvDefinition, EnvSchema, PolicyOptions, SimpleEnvSchema, InferSimpleSchema } from './types';
// Runtime detection helper
// Type for globalThis with window property
interface GlobalWithWindow {
  window?: Window;
}

const isBrowser = () => typeof (globalThis as GlobalWithWindow).window !== 'undefined';

export interface ClientEnvOptions {
  resolvers?: Resolver[];
  clientPrefix?: string;
  strict?: boolean;
}

export interface EnvSplitOptions {
  resolvers?: Resolver[];
  clientPrefix?: string;
  strict?: boolean;
  interpolate?: boolean;
  policies?: PolicyOptions;
}

export interface EnvSplitSchema {
  server: EnvSchema;
  client: EnvSchema;
}

// Type helpers for client/server split
type InferType<T extends EnvDefinition> =
  T['enum'] extends readonly (infer U)[] ? U :
  T['type'] extends 'number' ? number :
  T['type'] extends 'boolean' ? boolean :
  T['type'] extends 'url' ? URL :
  T['type'] extends 'port' ? number :
  T['type'] extends 'timestamp' ? number :
  T['type'] extends 'date' ? string :
  T['type'] extends 'json' ? unknown :
  string;

type InferClientSchema<T extends EnvSchema, TPrefix extends string> = {
  [K in keyof T as K extends `${TPrefix}${string}` ? K : never]: InferType<T[K]>;
};

/**
 * Create a client-safe environment resolver that only exposes variables with the specified prefix
 * @param schema Environment schema with client variables prefixed (e.g., PUBLIC_API_URL)
 * @param options Configuration options
 * @returns Promise resolving to client environment variables only
 */
export async function resolveClientEnv<
  TSchema extends EnvSchema,
  TPrefix extends string = 'PUBLIC_'
>(
  schema: TSchema,
  options: ClientEnvOptions & { clientPrefix?: TPrefix } = {}
): Promise<InferClientSchema<TSchema, TPrefix>> {
  const { resolvers = [processEnv()], clientPrefix = 'PUBLIC_' as TPrefix, strict = true } = options;

  // Check for server-only keys in schema
  const serverKeys = Object.keys(schema).filter(key => !key.startsWith(clientPrefix));

  // Runtime validation for browser safety
  if (isBrowser() && serverKeys.length > 0) {
    const error = new Error(
      `❌ Server-only environment variables accessed in browser context: ${serverKeys.join(', ')}\n` +
      `💡 Only variables prefixed with '${clientPrefix}' are allowed in client bundles.`
    );
    if (process.env.NODE_ENV === 'development') {
      throw error;
    } else {
      console.error(error.message);
      return {} as InferClientSchema<TSchema, TPrefix>;
    }
  }

  // Filter to only client-prefixed keys
  const clientSchema: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(schema)) {
    if (key.startsWith(clientPrefix)) {
      clientSchema[key] = value;
    }
  }

  // Use resolve.async() to handle multiple resolvers
  const tuples = resolvers.map(resolver => [resolver, clientSchema as SimpleEnvSchema] as [Resolver, SimpleEnvSchema]);
  const result = await resolve.async(tuples[0]!, ...tuples.slice(1), { strict });

  return result as InferClientSchema<TSchema, TPrefix>;
}

/**
 * Create split server and client environment resolvers
 * @param schema Object with server and client schemas
 * @param options Configuration options
 * @returns Promise resolving to { server, client } environments
 */
export async function resolveEnvSplit<
  TServerSchema extends SimpleEnvSchema,
  TClientSchema extends SimpleEnvSchema,
  TPrefix extends string = 'PUBLIC_'
>(
  schema: {
    server: TServerSchema;
    client: TClientSchema;
  },
  options: EnvSplitOptions & { clientPrefix?: TPrefix } = {}
): Promise<{
  server: InferSimpleSchema<TServerSchema>;
  client: InferSimpleSchema<TClientSchema>;
}> {
  const { resolvers = [dotenv({ expand: true }), processEnv()], clientPrefix = 'PUBLIC_' as TPrefix, policies, interpolate, strict } = options;

  // Validate client keys have correct prefix
  const clientKeys = Object.keys(schema.client);
  const incorrectClientKeys = clientKeys.filter(key => !key.startsWith(clientPrefix));
  if (incorrectClientKeys.length > 0) {
    throw new Error(
      `❌ Client environment variables must be prefixed with '${clientPrefix}': ${incorrectClientKeys.join(', ')}\n` +
      `💡 Rename these variables to start with '${clientPrefix}' (e.g., ${incorrectClientKeys[0]} → ${clientPrefix}${incorrectClientKeys[0]})`
    );
  }

  // Validate server keys don't have client prefix
  const serverKeys = Object.keys(schema.server);
  const incorrectServerKeys = serverKeys.filter(key => key.startsWith(clientPrefix));
  if (incorrectServerKeys.length > 0) {
    throw new Error(
      `❌ Server environment variables should not be prefixed with '${clientPrefix}': ${incorrectServerKeys.join(', ')}\n` +
      `💡 These variables will be exposed to the client. Move to client schema or remove prefix.`
    );
  }

  // Create server environment (full access) using resolve.async()
  const serverTuples = resolvers.map(resolver => [resolver, schema.server] as [Resolver, TServerSchema]);
  const server = await resolve.async(serverTuples[0]!, ...serverTuples.slice(1), { policies, interpolate, strict });

  // Create client environment (filtered)
  const clientTuples = resolvers.map(resolver => [resolver, schema.client] as [Resolver, TClientSchema]);
  const client = await resolve.async(clientTuples[0]!, ...clientTuples.slice(1), { strict });

  return { server, client } as {
    server: InferSimpleSchema<TServerSchema>;
    client: InferSimpleSchema<TClientSchema>;
  };
}

// Runtime guard for development
if (isBrowser() && process.env.NODE_ENV === 'development') {
  console.warn(
    `🌐 node-env-resolver/web: Running in browser context\n` +
    `   Only variables with your configured prefix will be accessible\n` +
    `   Server-only variables are blocked for security`
  );
}