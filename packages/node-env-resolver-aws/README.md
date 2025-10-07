# node-env-resolver/aws

AWS integration for node-env-resolver with Secrets Manager and SSM Parameter Store support.

[![npm version](https://img.shields.io/npm/v/node-env-resolver/aws)](https://www.npmjs.com/package/node-env-resolver/aws)

## Install

```bash
npm install node-env-resolver/aws
```

## Quick start

```ts
import { resolve } from 'node-env-resolver';
import { awsSecrets, awsSsm } from 'node-env-resolver-aws';

const config = await resolve({
  DATABASE_URL: 'url',
  API_KEY: 'string',
}, {
  extend: [
    awsSecrets({ secretId: 'myapp/production/secrets' }),
    awsSsm({ path: '/myapp/config' })
  ]
});
```

## Features

- Load secrets from AWS Secrets Manager
- Load parameters from SSM Parameter Store
- Optional TTL caching
- Full TypeScript support

## AWS Secrets Manager

Load JSON secrets from Secrets Manager:

```ts
import { awsSecrets } from 'node-env-resolver-aws';

const config = await resolve({
  DATABASE_URL: 'url',
  API_KEY: 'string'
}, {
  extend: [
    awsSecrets({ secretId: 'myapp/secrets' })
  ]
});
```

With options:

```ts
awsSecrets({
  secretId: 'myapp/production/database',
  region: 'us-east-1',
  parseJson: true  // Default: true
})
```

## SSM Parameter Store

Load parameters from Parameter Store:

```ts
import { awsSsm } from 'node-env-resolver-aws';

const config = await resolve({
  API_ENDPOINT: 'url',
  TIMEOUT: 30
}, {
  extend: [
    awsSsm({ path: '/myapp/config' })
  ]
});
```

Get all parameters under a path:

```ts
awsSsm({
  path: '/myapp/production',
  region: 'us-west-2',
  recursive: true
})
```

## Caching

Add TTL caching to reduce AWS API calls:

```ts
import { resolve, cached, TTL } from 'node-env-resolver';
import { awsSecrets } from 'node-env-resolver-aws';

const config = await resolve({
  DATABASE_URL: 'url'
}, {
  extend: [
    cached(
      awsSecrets({ secretId: 'myapp/secrets' }),
      {
        ttl: TTL.minutes5,
        maxAge: TTL.hour,
        staleWhileRevalidate: true
      }
    )
  ]
});
```

## AWS Permissions

### Secrets Manager

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["secretsmanager:GetSecretValue"],
      "Resource": ["arn:aws:secretsmanager:region:account:secret:myapp/secrets-*"]
    }
  ]
}
```

### SSM Parameter Store

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "ssm:GetParameter",
        "ssm:GetParameters",
        "ssm:GetParametersByPath"
      ],
      "Resource": ["arn:aws:ssm:region:account:parameter/myapp/*"]
    }
  ]
}
```

## Configuration

### awsSecrets options

```ts
interface AwsSecretsOptions {
  secretId: string;              // Secret ID or ARN
  region?: string;               // AWS region (default: AWS_REGION env var or 'us-east-1')
  accessKeyId?: string;          // AWS access key (optional)
  secretAccessKey?: string;      // AWS secret key (optional)
  parseJson?: boolean;           // Parse JSON secrets (default: true)
}
```

### awsSsm options

```ts
interface AwsSsmOptions {
  path: string;                  // Parameter path
  region?: string;               // AWS region (default: AWS_REGION env var or 'us-east-1')
  accessKeyId?: string;          // AWS access key (optional)
  secretAccessKey?: string;      // AWS secret key (optional)
  recursive?: boolean;           // Get all parameters under path (default: false)
}
```

## Examples

### Production app

```ts
import { resolve } from 'node-env-resolver';
import { awsSecrets, awsSsm } from 'node-env-resolver-aws';

const config = await resolve({
  NODE_ENV: ['development', 'production'] as const,
  PORT: 3000,
  DATABASE_URL: 'url',
  JWT_SECRET: 'string',
}, {
  extend: [
    awsSecrets({ secretId: 'myapp/production/secrets' }),
    awsSsm({ path: '/myapp/production/config' })
  ]
});
```

### Lambda function

```ts
import { resolve } from 'node-env-resolver';
import { awsSecrets } from 'node-env-resolver-aws';

const config = await resolve({
  API_ENDPOINT: 'url',
  TIMEOUT: 30,
}, {
  extend: [
    awsSecrets({ secretId: 'lambda/secrets' })
  ]
});

export const handler = async (event) => {
  // Use config
};
```

### Development vs production

```ts
import { resolve } from 'node-env-resolver';
import { awsSecrets } from 'node-env-resolver-aws';

const isProduction = process.env.NODE_ENV === 'production';

const config = await resolve({
  DATABASE_URL: 'url',
  API_KEY: 'string'
}, {
  extend: isProduction ? [
    awsSecrets({ secretId: 'myapp/production/secrets' })
  ] : []
});
```

## Error handling

```ts
try {
  const config = await resolve({
    DATABASE_URL: 'url'
  }, {
    extend: [awsSecrets({ secretId: 'myapp/secrets' })]
  });
} catch (error) {
  if (error.message.includes('AWS Secrets Manager')) {
    console.error('Failed to load secrets from AWS');
  }
}
```

## Troubleshooting

**Permission denied**
- Check IAM permissions match examples above
- Verify resource ARNs are correct

**Secret not found**
- Verify secret ID or path exists
- Check region matches where secret is stored

**Network timeout**
- Check VPC/security group configuration
- Verify internet/NAT gateway access

## License

MIT
