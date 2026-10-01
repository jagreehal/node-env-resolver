---
'node-env-resolver': minor
'node-env-resolver-config': patch
'node-env-resolver-nextjs': patch
'node-env-resolver-1password': patch
'node-env-resolver-aws': patch
'node-env-resolver-bitwarden': patch
'node-env-resolver-doppler': patch
'node-env-resolver-dotenvx': patch
'node-env-resolver-infisical': patch
'node-env-resolver-vite': patch
'wrangler-resolve': patch
---

- Validation errors read `KEY: message` on every line and leave out the rejected value.
- `resolve()` and `resolveAsync()` throw `EnvValidationError` with `issues: { key, reason, message }[]`; `safeResolve()` and `safeResolveAsync()` return the same `issues`.
- Add `fromObject(env)` in `node-env-resolver/resolvers` to resolve from a plain object such as a test fixture or a Workers `env`.
- Document `InferSimpleSchema<typeof schema>` for typing config.
- Build with TypeScript 7 and lint with oxlint; update dependencies.
