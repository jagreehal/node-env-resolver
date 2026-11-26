---
'node-env-resolver-nextjs': major
'node-env-resolver-1password': major
'node-env-resolver-aws': major
'node-env-resolver-bitwarden': major
'node-env-resolver-doppler': major
'node-env-resolver-dotenvx': major
'node-env-resolver-infisical': major
'node-env-resolver': major
'node-env-resolver-vite': major
'wrangler-resolve': major
---

Packages ship ES modules for Node.js 24 and later, and CommonJS code on Node.js 24 loads them with `require()`. `file()`, `secretsDir`, sync `yaml()`/`toml()` and `watch()` read files from ESM. `ner scan` flags secret-named properties in JS and TS files when the value is a string literal, passes reference URIs such as `aws-sm://` and `process-env://` and the `.env.example` that `ner describe` writes, and skips lines marked `// ner-scan-ignore`.
