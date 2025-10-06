/**
 * AWS resolvers for node-env-resolver
 * Supports AWS Secrets Manager and SSM Parameter Store
 */

import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import { SSMClient, GetParametersByPathCommand, GetParameterCommand } from '@aws-sdk/client-ssm';
import type { Resolver } from 'node-env-resolver';

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