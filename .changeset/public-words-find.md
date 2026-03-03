---
'node-env-resolver-aws': minor
'node-env-resolver': minor
'node-env-resolver-nextjs': minor
'node-env-resolver-vite': minor
'nextjs-env-resolver-example': minor
---

- **node-env-resolver**: `dotenv()` now returns `SyncResolver` so it type-checks with sync `resolve()`. All rethrown errors include `cause` for better diagnostics and ESLint `preserve-caught-error` compliance.
- **node-env-resolver-aws**: Rethrown errors now attach the original as `cause`.
- **node-env-resolver-nextjs**: Lint fixed for ESLint 10: dropped `eslint-config-next` and use a flat config only.