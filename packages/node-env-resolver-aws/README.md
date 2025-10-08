# node-env-resolver/aws

AWS integration for node-env-resolver with Secrets Manager and SSM Parameter Store support.

[![npm version](https://img.shields.io/npm/v/node-env-resolver/aws)](https://www.npmjs.com/package/node-env-resolver/aws)

## Install

```bash
npm install node-env-resolver/aws
```

## Quick start

### One-line convenience functions (recommended)

```ts
import { resolveSsm, resolveSecrets } from 'node-env-resolver-aws';

// Resolve from SSM Parameter Store
const config = await resolveSsm({
  path: '/myapp/config'
}, {
  API_ENDPOINT: 'url',
  TIMEOUT: 30
});

// Resolve from Secrets Manager
const secrets = await resolveSecrets({
  secretId: 'myapp/production/secrets'
}, {
  DATABASE_URL: 'url',
  API_KEY: 'string'
});
```

### Using with extend (for combining multiple sources)

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

- One-line convenience functions for quick setup
- Load secrets from AWS Secrets Manager
- Load parameters from SSM Parameter Store
- Safe (non-throwing) versions of all functions
- Automatic AWS credential detection (environment variables, IAM roles, ~/.aws/credentials)
- Optional TTL caching
- Full TypeScript support

## AWS Credentials

This package uses the standard AWS SDK credential provider chain. Credentials are automatically detected from:

1. **Environment variables** (recommended for local development)
   ```bash
   export AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE
   export AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY
   export AWS_REGION=us-west-2
   ```

2. **IAM roles** (recommended for production - EC2, Lambda, ECS)

3. **AWS credentials file** (`~/.aws/credentials`)

4. **Explicit options** (for special cases):
   ```ts
   await resolveSsm({
     path: '/myapp/config',
     region: 'us-east-1',
     accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
     secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY'
   }, { API_ENDPOINT: 'url' });
   ```

**In most cases, you don't need to pass credentials explicitly** - just set the standard AWS environment variables or use IAM roles.

## API Functions

### Convenience Functions

#### `resolveSsm(ssmOptions, schema, resolveOptions?)`

Directly resolve environment variables from SSM Parameter Store.

```ts
import { resolveSsm } from 'node-env-resolver-aws';

const config = await resolveSsm({
  path: '/myapp/config',
  region: 'us-east-1',
  recursive: true
}, {
  API_ENDPOINT: 'url',
  TIMEOUT: 30
});
```

#### `safeResolveSsm(ssmOptions, schema, resolveOptions?)`

Safe version that returns a result object instead of throwing.

```ts
import { safeResolveSsm } from 'node-env-resolver-aws';

const result = await safeResolveSsm({
  path: '/myapp/config'
}, {
  API_ENDPOINT: 'url'
});

if (result.success) {
  console.log(result.data.API_ENDPOINT);
} else {
  console.error(result.error);
}
```

#### `resolveSecrets(secretsOptions, schema, resolveOptions?)`

Directly resolve environment variables from Secrets Manager.

```ts
import { resolveSecrets } from 'node-env-resolver-aws';

const config = await resolveSecrets({
  secretId: 'myapp/production/secrets',
  region: 'us-east-1'
}, {
  DATABASE_URL: 'url',
  API_KEY: 'string'
});
```

#### `safeResolveSecrets(secretsOptions, schema, resolveOptions?)`

Safe version that returns a result object instead of throwing.

```ts
import { safeResolveSecrets } from 'node-env-resolver-aws';

const result = await safeResolveSecrets({
  secretId: 'myapp/secrets'
}, {
  DATABASE_URL: 'url'
});

if (result.success) {
  console.log(result.data.DATABASE_URL);
} else {
  console.error(result.error);
}
```

### Extender Functions (for use with `extend`)

#### `awsSsm(options)` and `awsSecrets(options)`

These return resolver objects for use with the `extend` option when you need to combine multiple sources.

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

### Production app with one-line functions

```ts
import { resolveSecrets, resolveSsm } from 'node-env-resolver-aws';

// Load secrets from Secrets Manager
const secrets = await resolveSecrets({
  secretId: 'myapp/production/secrets'
}, {
  DATABASE_URL: 'url',
  JWT_SECRET: 'string',
});

// Load config from SSM
const config = await resolveSsm({
  path: '/myapp/production/config',
  recursive: true
}, {
  NODE_ENV: ['development', 'production'] as const,
  PORT: 3000,
});
```

### Production app with extend (combining sources)

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
import { resolveSecrets } from 'node-env-resolver-aws';

const config = await resolveSecrets({
  secretId: 'lambda/secrets'
}, {
  API_ENDPOINT: 'url',
  TIMEOUT: 30,
});

export const handler = async (event) => {
  // Use config
};
```

### Safe error handling

```ts
import { safeResolveSecrets } from 'node-env-resolver-aws';

const result = await safeResolveSecrets({
  secretId: 'myapp/production/secrets'
}, {
  DATABASE_URL: 'url',
  API_KEY: 'string'
});

if (result.success) {
  // Use result.data with full type safety
  await connectDatabase(result.data.DATABASE_URL);
} else {
  // Handle error gracefully
  console.error('Failed to load secrets:', result.error);
  process.exit(1);
}
```

## Error handling

### With safe functions (recommended)

```ts
import { safeResolveSecrets } from 'node-env-resolver-aws';

const result = await safeResolveSecrets({
  secretId: 'myapp/secrets'
}, {
  DATABASE_URL: 'url'
});

if (!result.success) {
  console.error('Failed to load secrets:', result.error);
  process.exit(1);
}

// Use result.data safely
console.log(result.data.DATABASE_URL);
```

### With try-catch

```ts
import { resolveSecrets } from 'node-env-resolver-aws';

try {
  const config = await resolveSecrets({
    secretId: 'myapp/secrets'
  }, {
    DATABASE_URL: 'url'
  });
} catch (error) {
  console.error('Failed to load secrets from AWS:', error);
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
