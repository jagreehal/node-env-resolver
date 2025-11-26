---
'node-env-resolver-aws': patch
'node-env-resolver': patch
'node-env-resolver-nextjs': patch
'node-env-resolver-vite': patch
---

- refresh third-party dependencies (aws-sdk, next, vite) to pick up
  security and bug fixes
- align core resolver package with the updated adapters so consumers get
  consistent peer ranges on install
