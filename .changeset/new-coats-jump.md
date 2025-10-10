---
'node-env-resolver': patch
---

Optimize bundle size with inline validation for basic types

This release optimizes the validation architecture to reduce bundle size while maintaining full synchronous support for all validator types.

**What changed:**

- **Inline validation for basic types**: Common types (`string`, `number`, `boolean`, `enum`, `pattern`, `custom`) now use inline validation with zero external dependencies, reducing the code path overhead for simple use cases
- **Optimized imports**: Validators are now statically imported but only the necessary validation logic is executed, eliminating dynamic import overhead
- **Lazy-loaded audit logging**: The audit module is only imported when `enableAudit: true` is set

**Benefits:**

- **Faster execution**: Eliminated dynamic import overhead for advanced validators
- **Smaller code**: Inline validation for basic types reduces code size
- **Better Next.js support**: All validator types (including `url`, `postgres`, `email`, etc.) now work synchronously in Next.js config files
- **No breaking changes**: All existing code continues to work exactly the same

**No migration needed** - this is a pure optimization that maintains backward compatibility!
