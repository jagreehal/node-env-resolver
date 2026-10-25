/**
 * Client config, name checks and decoding shared by the resolvers (index.ts) and the reference
 * handlers (handlers.ts), so the two cannot drift apart.
 */

import { Buffer } from 'node:buffer';

export interface AwsClientOptions {
  region?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  sessionToken?: string;
  /** A profile from ~/.aws/config. Ignored when explicit keys are given. */
  profile?: string;
}

/**
 * SDK client config. With no keys and no profile, the SDK uses its default credential chain:
 * environment variables, the Lambda/ECS/EC2 role, then ~/.aws.
 */
export function buildClientConfig(options: AwsClientOptions) {
  const region = options.region ?? process.env.AWS_REGION;
  return {
    ...(region ? { region } : {}),
    ...(options.accessKeyId && options.secretAccessKey
      ? {
          credentials: {
            accessKeyId: options.accessKeyId,
            secretAccessKey: options.secretAccessKey,
            ...(options.sessionToken && { sessionToken: options.sessionToken }),
          },
        }
      : options.profile
        ? { profile: options.profile }
        : {}),
  };
}

/**
 * Checks an SSM parameter name, or a path when `requirePath` is set (GetParametersByPath needs a
 * leading "/"). SSM allows a flat name (`api-key`), but a name with a path must start with "/".
 */
export function validateSsmParameterName(name: string, { requirePath = false } = {}): void {
  if ((requirePath || name.includes('/')) && !name.startsWith('/')) {
    const reason = requirePath
      ? 'SSM parameter paths must start with "/".'
      : `SSM parameter names with a path must start with "/". Did you mean aws-ssm:///${name}?`;
    throw new Error(`Invalid AWS SSM parameter name: "${name}"\n${reason}`);
  }
  if (/^\/ssm(\/|$)/i.test(name)) {
    throw new Error(
      `Invalid AWS SSM parameter name: "${name}"\nSSM parameter names cannot start with "/ssm"`,
    );
  }
  if (!/^[a-zA-Z0-9/._-]+$/.test(name)) {
    const invalidChars = [...new Set(name.match(/[^a-zA-Z0-9/._-]/g) || [])].join('');
    throw new Error(
      `Invalid AWS SSM parameter name: "${name}"\nInvalid character(s): ${invalidChars}`,
    );
  }
}

export function decodeSecretValue(response: {
  SecretString?: string;
  SecretBinary?: Uint8Array;
}): string {
  if (response.SecretString) return response.SecretString;
  if (response.SecretBinary) return Buffer.from(response.SecretBinary).toString('utf-8');
  throw new Error('Secret has no SecretString or SecretBinary value.');
}
