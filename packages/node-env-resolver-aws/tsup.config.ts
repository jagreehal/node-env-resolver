import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/handlers.ts'],
  outDir: './dist/',
  // Clear dist first: `files: ["dist"]` publishes whatever is there, including chunks from older builds.
  clean: true,
  format: ['esm', 'cjs'],
  splitting: true,
  sourcemap: process.env.NODE_ENV !== 'production',
  bundle: true,
  watch: false,
  treeshake: true,
  dts: false,
  target: 'es2022',
  minify: process.env.NODE_ENV === 'production',
  keepNames: false,
  removeNodeProtocol: false,
  external: [],
});
