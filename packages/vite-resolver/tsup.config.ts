import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/plugin.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
  minify: process.env.NODE_ENV === 'production',
  treeshake: true,
  splitting: false,
  sourcemap: true,
  target: 'es2022',
  external: ['vite', 'fs/promises', 'path']
});

