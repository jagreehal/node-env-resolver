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
  API_ENDPOINT: 'string',
  TIMEOUT: 30
});

// Resolve from Secrets Manager
const secrets = await resolveSecrets({
  secretId: 'myapp/production/secrets'
}, {
  DATABASE_URL: 'string',
  API_KEY: 'string'
});
```

### Using with resolve.with() (for combining multiple sources)

```ts
import { resolve } from 'node-env-resolver';
import { awsSecrets, awsSsm } from 'node-env-resolver-aws';

const config = await resolve.with(
  [awsSecrets({ secretId: 'myapp/production/secrets' }), {
    DATABASE_URL: 'postgres',
    API_KEY: 'string',
  }],
  [awsSsm({ path: '/myapp/config' }), {
    TIMEOUT: 30,
  }]
);
```

## Features

- One-line convenience functions for quick setup
- Load secrets from AWS Secrets Manager
- Load parameters from SSM Parameter Store
- Safe (non-throwing) versions of all functions
- Automatic AWS credential detection (environment variables, IAM roles, ~/.aws/credentials)
- Optional TTL caching
- Full TypeScript support

## Performance and caching

AWS API calls are slow (~100-200ms) and cost money. Caching is essential for production applications.

### Without caching (not recommended)

```typescript
// Every request hits AWS = slow and expensive
export const handler = async (event) => {
  const config = await resolveSecrets({
    secretId: 'myapp/secrets'
  }, {
    DATABASE_URL: 'postgres',
    API_KEY: 'string'
  });
  // 200ms delay on EVERY request + AWS API costs
};
```

### With caching (recommended)

```typescript
import { resolve, cached, TTL } from 'node-env-resolver';
import { awsSecrets } from 'node-env-resolver-aws';

// Cache AWS calls - call resolve.with() every time, let cached() make it fast
export const getConfig = async () => {
  return await resolve.with(
    [cached(
      awsSecrets({ secretId: 'myapp/secrets' }),
      {
        ttl: TTL.minutes5,
        maxAge: TTL.hour,
        staleWhileRevalidate: true
      }
    ), {
      DATABASE_URL: 'postgres',
      API_KEY: 'string',
    }]
  );
};

// Call in your handler
export const handler = async (event) => {
  const config = await getConfig(); // Fast after first call!
  // Use config...
};
```

**AWS Lambda:**

```typescript
import { resolve, cached, TTL } from 'node-env-resolver';
import { awsSecrets } from 'node-env-resolver-aws';

const getConfig = async () => {
  return await resolve.with(
    [cached(
      awsSecrets({ secretId: 'myapp/lambda' }),
      { ttl: TTL.minutes5, staleWhileRevalidate: true }
    ), {
      DATABASE_URL: 'postgres',
    }]
  );
};

export const handler = async (event) => {
  const config = await getConfig(); // Call every invocation
  // Lambda container reuse = cache persists across invocations
  // = most invocations get instant config
};
```
### Best Practices

1. **Always use `cached()` wrapper** when accessing AWS Secrets Manager or SSM
2. **Call `resolve.with()` every time** - don't cache the result in a variable
3. **Use `staleWhileRevalidate: true`** for zero-latency updates
4. **Choose appropriate TTL** based on how often secrets change:
   - Frequently rotating: `TTL.minutes5`
   - Rarely changing: `TTL.hour` or `TTL.hours6`
5. **Set `maxAge`** as a safety net (default: 1 hour)

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
   }, { API_ENDPOINT: 'string' });
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
  API_ENDPOINT: 'string',
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
  API_ENDPOINT: 'string'
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
  DATABASE_URL: 'string',
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
  DATABASE_URL: 'string'
});

if (result.success) {
  console.log(result.data.DATABASE_URL);
} else {
  console.error(result.error);
}
```

### Resolver Functions (for use with `resolve.with()`)

#### `awsSsm(options)` and `awsSecrets(options)`

These return resolver objects for use with `resolve.with()` when you need to combine multiple sources.

## AWS Secrets Manager

Load JSON secrets from Secrets Manager:

```ts
import { resolve } from 'node-env-resolver';
import { awsSecrets } from 'node-env-resolver-aws';

const config = await resolve.with(
  [awsSecrets({ secretId: 'myapp/secrets' }), {
    DATABASE_URL: 'postgres',
    API_KEY: 'string'
  }]
);
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
import { resolve } from 'node-env-resolver';
import { awsSsm } from 'node-env-resolver-aws';

const config = await resolve.with(
  [awsSsm({ path: '/myapp/config' }), {
    API_ENDPOINT: 'string',
    TIMEOUT: 30
  }]
);
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

const config = await resolve.with(
  [cached(
    awsSecrets({ secretId: 'myapp/secrets' }),
    {
      ttl: TTL.minutes5,
      maxAge: TTL.hour,
      staleWhileRevalidate: true
    }
  ), {
    DATABASE_URL: 'postgres'
  }]
);
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
  DATABASE_URL: 'postgres',
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

### Production app with resolve.with() (combining sources)

```ts
import { resolve, processEnv } from 'node-env-resolver';
import { awsSecrets, awsSsm } from 'node-env-resolver-aws';

const config = await resolve.with(
  [processEnv(), {
    NODE_ENV: ['development', 'production'] as const,
    PORT: 3000,
  }],
  [awsSecrets({ secretId: 'myapp/production/secrets' }), {
    DATABASE_URL: 'postgres',
    JWT_SECRET: 'string',
  }],
  [awsSsm({ path: '/myapp/production/config' }), {
    TIMEOUT: 30,
  }]
);
```

### Lambda function

```ts
import { resolveSecrets } from 'node-env-resolver-aws';

const config = await resolveSecrets({
  secretId: 'lambda/secrets'
}, {
  API_ENDPOINT: 'string',
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
  DATABASE_URL: 'string',
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
  DATABASE_URL: 'string'
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
    DATABASE_URL: 'string'
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

## Licence

MIT
