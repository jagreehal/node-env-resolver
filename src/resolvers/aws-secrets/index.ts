import {
  SecretsManagerClient,
  GetSecretValueCommand,
} from '@aws-sdk/client-secrets-manager';

import { EnvValues } from '../../types';
import { ResolveAwsSecretsProps } from './types';
import { mapAwsSecretConfigFromEnv, validateAwsSecretsConfig } from './utils';

export async function resolveAwsSecrets(
  props: ResolveAwsSecretsProps
): Promise<EnvValues> {
  const { secretId, awsConfig } = props;
  const secretsManagerClient = new SecretsManagerClient(awsConfig);

  const getSecretCommand = new GetSecretValueCommand({
    SecretId: secretId,
  });

  const { SecretString } = await secretsManagerClient.send(getSecretCommand);
  if (!SecretString) {
    throw new Error('SecretString is undefined');
  }

  return JSON.parse(SecretString);
}

export default async function configResolver(): Promise<EnvValues> {
  return resolveAwsSecrets(
    validateAwsSecretsConfig(mapAwsSecretConfigFromEnv())
  );
}
