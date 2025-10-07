/**
 * Environment configuration for CLI tools
 * 
 * This file is automatically discovered by `ner check` and `ner codegen`
 * Run: `npx node-env-resolver/cli check` to validate your environment
 * Run: `npx node-env-resolver/cli codegen` to generate types and .env.example
 */

export const schema = {
  NODE_ENV: {
    type: 'string',
    enum: ['development', 'test', 'production'],
    default: 'development',
    description: 'Application environment'
  },
  PORT: {
    type: 'number',
    default: 3000,
    min: 1000,
    max: 65535,
    description: 'Server port number'
  },
  DATABASE_URL: {
    type: 'url',
    secret: true,
    description: 'Database connection URL'
  },
  DEBUG: {
    type: 'boolean',
    default: false,
    optional: true,
    description: 'Enable debug logging'
  },
  API_KEY: {
    type: 'string',
    secret: true,
    optional: true,
    description: 'External API key'
  }
};

// Example split configuration (for web apps)
export const server = {
  DATABASE_URL: schema.DATABASE_URL,
  API_KEY: schema.API_KEY,
  DEBUG: schema.DEBUG
};

export const client = {
  PUBLIC_API_URL: {
    type: 'url',
    default: 'https://api.example.com',
    description: 'Public API endpoint'
  },
  PUBLIC_APP_NAME: {
    type: 'string',
    default: 'My App',
    description: 'Application display name'
  }
};

export const clientPrefix = 'PUBLIC_';