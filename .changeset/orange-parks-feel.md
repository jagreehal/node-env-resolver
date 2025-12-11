---
'node-env-resolver': minor
'node-env-resolver-nextjs': minor
'node-env-resolver-vite': minor
'node-env-resolver-aws': minor
---

Improved TypeScript compatibility and developer experience

- Added `typesVersions` field to package.json for better TypeScript compatibility with older resolution strategies
- Enhanced README with clear TypeScript configuration instructions and concrete examples
- Added repository field to package.json for better discoverability
- Improved troubleshooting section with specific before/after examples for common tsconfig.json setups

This helps users who encounter module resolution errors by providing clear guidance on updating their `moduleResolution` setting from `"node"` to `"NodeNext"`, `"node16"`, or `"bundler"`.
