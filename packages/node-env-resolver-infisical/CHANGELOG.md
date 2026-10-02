# node-env-resolver-infisical

## 1.0.1

### Patch Changes

- 9cfcf9a: - Validation errors read `KEY: message` on every line and leave out the rejected value.
  - `resolve()` and `resolveAsync()` throw `EnvValidationError` with `issues: { key, reason, message }[]`; `safeResolve()` and `safeResolveAsync()` return the same `issues`.
  - Add `fromObject(env)` in `node-env-resolver/resolvers` to resolve from a plain object such as a test fixture or a Workers `env`.
  - Document `InferSimpleSchema<typeof schema>` for typing config.
  - Build with TypeScript 7 and lint with oxlint; update dependencies.
- Updated dependencies [9cfcf9a]
  - node-env-resolver@6.7.0
