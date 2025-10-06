import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/web.ts', 'src/zod.ts', 'src/standard-schema.ts', 'src/utils.ts', 'src/validators.ts', 'src/audit.ts', 'src/builder.ts', 'src/resolvers.ts', 'src/resolver.ts', 'src/types.ts'],
  outDir: './dist/',
  clean: false,
  format: ['esm'],
  splitting: true,
  sourcemap: process.env.NODE_ENV !== 'production',
  bundle: false,
  watch: false,
  treeshake: true,
  dts: false,
  target: 'es2022',
  minify: process.env.NODE_ENV === 'production',
  keepNames: false,
  removeNodeProtocol: false,
});
