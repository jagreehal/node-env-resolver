/**
 * Environment configuration template for Next.js
 * 
 * Copy this file to your project root as `env.mjs` and customize for your needs.
 * This template includes common patterns for SaaS applications.
 */

import { resolveNextEnv } from '@node-env-resolver/nextjs';

export const env = await resolveNextEnv({
  /**
   * Server-side environment variables
   * These are NEVER sent to the client and are only available in:
   * - Server Components
   * - API Routes  
   * - Middleware
   * - next.config.js
   */
  server: {
    // Database
    DATABASE_URL: { 
      type: 'url', 
      secret: true,
      description: 'Database connection URL' 
    },
    
    // Authentication
    NEXTAUTH_SECRET: { 
      type: 'string', 
      secret: true,
      description: 'Secret for NextAuth.js' 
    },
    NEXTAUTH_URL: { 
      type: 'url',
      description: 'Canonical URL of your site' 
    },
    
    // External APIs (server-side)
    STRIPE_SECRET_KEY: { 
      type: 'string', 
      secret: true, 
      optional: true,
      description: 'Stripe secret key for payments' 
    },
    RESEND_API_KEY: { 
      type: 'string', 
      secret: true, 
      optional: true,
      description: 'Resend API key for email sending' 
    },
    OPENAI_API_KEY: { 
      type: 'string', 
      secret: true, 
      optional: true,
      description: 'OpenAI API key' 
    },
    
    // App Configuration
    NODE_ENV: { 
      type: 'string', 
      enum: ['development', 'test', 'production'],
      description: 'Application environment' 
    },
    PORT: { 
      type: 'port', 
      default: 3000,
      description: 'Port for the development server' 
    },
  },

  /**
   * Client-side environment variables  
   * These MUST be prefixed with NEXT_PUBLIC_ and are sent to the browser.
   * Available everywhere in your app.
   */
  client: {
    // App URLs
    NEXT_PUBLIC_APP_URL: { 
      type: 'url',
      description: 'Public URL of your application' 
    },
    
    // External services (client-side)
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: { 
      type: 'string', 
      optional: true,
      description: 'Stripe publishable key for client-side payments' 
    },
    
    // Analytics & Tracking
    NEXT_PUBLIC_GA_ID: { 
      type: 'string', 
      optional: true,
      description: 'Google Analytics measurement ID' 
    },
    NEXT_PUBLIC_POSTHOG_KEY: { 
      type: 'string', 
      optional: true,
      description: 'PostHog API key for analytics' 
    },
    
    // Feature Flags
    NEXT_PUBLIC_ENABLE_ANALYTICS: { 
      type: 'boolean', 
      default: false,
      description: 'Enable analytics tracking' 
    },
    NEXT_PUBLIC_MAINTENANCE_MODE: { 
      type: 'boolean', 
      default: false,
      description: 'Enable maintenance mode' 
    },
  }
}, {
  // Optional configuration
  expandVars: true, // Enable ${VAR} expansion in .env files
  
  // Add custom resolvers (uncomment as needed)
  // resolvers: [
  //   awsSecrets({ secretId: 'prod/app/secrets' }),
  //   vercelEnv(),
  // ],
  
  // Production security policies
  policies: {
    // Prevent secrets from .env files in production
    allowDotenvInProduction: true,
    
    // Enforce specific sources for critical variables
    // enforceAllowedSources: {
    //   DATABASE_URL: ['aws-secrets', 'vercel-env'],
    //   STRIPE_SECRET_KEY: ['aws-secrets'],
    // },
  },
});

// Export individual parts for convenience (optional)
export const { server, client } = env;