---
'node-env-resolver': minor
'node-env-resolver-nextjs': minor
'node-env-resolver-vite': minor
---

Agent-safe config workflow.

- `secret()`, `file()` and the connection-string validators mark values sensitive. `withMeta(validator, { description, example, sensitive })` adds metadata to any validator. Debug views, runtime redaction and the CLI share this metadata, and values built from a secret count as sensitive.
- `ner describe` prints a schema manifest (`--format json|dotenv`) without reading values. `describeSchema()`, `toDotenvExample()` and `fakeEnv()` expose the same data in code.
- `ner check --agent` validates the environment and prints structured issues without values. It runs offline by default; `--resolve` resolves known reference schemes first.
- `ner scan` adds `--format json`, scans dotfiles, reads staged blobs for `--staged`, and shows `--context` lines with secrets replaced by `[REDACTED]`.
- The Next.js and Vite adapters keep sensitive values out of client config.
- New docs cover coding agents and Docker Sandboxes.
