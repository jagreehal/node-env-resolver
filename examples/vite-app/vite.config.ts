import { defineConfig } from 'vite';
import { nodeEnvResolverPlugin } from 'node-env-resolver-vite/plugin';
import { envConfig } from './src/env';

export default defineConfig({
  plugins: [
    nodeEnvResolverPlugin(envConfig, {
      injectClientEnv: true,
      generateTypes: 'src/vite-env.d.ts'
    })
  ],
  server: {
    port: 5173,
  },
  build: {
    outDir: 'dist',
  },
});

