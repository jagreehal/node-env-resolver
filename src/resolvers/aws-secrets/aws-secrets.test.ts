import { SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import configResolver, { resolveAwsSecrets } from './index';
import { ResolveAwsSecretsProps } from './types';

describe('resolveAwsSecrets', () => {
  afterEach(() => {
    jest.resetModules();
  });

  const mockSecretId = 'mockSecretId';
  const mockSecretString = JSON.stringify({ key: 'value' });
  const mockAwsConfig = {
    region: 'us-west-2',
    credentials: {
      accessKeyId: 'access-key-id',
      secretAccessKey: 'secret-access-key',
    },
  };
  const mockProps: ResolveAwsSecretsProps = {
    secretId: mockSecretId,
    awsConfig: mockAwsConfig,
  };

  it('resolves AWS secrets successfully', async () => {
    SecretsManagerClient.prototype.send = jest.fn().mockResolvedValue({
      SecretString: mockSecretString,
      $metadata: {
        httpStatusCode: 200,
      },
    });

    const result = await resolveAwsSecrets(mockProps);
    expect(result).toEqual(JSON.parse(mockSecretString));
  });

  it('throws error if SecretString is undefined', async () => {
    SecretsManagerClient.prototype.send = jest.fn().mockResolvedValue({
      $metadata: {
        httpStatusCode: 200,
      },
    });

    await expect(resolveAwsSecrets(mockProps)).rejects.toThrowError(
      'SecretString is undefined'
    );
  });
});

describe('configResolver', () => {
  const originalEnv = process.env;
  beforeAll(() => {
    process.env = { ...originalEnv };
  });
  afterAll(() => {
    process.env = originalEnv;
  });

  afterEach(() => {
    jest.resetModules();
  });

  const mockSecretString = JSON.stringify({ key: 'value' });

  it('resolves AWS secrets successfully', async () => {
    process.env.AWS_SECRET_ID = 'secret-id';
    process.env.AWS_DEFAULT_REGION = 'us-west-2';
    process.env.AWS_ACCESS_KEY_ID = 'access-key-id';
    process.env.AWS_SECRET_ACCESS_KEY = 'secret-access-key';

    SecretsManagerClient.prototype.send = jest.fn().mockResolvedValue({
      SecretString: mockSecretString,
      $metadata: {
        httpStatusCode: 200,
      },
    });

    const result = await configResolver();
    expect(result).toEqual(JSON.parse(mockSecretString));
  });
});
