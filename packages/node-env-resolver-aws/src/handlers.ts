/**
 * Secret reference handlers for AWS Secrets Manager and SSM Parameter Store
 *
 * These handlers dereference URI-style references like:
 * - aws-sm://secret-id           - AWS Secrets Manager (full secret string)
 * - aws-sm://secret-id#key       - AWS Secrets Manager (JSON key extraction)
 * - aws-ssm:///parameter-path    - SSM Parameter Store
 *
 * @example
 * ```ts
 * import { resolveAsync } from 'node-env-resolver';
 * import { createAwsSecretHandler, createAwsSsmHandler } from 'node-env-resolver-aws/handlers';
 *
 * const config = await resolveAsync({
 *   resolvers: [[dotenv(), schema]],
 *   references: {
 *     handlers: {
 *       'aws-sm': createAwsSecretHandler({ region: 'us-east-1' }),
 *       'aws-ssm': createAwsSsmHandler({ region: 'us-east-1' }),
 *     }
 *   }
 * });
 * ```
 *
 * .env file:
 * DATABASE_URL=aws-sm://prod/database/url
 * DB_PASSWORD=aws-sm://prod/database#password
 * API_KEY=aws-ssm:///myapp/prod/api-key
 */

import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';
import type { ReferenceHandler } from 'node-env-resolver';
import {
  buildClientConfig,
  decodeSecretValue,
  validateSsmParameterName,
  type AwsClientOptions,
} from './shared';

export type AwsHandlerOptions = AwsClientOptions;

export interface AwsSecretHandlerOptions extends AwsHandlerOptions {
  parseJson?: boolean;
}

export interface AwsSsmHandlerOptions extends AwsHandlerOptions {
  withDecryption?: boolean;
}

function parseAwsSmReference(reference: string): { secretId: string; key?: string } {
  const match = reference.match(/^aws-sm:\/\/(.+)$/);
  if (!match) {
    throw new Error(
      `Invalid aws-sm reference: "${reference}"\n` +
        `Expected format: aws-sm://secret-id or aws-sm://secret-id#json-key`,
    );
  }

  const path = match[1]!;
  const hashIndex = path.indexOf('#');

  if (hashIndex > 0) {
    return {
      secretId: path.slice(0, hashIndex),
      key: path.slice(hashIndex + 1),
    };
  }

  return { secretId: path };
}

function parseAwsSsmReference(reference: string): { parameterPath: string } {
  const match = reference.match(/^aws-ssm:\/\/(.+)$/);
  if (!match) {
    throw new Error(
      `Invalid aws-ssm reference: "${reference}"\n` +
        `Expected format: aws-ssm:///parameter-path`,
    );
  }

  return { parameterPath: match[1]! };
}

async function fetchSecretString(secretId: string, client: SecretsManagerClient): Promise<string> {
  let response;
  try {
    response = await client.send(new GetSecretValueCommand({ SecretId: secretId }));
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Failed to fetch secret "${secretId}" from AWS Secrets Manager: ${msg}\n` +
        `Tip: ensure your AWS credentials are configured and the secret exists in the correct region.`,
      { cause: error },
    );
  }
  return decodeSecretValue(response);
}

/**
 * How long a fetched secret is reused. One resolve looks up each `aws-sm://secret#key` in turn, so
 * this turns several keys from one secret into one call, while a rotated secret is picked up within
 * a second. Longer-lived caching is `cached()`'s job.
 */
const SECRET_REUSE_MS = 1000;

function extractSecretValue(secretValue: string, secretId: string, key: string | undefined): string {
  if (!key) {
    return secretValue;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(secretValue);
  } catch {
    throw new Error(
      `Secret "${secretId}" is not valid JSON — cannot extract key "${key}".\n` +
        `Remove the #${key} fragment if you want the full secret string.`,
    );
  }

  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error(`Secret "${secretId}" is not a JSON object — cannot extract key "${key}".`);
  }

  if (!(key in (parsed as Record<string, unknown>))) {
    const available = Object.keys(parsed as Record<string, unknown>).join(', ');
    throw new Error(
      `Secret "${secretId}" does not contain key "${key}". Available keys: ${available}`,
    );
  }

  return String((parsed as Record<string, unknown>)[key]);
}

async function fetchParameter(
  parameterPath: string,
  withDecryption: boolean,
  client: SSMClient,
): Promise<string> {
  validateSsmParameterName(parameterPath);
  let response;
  try {
    response = await client.send(
      new GetParameterCommand({ Name: parameterPath, WithDecryption: withDecryption }),
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Failed to fetch SSM parameter "${parameterPath}": ${msg}\n` +
        `Tip: ensure the parameter exists and your IAM role has ssm:GetParameter permission.`,
      { cause: error },
    );
  }

  if (!response.Parameter?.Value) {
    throw new Error(`SSM parameter "${parameterPath}" exists but has no value.`);
  }

  return response.Parameter.Value;
}

export function createAwsSecretHandler(options: AwsSecretHandlerOptions = {}): ReferenceHandler {
  // Created on first use, so importing the package (and its default handlers) makes no SDK client.
  let client: SecretsManagerClient | undefined;
  const recent = new Map<string, Promise<string>>();

  const getSecretString = (secretId: string): Promise<string> => {
    const hit = recent.get(secretId);
    if (hit) return hit;
    client ??= new SecretsManagerClient(buildClientConfig(options));
    const secret = fetchSecretString(secretId, client);
    recent.set(secretId, secret);
    const forget = () => {
      if (recent.get(secretId) === secret) recent.delete(secretId);
    };
    // The window starts once the fetch settles; a failure is dropped at once so the next lookup retries.
    secret.then(
      () => setTimeout(forget, SECRET_REUSE_MS).unref(),
      forget,
    );
    return secret;
  };

  return {
    name: 'aws-sm',
    async resolve(reference) {
      const { secretId, key } = parseAwsSmReference(reference);
      const value = extractSecretValue(await getSecretString(secretId), secretId, key);

      return {
        value,
        resolvedVia: 'aws-secrets',
        metadata: {
          secretId,
          key,
          region: options.region ?? process.env.AWS_REGION,
        },
      };
    },
  };
}

export function createAwsSsmHandler(options: AwsSsmHandlerOptions = {}): ReferenceHandler {
  let client: SSMClient | undefined;
  const withDecryption = options.withDecryption ?? true;

  return {
    name: 'aws-ssm',
    async resolve(reference) {
      const { parameterPath } = parseAwsSsmReference(reference);
      client ??= new SSMClient(buildClientConfig(options));
      const value = await fetchParameter(parameterPath, withDecryption, client);

      return {
        value,
        resolvedVia: 'aws-ssm',
        metadata: {
          parameterPath,
          region: options.region ?? process.env.AWS_REGION,
        },
      };
    },
  };
}

/** Pre-configured handlers using ambient AWS credentials (env vars, instance role, etc.) */
export const awsSecretHandler = createAwsSecretHandler();
export const awsSsmHandler = createAwsSsmHandler();
