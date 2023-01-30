# node-env-resolver

This package provides an easy way to resolve environment variables for Node.js applications.

All you need to do is provide the names of the environment variables you want to resolve, an object with defaults and the package will do the rest.

```ts
import { resolve } from 'node-env-resolver';

// using array of environment variables
const resolvedEnvs = await resolve([
  'NODE_ENV',
  'PORT',
  'DATABASE_URL',
  'REDIS_URL',
]);

// using object with default values
const resolvedEnvs = await resolve({
  NODE_ENV: 'local',
  PORT: 3000,
  DATABASE_URL: 'postgres://localhost:5432/mydb',
  REDIS_URL: '',
});
```

will both return an object with the following structure:

```json
{
  "NODE_ENV": "local",
  "PORT": 3000,
  "DATABASE_URL": "postgres://localhost:5432/mydb",
  "REDIS_URL": "redis://localhost:6379"
}
```

The library also supports Zod Schemas. If you provide a Zod Schema, the package will validate the resolved environment variables against the schema and throw an error if any of the environment variables are invalid.

```ts
const resolvedEnvs = await resolveZod(
  z.object({
    NODE_ENV: z.string().default('local'),
    PORT: z.coerce.number().default(3000),
    DATABASE_URL: z.string().url().default('postgres://localhost:5432/mydb'),
    REDIS_URL: z.string().url().default('redis://localhost:6379'),
  })
);
```

## Installation

```sh
npm install node-env-resolver
```

## Usage

By default the package will resolve the following environment variables from process.env.

You can configure and add additional resolvers in the second argument of the resolve function.

The default value of this argument is `local` which uses an in-built resolver that resolves environment variables from process.env.

```ts
const resolvedEnvs = await resolve(['PORT'], 'local');
```

Environmental variables are resolved in the order of the resolvers provided in the second argument.

For example, if you provide `['local', 'aws-secrets']` as the second argument, the package will first resolve the environment variables from process.env and then from AWS Secrets Manager.

Values resolved from AWS Secrets Manager will override the values resolved from process.env.

### Adding a custom resolver

You can add a custom resolver by providing a function that returns a promise that resolves to an object with the resolved environment variables.

```ts
async function customResolver(): EnvValues {
  return Promise.resolve({
    FOO: 'bar',
    QUZ: 'quux',
  });
}

const resolvedEnvs = await resolve(['FOO', 'QUZ'], customResolver);
```

which will return an object with the following structure:

```json
{
  "FOO": "bar",
  "QUZ": "quux"
}
```

### AWS Secrets Manager

It also has in-built support for the resolving environment variables from aws-secrets-manager.

```ts
import { resolve } from 'node-env-resolver';
const resolvedEnvs = await resolve(
  ['NODE_ENV', 'PORT', 'DATABASE_URL', 'REDIS_URL'],
  'aws-secrets'
);
```

In this case the package expects to use aws credentials from the environment variables `AWS_DEFAULT_REGION`, `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY`.

In addition you need to provide the id of the secret in AWS Secrets Manager that contains the environment variables you want to resolve using the environmental variable `AWS_SECRET_ID`.

### Mixing and matching resolver types

You can mix and match the resolver types.

```ts
async function customResolver(): EnvValues {
  return Promise.resolve({
    FOO: 'bar',
    QUZ: 'quux',
  });
}

const resolvedEnvs = await resolve(['FOO', 'QUZ'], ['local', customResolver]);
```

This will first resolve the environment variables from process.env and then from the custom resolver.

### Options

The third argument of the resolve function is an options object.

```ts
{
  strict?: boolean;
};
```

By default the package will throw an error if any of the environment variables are not found.

You can disable this behaviour by setting the `strict` option to `false`.

```ts
const resolvedEnvs = await resolve(['FOO', 'QUZ'], 'local', { strict: false });
```
