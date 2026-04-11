---
'node-env-resolver-aws': minor
'node-env-resolver': minor
'node-env-resolver-nextjs': minor
'node-env-resolver-vite': minor
---

- **node-env-resolver**: `dotenv()` now returns `SyncResolver` so it type-checks with sync `resolve()`. All rethrown errors include `cause` for better diagnostics and ESLint `preserve-caught-error` compliance.
- **node-env-resolver-aws**: Rethrown errors now attach the original as `cause`.
- Add references implementation, CLI runtime protection, debug redaction, and Vite/AWS package improvements
