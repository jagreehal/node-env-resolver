# node-env-resolver-vite

## 1.0.0

### Major Changes

- Initial release of Vite integration for node-env-resolver
- Zero-config client/server environment variable splitting
- Automatic `VITE_` prefix validation
- Runtime protection for server variables
- Full TypeScript support with IntelliSense
- **Auto-generate TypeScript definitions** for `import.meta.env`
- Optional Vite plugin for config-time integration
- Support for Vite 4.x, 5.x, 6.x, and 7.x
- Framework agnostic (works with Vue, React, Svelte, Solid, Astro)

### Plugin Features

- `generateTypes` option to auto-generate `vite-env.d.ts`
- Smart type inference from schema (url → string, false → boolean, etc.)
- Won't overwrite files with custom content
- Only runs in development mode for performance

