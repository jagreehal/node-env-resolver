---
'node-env-resolver': minor
---

## Security Hardening for Reference-First Deployments

New helpers to enforce strict source policies and prevent secret leakage:

### New Features

- **`strictReferencePolicies(options)`** — Policy preset that:
  - Blocks dotenv in production by default
  - Enforces source restrictions on sensitive keys
  - Accepts resolver name prefixes (e.g., `aws-secrets` matches `aws-secrets(prod/app)`)

- **`strictReferenceResolveOptions(options)`** — Complete resolve options preset with:
  - Audit logging enabled
  - Strict policies applied
  - Sensible secure defaults

- **`preventProcessEnvWrite`** option (default: `true`) — Keeps resolved values out of `process.env` to prevent accidental secret exposure

### Improvements

- `enforceAllowedSources` now checks `resolvedVia` from reference handlers, enabling strict source locks for pointer-in-env workflows
- Better error messages showing actual source path when enforcement fails

### Migration Example

```ts
// Before: Manual policy configuration
const config = await resolveAsync({
  resolvers: [[processEnv(), { API_KEY: string() }]],
  options: {
    policies: { allowDotenvInProduction: false },
    enableAudit: true,
  },
});

// After: Secure-by-default preset
const config = await resolveAsync({
  resolvers: [[processEnv(), { API_KEY: string() }]],
  options: strictReferenceResolveOptions({
    sensitiveKeys: ['API_KEY'],
    secretSources: ['aws-secrets'],
  }),
});
```
