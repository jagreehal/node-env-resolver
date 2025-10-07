/**
 * Test Demo
 */
import { describe, it, expect } from 'vitest';
import { resolve, processEnv } from 'node-env-resolver';

describe('Test Demo', () => {
  it('should import successfully', () => {
    expect(resolve).toBeDefined();
    expect(typeof resolve).toBe('function');
  });

  it('should resolve basic configuration', async () => {
    const config = await resolve({
      PORT: 3000
    });
    
    expect(config).toBeDefined();
    expect(config.PORT).toBe(3000);
  });

  it('should handle different port values', async () => {
    const testPorts = [3000, 8080, 4000, 5000];

    for (const port of testPorts) {
      const config = await resolve({
        PORT: port
      });
      
      expect(config.PORT).toBe(port);
    }
  });

  it('should handle multiple environment variables', async () => {
    // Set NODE_ENV explicitly for this test
    process.env.NODE_ENV = 'development';
    
    const config = await resolve({
      PORT: 3000,
      NODE_ENV: ['development', 'production', 'test'] as const,
      DEBUG: false
    });
    
    expect(config.PORT).toBe(3000);
    expect(config.NODE_ENV).toBe('development');
    expect(config.DEBUG).toBe(false);
  });

  it('should handle string environment variables', async () => {
    // Set environment variables
    process.env.API_URL = 'https://api.example.com';
    process.env.APP_NAME = 'My App';
    
    const config = await resolve({
      API_URL: 'url',
      APP_NAME: 'string'
    }, {
      resolvers: [processEnv()]
    });
    
    expect(config.API_URL).toBe('https://api.example.com');
    expect(config.APP_NAME).toBe('My App');
  });

  it('should handle boolean environment variables', async () => {
    const config = await resolve({
      DEBUG: true,
      ENABLE_LOGGING: false
    });
    
    expect(config.DEBUG).toBe(true);
    expect(config.ENABLE_LOGGING).toBe(false);
  });

  it('should handle mixed types', async () => {
    const config = await resolve({
      PORT: 3000,
      API_URL: 'https://api.example.com',
      DEBUG: true,
      MAX_CONNECTIONS: 100
    });
    
    expect(typeof config.PORT).toBe('number');
    expect(typeof config.API_URL).toBe('string');
    expect(typeof config.DEBUG).toBe('boolean');
    expect(typeof config.MAX_CONNECTIONS).toBe('number');
  });

  it('should provide correct TypeScript types', async () => {
    const config = await resolve({
      PORT: 3000,
      NODE_ENV: ['development', 'production', 'test'] as const,
      DEBUG: false
    });
    
    expect(typeof config.PORT).toBe('number');
    expect(typeof config.NODE_ENV).toBe('string');
    expect(typeof config.DEBUG).toBe('boolean');
  });

  it('should handle enum values', async () => {
    // Set NODE_ENV explicitly for this test
    process.env.NODE_ENV = 'development';
    
    const config = await resolve({
      NODE_ENV: ['development', 'production', 'test'] as const,
      PORT: 3000
    });
    
    expect(config.NODE_ENV).toBe('development'); // Default from enum
    expect(config.PORT).toBe(3000);
  });

  it('should handle URL validation', async () => {
    // Set environment variables
    process.env.API_URL = 'https://api.example.com';
    
    const config = await resolve({
      API_URL: 'url',
      PORT: 3000
    }, {
      resolvers: [processEnv()]
    });
    
    expect(config.API_URL).toBeDefined();
    expect(typeof config.API_URL).toBe('string');
  });

  it('should handle optional variables', async () => {
    const config = await resolve({
      PORT: 3000,
      API_KEY: 'string?'
    });
    
    expect(config.PORT).toBe(3000);
    expect(config.API_KEY).toBeUndefined();
  });

  it('should handle secret variables', async () => {
    // Set environment variables
    process.env.SECRET_KEY = 'super-secret-key';
    
    const config = await resolve({
      PORT: 3000,
      SECRET_KEY: 'string'
    }, {
      resolvers: [processEnv()]
    });
    
    expect(config.PORT).toBe(3000);
    expect(config.SECRET_KEY).toBe('super-secret-key'); // Value provided via processEnv
  });

  it('should handle complex configuration', async () => {
    // Set environment variables
    process.env.NODE_ENV = 'development';
    process.env.API_URL = 'https://api.example.com';
    process.env.DATABASE_URL = 'postgres://localhost:5432/mydb';
    
    const config = await resolve({
      PORT: 3000,
      NODE_ENV: ['development', 'production', 'test'] as const,
      DEBUG: false,
      API_URL: 'url',
      DATABASE_URL: 'url',
      MAX_CONNECTIONS: 100,
      ENABLE_LOGGING: true
    }, {
      resolvers: [processEnv()]
    });
    
    expect(config.PORT).toBe(3000);
    expect(config.NODE_ENV).toBe('development');
    expect(config.DEBUG).toBe(false);
    expect(config.API_URL).toBeDefined();
    expect(config.DATABASE_URL).toBeDefined();
    expect(config.MAX_CONNECTIONS).toBe(100);
    expect(config.ENABLE_LOGGING).toBe(true);
  });

  it('should demonstrate type safety', async () => {
    const config = await resolve({
      PORT: 3000,
      NODE_ENV: ['development', 'production', 'test'] as const,
      DEBUG: false
    });
    
    // TypeScript should infer the correct types
    const port: number = config.PORT;
    const nodeEnv: 'development' | 'production' | 'test' = config.NODE_ENV;
    const debug: boolean = config.DEBUG;

    expect(typeof port).toBe('number');
    expect(typeof nodeEnv).toBe('string');
    expect(typeof debug).toBe('boolean');
  });
});
