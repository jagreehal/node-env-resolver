---
name: node-env-resolver-aws
description: 'Use when loading secrets from AWS Secrets Manager or SSM Parameter Store with node-env-resolver-aws, setting up reference handlers for aws-sm:// or aws-ssm:// URIs, or configuring Lambda cold-start secret resolution.'
---

## Overview

`node-env-resolver-aws` provides two patterns for AWS secret resolution: **resolvers** (bulk-fetch) and **reference handlers** (per-value URI resolution). Requires `node-env-resolver` as peer dependency.

## Import Map

| Import path                      | Exports                                                                                                                                                                                                                                |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `node-env-resolver-aws`          | `awsSecrets`, `awsSsm`, `resolveSecrets`, `safeResolveSecrets`, `resolveSsm`, `safeResolveSsm`, `resolveAsync`, `safeResolveAsync`, `processEnv`, `createAwsSecretHandler`, `createAwsSsmHandler`, `awsSecretHandler`, `awsSsmHandler` |
| `node-env-resolver-aws/handlers` | `createAwsSecretHandler`, `createAwsSsmHandler`, `awsSecretHandler`, `awsSsmHandler`                                                                                                                                                   |

## Two Approaches

### 1. Resolvers (bulk-fetch entire secret/path)

Fetches ALL key-value pairs from one AWS source in a single API call. Use as a resolver tuple.

```typescript
import { resolveAsync } from 'node-env-resolver';
import { processEnv } from 'node-env-resolver/resolvers';
import { awsSecrets, awsSsm } from 'node-env-resolver-aws';
import { string, postgres } from 'node-env-resolver/validators';

const config = await resolveAsync({
  resolvers: [
    [processEnv(), { PORT: 3000, NODE_ENV: ['development', 'production'] as const }],
    // Fetches JSON secret, maps JSON keys to schema keys
    [
      awsSecrets({ secretId: 'prod/app-secrets', region: 'us-east-1' }),
      {
        DATABASE_URL: postgres(),
        API_KEY: string(),
      },
    ],
    // Fetches all params under path, converts /app/prod/KEY to KEY
    [
      awsSsm({ path: '/myapp/prod', recursive: true, region: 'us-east-1' }),
      {
        FEATURE_FLAG: 'off',
        LOG_LEVEL: 'info',
      },
    ],
  ],
  options: { priority: 'last' },
});
```

### 2. Reference handlers (per-value URI resolution)

Individual env var values contain URIs like `aws-sm://secret-id#key`. The handler resolves each one.

```typescript
import { resolveAsync } from 'node-env-resolver';
import { processEnv } from 'node-env-resolver/resolvers';
import { createAwsSecretHandler, createAwsSsmHandler } from 'node-env-resolver-aws/handlers';
import { string } from 'node-env-resolver/validators';

// .env or process.env contains:
//   DB_PASS=aws-sm://prod/db-creds#password
//   API_KEY=aws-sm://prod/api-keys#stripe
//   LOG_LEVEL=aws-ssm:///myapp/prod/log-level

const config = await resolveAsync({
  resolvers: [[processEnv(), { DB_PASS: string(), API_KEY: string(), LOG_LEVEL: 'info' }]],
  references: {
    handlers: {
      'aws-sm': createAwsSecretHandler({ region: 'us-east-1' }),
      'aws-ssm': createAwsSsmHandler({ region: 'us-east-1' }),
    },
  },
});
```

**URI formats:**

- `aws-sm://secret-id` — full secret string
- `aws-sm://secret-id#json-key` — extract one key from JSON secret
- `aws-ssm:///param/path` — SSM parameter (note triple slash for absolute paths)

### When to use which

| Approach                | Use when                                                        |
| ----------------------- | --------------------------------------------------------------- |
| `awsSecrets()` resolver | One JSON secret contains all your app secrets. Single API call. |
| `awsSsm()` resolver     | All params live under one SSM path. Recursive fetch.            |
| Reference handlers      | Env vars point to different secrets/params. Mix SM + SSM.       |
| Both together           | Bulk-fetch main secret + references for one-off values.         |

## Convenience Functions

One-liner resolution when you only need AWS as your source:

```typescript
import { resolveSecrets, resolveSsm } from 'node-env-resolver-aws';
import { string, postgres } from 'node-env-resolver/validators';

// Secrets Manager
const config = await resolveSecrets(
  { secretId: 'prod/app-secrets', region: 'us-east-1' },
  { DATABASE_URL: postgres(), API_KEY: string() }
);

// SSM Parameter Store
const config = await resolveSsm(
  { path: '/myapp/prod', recursive: true },
  { LOG_LEVEL: 'info', FEATURE_FLAG: false }
);

// Safe variants: safeResolveSecrets, safeResolveSsm
```

## Pre-configured Singletons

Use ambient AWS credentials (env vars, instance role, credential file):

```typescript
import { awsSecretHandler, awsSsmHandler } from 'node-env-resolver-aws/handlers';

// No options needed — uses default credential chain
references: {
  handlers: {
    'aws-sm': awsSecretHandler,
    'aws-ssm': awsSsmHandler,
  },
}
```

## Lambda Cold-Start Pattern

Resolve at module level so the promise starts during cold start:

```typescript
import { resolveAsync } from 'node-env-resolver';
import { processEnv } from 'node-env-resolver/resolvers';
import { awsSecrets } from 'node-env-resolver-aws';
import { string } from 'node-env-resolver/validators';
import { protect } from 'node-env-resolver/runtime';

const configPromise = resolveAsync({
  resolvers: [
    [processEnv(), { NODE_ENV: ['development', 'production'] as const }],
    [awsSecrets({ secretId: 'prod/secrets' }), { API_KEY: string(), DB_PASS: string() }],
  ],
});

let protectCleanup: (() => void) | undefined;

export const handler = async (event: unknown) => {
  const config = await configPromise;
  protectCleanup ??= protect(config);
  // config reused across warm invocations
  return { statusCode: 200, body: JSON.stringify({ ok: true }) };
};
```

## Resolver Options

```typescript
// awsSecrets
awsSecrets({
  secretId: string,           // required — secret name or ARN
  region?: string,            // defaults to AWS_REGION env var
  accessKeyId?: string,       // explicit credentials (optional)
  secretAccessKey?: string,
  parseJson?: boolean,        // default true — parse SecretString as JSON
  cache?: boolean | { ttl?, maxAge?, staleWhileRevalidate? },
})

// awsSsm
awsSsm({
  path: string,               // required — parameter path
  recursive?: boolean,        // default false — fetch all under path
  region?: string,
  accessKeyId?: string,
  secretAccessKey?: string,
  cache?: boolean | { ttl?, maxAge?, staleWhileRevalidate? },
})
```

## Common Agent Mistakes

| Mistake                                                   | Correct                                                                                |
| --------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `import { awsSecrets } from 'node-env-resolver'`          | `import { awsSecrets } from 'node-env-resolver-aws'`                                   |
| Using `awsSecrets` with sync `resolve()`                  | `awsSecrets` is async-only — use `resolveAsync()`                                      |
| Using builder `.resolve()` with `awsSecrets`              | Builder `.resolve()` is sync — use `resolveAsync()` directly                           |
| `awsSsm({ path: '/app/prod' })` without `recursive: true` | Without `recursive`, fetches single param. Add `recursive: true` for path-based fetch. |
| `preventProcessEnvWrite: true` in options                 | Goes inside `options.policies.preventProcessEnvWrite`                                  |
| Creating handler for each env var                         | One handler per scheme (`aws-sm`, `aws-ssm`) handles all vars with that prefix         |
