# node-env-resolver-doppler

## 1.0.1

### Patch Changes

- bf7b80c: Agent-safe config, clearer validation errors and a leaner AWS package.

  - Validation errors print one `KEY: message` line per issue and omit the rejected value. `resolve()` and `resolveAsync()` throw `EnvValidationError` with `issues: { key, reason, message }[]`; `safeResolve()` and `safeResolveAsync()` return the same `issues`.
  - `secret()`, `file()` and the connection-string validators mark values sensitive. `withMeta(validator, { description, example, sensitive })` adds metadata to any validator, and debug views, runtime redaction and the CLI all read it.
  - `ner describe` prints a schema manifest without reading values. `describeSchema()`, `toDotenvExample()` and `fakeEnv()` give you the same data in code.
  - `ner check --agent` validates the environment and prints structured issues without values. `ner scan` adds `--format json`, dotfile scanning, `--staged` and `--context`.
  - `fromObject(env)` in `node-env-resolver/resolvers` resolves from a plain object such as a test fixture or a Workers `env`.
  - The Next.js and Vite adapters keep sensitive values in server config.
  - `node-env-resolver-aws` takes `@aws-sdk/client-secrets-manager` and `@aws-sdk/client-ssm` 3.714.0 or later as peer dependencies. Install them next to it: `npm install node-env-resolver-aws @aws-sdk/client-secrets-manager @aws-sdk/client-ssm`. On Lambda you can use the runtime's built-in SDK when it is 3.714.0 or later.
  - AWS resolvers and handlers accept `sessionToken`, pass `profile` to the SDK, and create their client on first use. `aws-ssm://` and `awsSsm()` accept flat parameter names, and `aws-sm://secret#key` references to one secret share a single fetch per resolve.
  - `awsSsm({ recursive: true })` reports two parameters that map to one variable. `awsSecrets()` stores non-string JSON values as JSON text.
  - Builds use TypeScript 7 and tsup 9, linting uses oxlint, and dependencies are current.

- Updated dependencies [bf7b80c]
  - node-env-resolver@6.7.0
