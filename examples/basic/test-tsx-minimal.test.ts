/**
 * TSX Minimal Test
 */
import { describe, it, expect } from 'vitest';
import { env } from 'node-env-resolver/builder';

describe('TSX Minimal Test', () => {
  it('should create environment configuration', async () => {
    const config = env({
      PORT: 3000
    });

    expect(config).toBeDefined();
    expect(typeof config.resolve).toBe('function');
  });

  it('should resolve environment configuration', async () => {
    const config = env({
      PORT: 3000
    });

    const result = await config.resolve();
    
    expect(result).toBeDefined();
    expect(result.PORT).toBe(3000);
  });

  it('should handle different port values', async () => {
    const testCases = [3000, 8080, 4000, 5000];

    for (const port of testCases) {
      // Set the environment variable to override the default
      process.env.PORT = port.toString();
      
      const config = env({
        PORT: 9999 // This will be overridden by the env var
      });

      const result = await config.resolve();
      // Builder API uses env var when available, default when not
      expect(result.PORT).toBe(port);
    }
  });

  it('should provide correct TypeScript types', async () => {
    const config = env({
      PORT: 3000
    });

    const result = await config.resolve();
    
    expect(typeof result.PORT).toBe('number');
  });

  it('should handle multiple environment variables', async () => {
    // Set environment variables explicitly for this test
    process.env.NODE_ENV = 'development';
    process.env.DEBUG = 'false'; // Override the .env file value
    
    const config = env({
      PORT: 3000,
      NODE_ENV: ['development', 'production', 'test'] as const,
      DEBUG: true // This will be overridden by the env var
    });

    const result = await config.resolve();
    
    expect(result.PORT).toBe(3000); // From .env file
    expect(result.NODE_ENV).toBe('development');
    expect(result.DEBUG).toBe(false); // From the env var we set
  });

  it('should handle string environment variables', async () => {
    // Set environment variables
    process.env.API_URL = 'https://api.example.com';
    process.env.APP_NAME = 'My App';
    
    const config = env({
      API_URL: 'url',
      APP_NAME: 'string'
    });

    const result = await config.resolve();
    
    expect(result.API_URL).toBe('https://api.example.com');
    expect(result.APP_NAME).toBe('My App');
  });

  it('should handle boolean environment variables', async () => {
    const config = env({
      DEBUG: true,
      ENABLE_LOGGING: false
    });

    const result = await config.resolve();
    
    expect(result.DEBUG).toBe(true);
    expect(result.ENABLE_LOGGING).toBe(false);
  });

  it('should handle mixed types', async () => {
    const config = env({
      PORT: 3000,
      API_URL: 'https://api.example.com',
      DEBUG: true,
      MAX_CONNECTIONS: 100
    });

    const result = await config.resolve();
    
    expect(typeof result.PORT).toBe('number');
    expect(typeof result.API_URL).toBe('string');
    expect(typeof result.DEBUG).toBe('boolean');
    expect(typeof result.MAX_CONNECTIONS).toBe('number');
  });
});
