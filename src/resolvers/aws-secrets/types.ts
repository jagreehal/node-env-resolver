export type AwsConfig = {
  region: string;
  credentials: {
    accessKeyId: string;
    secretAccessKey: string;
  };
};

export type ResolveAwsSecretsProps = {
  secretId: string;
  awsConfig: AwsConfig;
};
