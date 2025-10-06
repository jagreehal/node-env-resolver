import { defineConfig } from 'tsup';

export default defineConfig({
  entryPoints: ['src/index.ts'],
  outDir: './dist/',
  clean: true,
  format: ['esm'],
  splitting: true,
  sourcemap: true,
  bundle: false,
  watch: false,
  treeshake: true,
  dts: true,
  target: 'es2022',
  minify: false,
});