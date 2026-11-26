---
'node-env-resolver': patch
---

`file()`, `secretsDir`, sync `yaml()`/`toml()` and `watch()` work in the ESM build. `ner scan` flags secret-named properties in JS and TS files when the value is a string literal, and skips lines marked `// ner-scan-ignore`.
