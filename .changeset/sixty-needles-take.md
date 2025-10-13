---
'node-env-resolver': patch
---

## Bug Fixes

- Fixed resolver path handling: resolvers now correctly handle both absolute and relative paths using `path.resolve()` instead of `path.join()`
- Fixed JSON, YAML, TOML, and HTTP resolvers to properly uppercase environment variable keys
- Fixed TypeScript compilation errors for optional peer dependencies (`js-yaml` and `smol-toml`)

## New Features

- Added `cliArgs` resolver for parsing command-line arguments as environment variables
- Added support for nested configuration objects
- Added computed environment variables functionality
- Added comprehensive type inference tests

These changes improve reliability when using file-based resolvers and add CLI configuration support for greater flexibility in environment management.
