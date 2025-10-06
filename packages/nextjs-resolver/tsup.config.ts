import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
  minify: process.env.NODE_ENV === 'production',
  treeshake: true,
  splitting: false,
  sourcemap: true,
  target: 'es2022',
  external: ['next', 'fs/promises', 'path']
});