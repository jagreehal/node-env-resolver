---
"node-env-resolver": patch
"node-env-resolver-aws": patch
"node-env-resolver-dotenvx": patch
"node-env-resolver-vite": patch
"wrangler-resolve": patch
"node-env-resolver-nextjs": patch
---

Fix types resolving to `any` under `moduleResolution: NodeNext`/`node16`: relative imports in published `.d.ts` files now carry `.js` extensions (#63).
