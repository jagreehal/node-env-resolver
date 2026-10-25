# Changelog

## 2.0.2

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

## 2.0.1

### Patch Changes

- b352cef: chore: update dependencies + migrate to vite 8

  Minor/patch dependency refresh via npm-check-updates (--target minor, 3-day cooldown) — no major bumps. Forced vite ^8 via pnpm override.

## 2.0.0

### Major Changes

- 5a4165e: Publish remaining packages to npm
  - node-env-resolver/nextjs: Zero-config Next.js integration
  - node-env-resolver/aws: AWS resolvers for Secrets Manager and SSM
  - node-env-resolver/config: Shared TypeScript and ESLint configurations

## 1.0.0

### Major Changes

- 5c05090: Initial release version 1.0.0
  - node-env-resolver: Core environment variable resolver with async resolvers
  - node-env-resolver/nextjs: Zero-config Next.js integration with client/server split
  - node-env-resolver/aws: AWS resolvers for Secrets Manager and SSM Parameter Store
  - node-env-resolver/config: Shared TypeScript and ESLint configurations

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Initial release of node-env-resolver/config
- Shared TypeScript configuration for the monorepo
- ESLint configuration
- Prettier configuration
- Common build and development settings

### Changed

- N/A

### Deprecated

- N/A

### Removed

- N/A

### Fixed

- N/A

### Security

- N/A
