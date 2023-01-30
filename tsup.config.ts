import { defineConfig } from 'tsup';

export default defineConfig({
  entryPoints: ['src/index.ts', 'src/resolve.ts', 'src/resolveZod.ts'],
  outDir: './dist/',
  clean: true,
  format: ['cjs', 'esm'],
  splitting: true,
  sourcemap: false,
  bundle: true,
  legacyOutput: true,
  watch: false,
  treeshake: true,
  dts: true,
});
