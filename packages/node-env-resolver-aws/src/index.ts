/**
 * AWS resolvers for node-env-resolver
 * Supports AWS Secrets Manager and SSM Parameter Store
 */

import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import { SSMClient, GetParametersByPathCommand, GetParameterCommand } from '@aws-sdk/client-ssm';
import type {
  Resolver,
  SimpleEnvSchema,
  InferSimpleSchema,
  ResolveOptions,
  SafeResolveResultType,
} from 'node-env-resolver';
import { resolveAsync, safeResolveAsync } from 'node-env-resolver';
import {
  buildClientConfig,
  decodeSecretValue,
  validateSsmParameterName,
  type AwsClientOptions,
} from './shared';

export { resolveAsync, safeResolveAsync };
export { processEnv } from 'node-env-resolver/resolvers';

export {
  createAwsSecretHandler,
  createAwsSsmHandler,
  awsSecretHandler,
  awsSsmHandler,
  type AwsHandlerOptions,
  type AwsSecretHandlerOptions,
  type AwsSsmHandlerOptions,
} from './handlers';
// AWS Secrets Manager
export interface AwsSecretsOptions extends AwsClientOptions {
  secretId: string;
  parseJson?: boolean;
}

/**
 * A JSON object secret becomes one variable per key, with non-string values as their JSON text.
 * Anything else (plain text, or JSON that is not an object) is one variable named after the secret.
 */
function secretToEnv(secretId: string, secretValue: string, parseJson: boolean): Record<string, string> {
  if (parseJson) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(secretValue);
    } catch {
      parsed = undefined;
    }
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
      return Object.fromEntries(
        Object.entries(parsed).map(([key, value]) => [
          key,
          typeof value === 'string' ? value : JSON.stringify(value),
        ]),
      );
    }
  }
  return { [secretId]: secretValue };
}

export function awsSecrets(options: AwsSecretsOptions): Resolver {
  // One client per resolver, made on first load, so `cached()` reloads reuse its connections.
  let client: SecretsManagerClient | undefined;
  return {
    name: `aws-secrets(${options.secretId})`,
    async load() {
      try {
        client ??= new SecretsManagerClient(buildClientConfig(options));
        const response = await client.send(
          new GetSecretValueCommand({ SecretId: options.secretId }),
        );
        return secretToEnv(
          options.secretId,
          decodeSecretValue(response),
          options.parseJson !== false,
        );
      } catch (error) {
        throw new Error(`AWS Secrets Manager: ${error instanceof Error ? error.message : error}`, {
          cause: error,
        });
      }
    },
  };
}

// AWS Systems Manager Parameter Store
export interface AwsSsmOptions extends AwsClientOptions {
  path: string;
  recursive?: boolean;
}

export function awsSsm(options: AwsSsmOptions): Resolver {
  let client: SSMClient | undefined;
  return {
    name: `aws-ssm(${options.path})`,
    async load() {
      try {
        validateSsmParameterName(options.path, { requirePath: options.recursive });
        client ??= new SSMClient(buildClientConfig(options));

        const env = new Map<string, string>();
        // Which parameter each key came from, to report two that would share a key.
        const sources = new Map<string, string>();

        if (options.recursive) {
          // Get all parameters under path
          let nextToken: string | undefined;

          do {
            const command = new GetParametersByPathCommand({
              Path: options.path,
              Recursive: true,
              WithDecryption: true,
              NextToken: nextToken,
            });

            const response = await client.send(command);

            if (response.Parameters) {
              for (const param of response.Parameters) {
                if (param.Name && param.Value) {
                  // Convert /app/prod/DATABASE_URL to DATABASE_URL
                  const key = param.Name.split('/').pop()!;
                  const existing = sources.get(key);
                  if (existing) {
                    throw new Error(
                      `Parameters "${existing}" and "${param.Name}" both map to ${key}. ` +
                        `Rename one, or load each subpath with its own awsSsm().`,
                    );
                  }
                  sources.set(key, param.Name);
                  env.set(key, param.Value);
                }
              }
            }

            nextToken = response.NextToken;
          } while (nextToken);
        } else {
          // Get single parameter
          const command = new GetParameterCommand({
            Name: options.path,
            WithDecryption: true,
          });

          const response = await client.send(command);

          if (response.Parameter?.Value) {
            const key = options.path.split('/').pop()!;
            env.set(key, response.Parameter.Value);
          }
        }

        return Object.fromEntries(env);
      } catch (error) {
        throw new Error(`AWS SSM: ${error instanceof Error ? error.message : error}`, {
          cause: error,
        });
      }
    },
  };
}

// Convenience functions for one-line usage

/**
 * Resolve environment variables directly from AWS SSM Parameter Store
 *
 * @example
 * ```typescript
 * const config = await resolveSsm({
 *   path: '/myapp/config'
 * }, {
 *   API_ENDPOINT: url(),
 *   TIMEOUT: 30
 * });
 * ```
 */
export async function resolveSsm<T extends SimpleEnvSchema>(
  ssmOptions: AwsSsmOptions,
  schema: T,
  resolveOptions?: Partial<ResolveOptions>
): Promise<InferSimpleSchema<T>> {
  return (await resolveAsync({
    resolvers: [[awsSsm(ssmOptions), schema]],
    ...(resolveOptions ? { options: resolveOptions } : {}),
  })) as InferSimpleSchema<T>;
}

/**
 * Safe version of resolveSsm that doesn't throw errors
 *
 * @example
 * ```typescript
 * const result = await safeResolveSsm({
 *   path: '/myapp/config'
 * }, {
 *   API_ENDPOINT: url()
 * });
 *
 * if (result.success) {
 *   console.log(result.data.API_ENDPOINT);
 * } else {
 *   console.error(result.error);
 * }
 * ```
 */
export async function safeResolveSsm<T extends SimpleEnvSchema>(
  ssmOptions: AwsSsmOptions,
  schema: T,
  resolveOptions?: Partial<ResolveOptions>
): Promise<SafeResolveResultType<InferSimpleSchema<T>>> {
  try {
    const result = await safeResolveAsync({
      resolvers: [[awsSsm(ssmOptions), schema]],
      ...(resolveOptions ? { options: resolveOptions } : {}),
    });

    if (result.success) {
      return { success: true, data: result.data as InferSimpleSchema<T> };
    }
    return result;
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Resolve environment variables directly from AWS Secrets Manager
 *
 * @example
 * ```typescript
 * const config = await resolveSecrets({
 *   secretId: 'myapp/production/secrets'
 * }, {
 *   DATABASE_URL: url(),
 *   API_KEY: string()
 * });
 * ```
 */
export async function resolveSecrets<T extends SimpleEnvSchema>(
  secretsOptions: AwsSecretsOptions,
  schema: T,
  resolveOptions?: Partial<ResolveOptions>
): Promise<InferSimpleSchema<T>> {
  return (await resolveAsync({
    resolvers: [[awsSecrets(secretsOptions), schema]],
    ...(resolveOptions ? { options: resolveOptions } : {}),
  })) as InferSimpleSchema<T>;
}

/**
 * Safe version of resolveSecrets that doesn't throw errors
 *
 * @example
 * ```typescript
 * const result = await safeResolveSecrets({
 *   secretId: 'myapp/secrets'
 * }, {
 *   DATABASE_URL: url()
 * });
 *
 * if (result.success) {
 *   console.log(result.data.DATABASE_URL);
 * } else {
 *   console.error(result.error);
 * }
 * ```
 */
export async function safeResolveSecrets<T extends SimpleEnvSchema>(
  secretsOptions: AwsSecretsOptions,
  schema: T,
  resolveOptions?: Partial<ResolveOptions>
): Promise<SafeResolveResultType<InferSimpleSchema<T>>> {
  try {
    const result = await safeResolveAsync({
      resolvers: [[awsSecrets(secretsOptions), schema]],
      ...(resolveOptions ? { options: resolveOptions } : {}),
    });

    if (result.success) {
      return { success: true, data: result.data as InferSimpleSchema<T> };
    }
    return result;
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
