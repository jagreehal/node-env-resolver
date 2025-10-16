import { port, postgres, resolve, string, url } from 'node-env-resolver-nextjs';

// For Next.js applications, we define server and client variables separately
export const env = resolve({
  server: {
    // Database - using shorthand syntax with advanced types
    DATABASE_URL: postgres({optional:true}),

    // Authentication
    NEXTAUTH_SECRET: string({optional:true}),
    NEXTAUTH_URL: url({optional:true}),

    // External APIs
    STRIPE_SECRET_KEY: string({optional:true}),
    OPENAI_API_KEY: string({optional:true}),

    // App configuration
    NODE_ENV: ['development', 'test', 'production'] as const,
    PORT: port({default: 3000}),
  },
  client: {
    // Client-side variables (NEXT_PUBLIC_*)
    NEXT_PUBLIC_APP_URL: url({optional:true}),
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: string({optional:true}),
    NEXT_PUBLIC_GA_ID: string({optional:true}),
    NEXT_PUBLIC_ENABLE_ANALYTICS: false, // boolean with default
  },
});