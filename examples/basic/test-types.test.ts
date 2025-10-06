/**
 * Test type inference
 */
import { describe, it, expect } from 'vitest';
import { resolveEnvWithZod } from 'node-env-resolver/zod';
import { processEnv } from 'node-env-resolver';
import { z } from 'zod';

describe('Type Inference Test', () => {
  it('should create environment with Zod schema', async () => {
    // Set up environment variables
    process.env.NODE_ENV = 'development';
    process.env.DATABASE_URL = 'https://example.com';
    
    const schema = z.object({
      NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
      PORT: z.number().default(3000),
      DATABASE_URL: z.string().url(),
      DEBUG: z.boolean().optional(),
    });

    const env = await resolveEnvWithZod(schema, {
      resolvers: [processEnv()],
    });
    
    expect(env).toBeDefined();
    expect(env.NODE_ENV).toBe('development');
    expect(env.PORT).toBe(3000);
    expect(env.DATABASE_URL).toBeDefined();
    expect(env.DEBUG).toBeUndefined();
  });

  it('should provide correct types for environment variables', async () => {
    // Set up environment variables
    process.env.NODE_ENV = 'development';
    process.env.DATABASE_URL = 'https://example.com';
    
    const schema = z.object({
      NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
      PORT: z.number().default(3000),
      DATABASE_URL: z.string().url(),
      DEBUG: z.boolean().optional(),
    });

    const env = await resolveEnvWithZod(schema, {
      resolvers: [processEnv()],
    });
    
    // These should show proper types
    expect(typeof env.NODE_ENV).toBe('string');
    expect(typeof env.PORT).toBe('number');
    expect(typeof env.DATABASE_URL).toBe('string');
    expect(typeof env.DEBUG).toBe('undefined');
  });

  it('should handle different enum values', async () => {
    const schema = z.object({
      NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
      PORT: z.number().default(3000),
      DATABASE_URL: z.string().url(),
      DEBUG: z.boolean().optional(),
    });

    const validEnvironments = ['development', 'production', 'test'];
    
    for (const envValue of validEnvironments) {
      // Set up environment variables
      process.env.NODE_ENV = envValue;
      process.env.DATABASE_URL = 'https://example.com';
      
      const envSchema = z.object({
        NODE_ENV: z.enum(['development', 'production', 'test']).default(envValue),
        PORT: z.number().default(3000),
        DATABASE_URL: z.string().url(),
        DEBUG: z.boolean().optional(),
      });

      const env = await resolveEnvWithZod(envSchema, {
        resolvers: [processEnv()],
      });
      
      expect(env.NODE_ENV).toBe(envValue);
    }
  });

  it('should handle different port values', async () => {
    const testPorts = [3000, 8080, 4000, 5000];

    for (const port of testPorts) {
      const schema = z.object({
        NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
        PORT: z.number().default(port),
        DATABASE_URL: z.string().url(),
        DEBUG: z.boolean().optional(),
      });

      // Set up environment variables
      process.env.DATABASE_URL = 'https://example.com';
      
      const env = await resolveEnvWithZod(schema, {
        resolvers: [processEnv()],
      });
      
      expect(env.PORT).toBe(port);
    }
  });

  it('should handle optional boolean values', async () => {
    const schema = z.object({
      NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
      PORT: z.number().default(3000),
      DATABASE_URL: z.string().url(),
      DEBUG: z.boolean().optional(),
    });

    // Set up environment variables
    process.env.DATABASE_URL = 'https://example.com';
    
    const env = await resolveEnvWithZod(schema, {
      resolvers: [processEnv()],
    });
    
    expect(env.DEBUG).toBeUndefined();
  });

  it('should handle required boolean values', async () => {
    const schema = z.object({
      NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
      PORT: z.number().default(3000),
      DATABASE_URL: z.string().url(),
      DEBUG: z.boolean().default(false),
    });

    // Set up environment variables
    process.env.DATABASE_URL = 'https://example.com';
    
    const env = await resolveEnvWithZod(schema, {
      resolvers: [processEnv()],
    });
    
    expect(env.DEBUG).toBe(false);
  });

  it('should handle URL validation', async () => {
    const schema = z.object({
      NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
      PORT: z.number().default(3000),
      DATABASE_URL: z.string().url(),
      DEBUG: z.boolean().optional(),
    });

    // Set up environment variables
    process.env.DATABASE_URL = 'https://example.com';
    
    const env = await resolveEnvWithZod(schema, {
      resolvers: [processEnv()],
    });
    
    expect(env.DATABASE_URL).toBeDefined();
    expect(typeof env.DATABASE_URL).toBe('string');
  });

  it('should demonstrate TypeScript type inference', async () => {
    const schema = z.object({
      NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
      PORT: z.number().default(3000),
      DATABASE_URL: z.string().url(),
      DEBUG: z.boolean().optional(),
    });

    // Set up environment variables
    process.env.DATABASE_URL = 'https://example.com';
    
    const env = await resolveEnvWithZod(schema, {
      resolvers: [processEnv()],
    });
    
    // TypeScript should infer the correct types
    const nodeEnv: 'development' | 'production' | 'test' = env.NODE_ENV;
    const port: number = env.PORT;
    const databaseUrl: string = env.DATABASE_URL;
    const debug: boolean | undefined = env.DEBUG;

    expect(typeof nodeEnv).toBe('string');
    expect(typeof port).toBe('number');
    expect(typeof databaseUrl).toBe('string');
    expect(typeof debug).toBe('undefined');
  });

  it('should handle complex schema with multiple types', async () => {
    const schema = z.object({
      NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
      PORT: z.number().default(3000),
      DATABASE_URL: z.string().url(),
      DEBUG: z.boolean().optional(),
      MAX_CONNECTIONS: z.number().default(100),
      API_KEY: z.string().optional(),
      ENABLE_LOGGING: z.boolean().default(true),
    });

    // Set up environment variables
    process.env.NODE_ENV = 'development';
    process.env.DATABASE_URL = 'https://example.com';
    
    const env = await resolveEnvWithZod(schema, {
      resolvers: [processEnv()],
    });
    
    expect(env.NODE_ENV).toBe('development');
    expect(env.PORT).toBe(3000);
    expect(env.DATABASE_URL).toBeDefined();
    expect(env.DEBUG).toBeUndefined();
    expect(env.MAX_CONNECTIONS).toBe(100);
    expect(env.API_KEY).toBeUndefined();
    expect(env.ENABLE_LOGGING).toBe(true);
  });

  it('should handle schema with string defaults', async () => {
    const schema = z.object({
      NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
      PORT: z.number().default(3000),
      DATABASE_URL: z.string().url(),
      DEBUG: z.boolean().optional(),
      APP_NAME: z.string().default('My App'),
      VERSION: z.string().default('1.0.0'),
    });

    // Set up environment variables
    process.env.DATABASE_URL = 'https://example.com';
    
    const env = await resolveEnvWithZod(schema, {
      resolvers: [processEnv()],
    });
    
    expect(env.APP_NAME).toBe('My App');
    expect(env.VERSION).toBe('1.0.0');
    expect(typeof env.APP_NAME).toBe('string');
    expect(typeof env.VERSION).toBe('string');
  });
});
