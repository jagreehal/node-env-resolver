import { ResolveAwsSecretsProps } from './types';
import { mapAwsSecretConfigFromEnv, validateAwsSecretsConfig } from './utils';

describe('mapAwsSecretConfigFromEnv', () => {
  const originalEnv = process.env;
  beforeAll(() => {
    process.env = { ...originalEnv };
  });
  afterAll(() => {
    process.env = originalEnv;
  });
  it('maps environment variables to an instance of ResolveAwsSecretsProps', () => {
    process.env.AWS_SECRET_ID = 'secret-id';
    process.env.AWS_DEFAULT_REGION = 'us-west-2';
    process.env.AWS_ACCESS_KEY_ID = 'access-key-id';
    process.env.AWS_SECRET_ACCESS_KEY = 'secret-access-key';

    const expected: ResolveAwsSecretsProps = {
      secretId: 'secret-id',
      awsConfig: {
        region: 'us-west-2',
        credentials: {
          accessKeyId: 'access-key-id',
          secretAccessKey: 'secret-access-key',
        },
      },
    };
    expect(mapAwsSecretConfigFromEnv()).toEqual(expected);
  });
});

describe('validateAwsSecretsConfig', () => {
  it('throws an error if secretId is missing', () => {
    const config: ResolveAwsSecretsProps = {
      secretId: undefined!,
      awsConfig: {
        region: 'us-west-2',
        credentials: {
          accessKeyId: 'access-key-id',
          secretAccessKey: 'secret-access-key',
        },
      },
    };
    expect(() => validateAwsSecretsConfig(config)).toThrow(
      'AWS_SECRET_ID environment variable is missing'
    );
  });

  it('throws an error if awsConfig.region is missing', () => {
    const config: ResolveAwsSecretsProps = {
      secretId: 'secret-id',
      awsConfig: {
        region: undefined!,
        credentials: {
          accessKeyId: 'access-key-id',
          secretAccessKey: 'secret-access-key',
        },
      },
    };
    expect(() => validateAwsSecretsConfig(config)).toThrow(
      'AWS_DEFAULT_REGION environment variable is missing'
    );
  });

  it('throws an error if awsConfig.credentials.accessKeyId is missing', () => {
    const config: ResolveAwsSecretsProps = {
      secretId: 'secret-id',
      awsConfig: {
        region: 'us-west-2',
        credentials: {
          accessKeyId: 'access-key-id',
          secretAccessKey: undefined!,
        },
      },
    };
    expect(() => validateAwsSecretsConfig(config)).toThrow(
      'AWS_SECRET_ACCESS_KEY environment variable is missing'
    );
  });

  it('throws an error if awsConfig.credentials.secretAccessKey is missing', () => {
    const config: ResolveAwsSecretsProps = {
      secretId: 'secret-id',
      awsConfig: {
        region: 'us-west-2',
        credentials: {
          accessKeyId: undefined!,
          secretAccessKey: 'secret-access-key',
        },
      },
    };
    expect(() => validateAwsSecretsConfig(config)).toThrow(
      'AWS_ACCESS_KEY_ID environment variable is missing'
    );
  });

  it('will return valid config', () => {
    const config: ResolveAwsSecretsProps = {
      secretId: 'secret-id',
      awsConfig: {
        region: 'us-west-2',
        credentials: {
          accessKeyId: 'access-key-id',
          secretAccessKey: 'secret-access-key',
        },
      },
    };

    const validatedConfig = validateAwsSecretsConfig(config);

    expect(validatedConfig).toStrictEqual(config);
  });
});
