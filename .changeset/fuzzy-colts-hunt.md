---
'node-env-resolver-aws': minor
'node-env-resolver': minor
'node-env-resolver-nextjs': minor
'node-env-resolver-vite': minor
---

Fix async import issues for better ESM/CommonJS compatibility

- Replace lazy-loaded async imports with static imports in audit logger for improved reliability across ESM/CommonJS contexts
- Remove unnecessary dynamic async imports in AWS resolver package, using static imports instead
- Improves compatibility and reduces potential issues with module resolution in different environments
