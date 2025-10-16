import { defineConfig } from 'vite';
import { nodeEnvResolverPlugin } from 'node-env-resolver-vite/plugin';
import { string, url, port, postgres, boolean } from 'node-env-resolver/validators';

export default defineConfig({
  plugins: [
    nodeEnvResolverPlugin({
      server: {
        // Server-only environment variables
        DATABASE_URL: postgres({ optional: true }),
        API_SECRET: string({ optional: true }),
        PORT: port({ default: 5173 }),
        NODE_ENV: ['development', 'production', 'test'] as const,
      },
      client: {
        // Client-accessible environment variables (VITE_ prefix required)
        VITE_API_URL: url({ optional: true }),
        VITE_APP_NAME: string({ optional: true }),
        VITE_ENABLE_ANALYTICS: boolean({ default: false }),
        VITE_VERSION: string({ optional: true }),
      }
    }, {
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

