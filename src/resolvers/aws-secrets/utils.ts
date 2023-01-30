import { ResolveAwsSecretsProps } from './types';

export function mapAwsSecretConfigFromEnv(): ResolveAwsSecretsProps {
  return {
    secretId: process.env.AWS_SECRET_ID!,
    awsConfig: {
      region: process.env.AWS_DEFAULT_REGION!,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
      },
    },
  };
}

export function validateAwsSecretsConfig(
  config: ResolveAwsSecretsProps
): ResolveAwsSecretsProps {
  if (!config.secretId) {
    throw new Error('AWS_SECRET_ID environment variable is missing');
  }
  if (!config.awsConfig.region) {
    throw new Error('AWS_DEFAULT_REGION environment variable is missing');
  }
  if (!config.awsConfig.credentials.accessKeyId) {
    throw new Error('AWS_ACCESS_KEY_ID environment variable is missing');
  }
  if (!config.awsConfig.credentials.secretAccessKey) {
    throw new Error('AWS_SECRET_ACCESS_KEY environment variable is missing');
  }
  return config;
}
