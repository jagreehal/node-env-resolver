# Changelog

## 2.0.2

### Patch Changes

- 9cfcf9a: - Validation errors read `KEY: message` on every line and leave out the rejected value.
  - `resolve()` and `resolveAsync()` throw `EnvValidationError` with `issues: { key, reason, message }[]`; `safeResolve()` and `safeResolveAsync()` return the same `issues`.
  - Add `fromObject(env)` in `node-env-resolver/resolvers` to resolve from a plain object such as a test fixture or a Workers `env`.
  - Document `InferSimpleSchema<typeof schema>` for typing config.
  - Build with TypeScript 7 and lint with oxlint; update dependencies.

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
