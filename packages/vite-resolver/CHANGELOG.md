# node-env-resolver-vite

## 1.1.0

### Minor Changes

- c119292: ## 🚀 Major Release: Generic Type System & Bundle Optimization

  ### ✨ New Features

  #### **Unlimited Resolver Tuples Support**
  - **BREAKING**: New generic type system supports unlimited resolver tuples in `resolveAsync()`, `resolve()`, and safe variants
  - No more fixed limits of 3-4 resolvers - use as many as needed!
  - Improved type inference with proper schema merging from multiple resolvers

  #### **New Vite Integration Package**
  - **NEW**: `node-env-resolver-vite` package for seamless Vite integration
  - Vite plugin for environment variable validation during build
  - Type-safe environment variables in Vite applications

  ### 🔧 Improvements

  #### **Bundle Size Optimization**
  - **51% smaller main bundle**: Reduced from 32KB to 15.60KB
  - **45% smaller gzipped**: Reduced from 7.80KB to 4.31KB
  - Moved `processEnv` into main index to avoid importing heavy resolvers
  - Inlined `validateFile` function to prevent pulling in entire validators module
  - Perfect for Cloudflare Workers (only 1.5% of 1MB limit)

  #### **API Enhancements**
  - **BREAKING**: Improved tuple handling with better argument parsing
  - Enhanced error messages for better developer experience
  - Fixed type inference issues across all resolver combinations
  - Improved TypeScript support with better type safety

  #### **Developer Experience**
  - Updated all examples with correct import statements and syntax
  - Fixed validator syntax (e.g., `'url?'` → `url({optional: true})`)
  - Enhanced README documentation with comprehensive examples
  - Improved error messages and debugging information

  ### 🐛 Bug Fixes
  - Fixed import path issues in test files (`validators` → `resolvers`)
  - Resolved TypeScript compilation errors in examples
  - Fixed missing exports and type conversion issues
  - Corrected validator syntax throughout codebase

  ### 📦 Package Updates
  - Updated AWS SDK dependencies to version 3.910.0
  - Enhanced ESLint configuration for better TypeScript support
  - Improved build configuration and bundle optimization

  ### 🎯 Performance
  - **Tailwind CSS approach**: Utility-first, tree-shakeable, minimal bundle impact
  - Lazy loading architecture preserved - heavy resolvers only loaded when imported
  - Optimized for serverless environments with fast cold starts
  - 35% smaller than dotenv alternative

### Patch Changes

- Updated dependencies [c119292]
  - node-env-resolver@5.0.0

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
