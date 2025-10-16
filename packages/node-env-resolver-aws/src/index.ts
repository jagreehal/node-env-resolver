/**
 * AWS resolvers for node-env-resolver
 * Supports AWS Secrets Manager and SSM Parameter Store
 */

import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import { SSMClient, GetParametersByPathCommand, GetParameterCommand } from '@aws-sdk/client-ssm';
import type { Resolver, SimpleEnvSchema, InferSimpleSchema, ResolveOptions } from 'node-env-resolver';

// Re-export main functions for convenience (same as nextjs package pattern)
export { resolveAsync, safeResolveAsync, processEnv } from 'node-env-resolver';

// Re-export commonly used validators for convenience
export {
  string,
  number,
  boolean,
  url,
  email,
  port,
  json,
  postgres,
  mysql,
  mongodb,
  redis,
  http,
  https,
  enums,
  secret,
  custom,
  duration,
  file,
  date,
  timestamp,
  stringArray,
  numberArray,
  urlArray,
} from 'node-env-resolver/resolvers';

// Re-export useful types
export type { SimpleEnvSchema, ResolveOptions, InferSimpleSchema, EnvDefinition, Resolver } from 'node-env-resolver';

// Re-export safe resolve types from node-env-resolver
export interface SafeResolveResult<T> {
  success: true;
  data: T;
}

export interface SafeResolveError {
  success: false;
  error: string;
  errors?: string[];
}

export type SafeResolveResultType<T> = SafeResolveResult<T> | SafeResolveError;

// AWS Secrets Manager
export interface AwsSecretsOptions {
  secretId: string;
  region?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  parseJson?: boolean;
  /** Enable caching with TTL (recommended for production) */
  cache?: boolean | { ttl?: number; maxAge?: number; staleWhileRevalidate?: boolean };
}

export function awsSecrets(options: AwsSecretsOptions): Resolver {
  return {
    name: `aws-secrets(${options.secretId})`,
    async load() {
      try {
        const client = new SecretsManagerClient({
          region: options.region || process.env.AWS_REGION || 'us-east-1',
          // When credentials is undefined, AWS SDK automatically uses the default credential provider chain:
          // 1. Environment variables (AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_SESSION_TOKEN)
          // 2. IAM roles (EC2, Lambda, ECS)
          // 3. AWS credentials file (~/.aws/credentials)
          credentials: options.accessKeyId && options.secretAccessKey ? {
            accessKeyId: options.accessKeyId,
            secretAccessKey: options.secretAccessKey,
          } : undefined,
        });
        
        const command = new GetSecretValueCommand({
          SecretId: options.secretId,
        });
        
        const response = await client.send(command);
        
        if (!response.SecretString) {
          throw new Error('Secret not found or empty');
        }
        
        if (options.parseJson !== false) {
          try {
            return JSON.parse(response.SecretString);
          } catch {
            // If not valid JSON, return as single key-value
            return { [options.secretId]: response.SecretString };
          }
        }
        
        return { [options.secretId]: response.SecretString };
      } catch (error) {
        throw new Error(`AWS Secrets Manager: ${error instanceof Error ? error.message : error}`);
      }
    },
  };
}

// AWS Systems Manager Parameter Store
export interface AwsSsmOptions {
  path: string;
  recursive?: boolean;
  region?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  /** Enable caching with TTL (recommended for production) */
  cache?: boolean | { ttl?: number; maxAge?: number; staleWhileRevalidate?: boolean };
}

export function awsSsm(options: AwsSsmOptions): Resolver {
  return {
    name: `aws-ssm(${options.path})`,
    async load() {
      try {
        const client = new SSMClient({
          region: options.region || process.env.AWS_REGION || 'us-east-1',
          // When credentials is undefined, AWS SDK automatically uses the default credential provider chain:
          // 1. Environment variables (AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_SESSION_TOKEN)
          // 2. IAM roles (EC2, Lambda, ECS)
          // 3. AWS credentials file (~/.aws/credentials)
          credentials: options.accessKeyId && options.secretAccessKey ? {
            accessKeyId: options.accessKeyId,
            secretAccessKey: options.secretAccessKey,
          } : undefined,
        });
        
        const env: Record<string, string> = {};
        
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
                  env[key] = param.Value;
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
            env[key] = response.Parameter.Value;
          }
        }
        
        return env;
      } catch (error) {
        throw new Error(`AWS SSM: ${error instanceof Error ? error.message : error}`);
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
  // Import resolve dynamically to avoid circular dependencies with mocks
  const { resolveAsync } = await import('node-env-resolver');
  
  // TypeScript knows resolveAsync exists from type imports
  return await resolveAsync(
    [awsSsm(ssmOptions), schema],
    ...(resolveOptions ? [resolveOptions] : [])
  ) as InferSimpleSchema<T>;
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
    // Import safeResolve dynamically to avoid circular dependencies with mocks
    const { safeResolveAsync } = await import('node-env-resolver');
    
     
    const result = await safeResolveAsync(
      [awsSsm(ssmOptions), schema],
      ...(resolveOptions ? [resolveOptions] : [])
    );
    
    if (result.success) {
      return { success: true, data: result.data as InferSimpleSchema<T> };
    }
    return result;
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
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
  // Import resolve dynamically to avoid circular dependencies with mocks
  const { resolveAsync } = await import('node-env-resolver');
  
   
  return await resolveAsync(
    [awsSecrets(secretsOptions), schema],
    ...(resolveOptions ? [resolveOptions] : [])
  ) as InferSimpleSchema<T>;
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
    // Import safeResolve dynamically to avoid circular dependencies with mocks
    const { safeResolveAsync } = await import('node-env-resolver');
    
    const result = await safeResolveAsync(
      [awsSecrets(secretsOptions), schema],
      ...(resolveOptions ? [resolveOptions] : [])
    );
    
    if (result.success) {
      return { success: true, data: result.data as InferSimpleSchema<T> };
    }
    return result;
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}