---
"node-env-resolver": minor
---

feat(provider-kit): toolkit for vault resolvers

Adds the `node-env-resolver/provider-kit` subpath. Vault resolvers share three
concerns; provider-kit holds each one in a single place instead of four copies:

- `CredentialInput` with `resolveCredential` / `requireCredential` /
  `resolveOptionalCredential`. A bootstrap credential can be a function as well
  as a string, so you can read it from the OS keychain, a short-lived token
  exchange, or workload identity and keep it out of `process.env`, where an
  install-time harvester looks.
- `assertSecureUrl`. Overridable self-hosted endpoints reject plain `http://` by
  default, so a bootstrap credential never travels in cleartext. Loopback stays
  allowed. Pass `allowInsecureHttp` to override.
- `fetchWithTimeout`. A shared abort-based fetch timeout.

The new node-env-resolver-bitwarden, -infisical, -doppler, and -1password
resolvers consume it. Each peer-depends on `node-env-resolver@^6.6.0`.
