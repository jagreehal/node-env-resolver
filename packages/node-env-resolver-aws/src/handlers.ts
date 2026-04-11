/**
 * Secret reference handlers for AWS Secrets Manager and SSM Parameter Store
 *
 * These handlers dereference URI-style references like:
 * - aws-sm://secret-id           - AWS Secrets Manager (full secret string)
 * - aws-sm://secret-id#key       - AWS Secrets Manager (JSON key extraction)
 * - aws-ssm://parameter-path     - SSM Parameter Store
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

export interface AwsHandlerOptions {
  region?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  sessionToken?: string;
}

export interface AwsSecretHandlerOptions extends AwsHandlerOptions {
  parseJson?: boolean;
}

export interface AwsSsmHandlerOptions extends AwsHandlerOptions {
  withDecryption?: boolean;
}

function buildCredentials(options: AwsHandlerOptions) {
  if (options.accessKeyId && options.secretAccessKey) {
    return {
      accessKeyId: options.accessKeyId,
      secretAccessKey: options.secretAccessKey,
      ...(options.sessionToken && { sessionToken: options.sessionToken }),
    };
  }
  return undefined;
}

function buildClientConfig(options: AwsHandlerOptions) {
  const region = options.region ?? process.env.AWS_REGION;
  return {
    ...(region ? { region } : {}),
    credentials: buildCredentials(options),
  };
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
        `Expected format: aws-ssm://parameter-path`,
    );
  }

  return { parameterPath: match[1]! };
}

async function fetchSecretValue(
  secretId: string,
  key: string | undefined,
  client: SecretsManagerClient,
): Promise<string> {
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

  if (!response.SecretString) {
    throw new Error(
      `Secret "${secretId}" has no SecretString value. Binary secrets are not supported.`,
    );
  }

  if (!key) {
    return response.SecretString;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(response.SecretString);
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
  const client = new SecretsManagerClient(buildClientConfig(options));

  return {
    name: 'aws-sm',
    async resolve(reference) {
      const { secretId, key } = parseAwsSmReference(reference);
      const value = await fetchSecretValue(secretId, key, client);

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
  const client = new SSMClient(buildClientConfig(options));
  const withDecryption = options.withDecryption ?? true;

  return {
    name: 'aws-ssm',
    async resolve(reference) {
      const { parameterPath } = parseAwsSsmReference(reference);
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
