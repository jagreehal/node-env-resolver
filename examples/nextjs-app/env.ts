import { resolve } from 'node-env-resolver-nextjs';

// For Next.js applications, we define server and client variables separately
export const env = resolve({
  server: {
    // Database - using shorthand syntax with advanced types
    DATABASE_URL: 'postgres?',

    // Authentication
    NEXTAUTH_SECRET: 'string?',
    NEXTAUTH_URL: 'url?',

    // External APIs
    STRIPE_SECRET_KEY: 'string?',
    OPENAI_API_KEY: 'string?',

    // App configuration
    NODE_ENV: ['development', 'test', 'production'] as const,
    PORT: 'port:3000',
  },
  client: {
    // Client-side variables (NEXT_PUBLIC_*)
    NEXT_PUBLIC_APP_URL: 'url?',
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: 'string?',
    NEXT_PUBLIC_GA_ID: 'string?',
    NEXT_PUBLIC_ENABLE_ANALYTICS: false, // boolean with default
  },
});