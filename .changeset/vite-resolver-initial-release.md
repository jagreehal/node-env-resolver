---
"node-env-resolver-vite": major
---

Initial release of Vite integration for node-env-resolver

### Features

- Zero-config client/server environment variable splitting with automatic `VITE_` prefix validation
- Runtime protection to prevent server variables from leaking to browser
- Full TypeScript support with IntelliSense
- **Auto-generate TypeScript definitions** for `import.meta.env` via Vite plugin
- Support for Vite 4.x, 5.x, 6.x, and 7.x
- Framework agnostic (works with Vue, React, Svelte, Solid, Astro)
- Safe resolve pattern with `safeResolve()` for graceful error handling
- Optional Vite plugin (`nodeEnvResolverPlugin`) for config-time validation and type generation

### Plugin Features

- `generateTypes` option to auto-generate `vite-env.d.ts` with proper TypeScript types
- Smart type inference from schema definitions (url → string, false → boolean, etc.)
- Won't overwrite files with custom content
- Only runs in development mode for optimal performance

