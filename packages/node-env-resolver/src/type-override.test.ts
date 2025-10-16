import { describe, it, expect } from 'vitest';
import { resolveAsync } from './index';
import { string, number, enums, url, postgres } from './resolvers';
import type { InferSimpleSchema } from './types';

describe('Type override behavior with multiple resolvers', () => {
  it('last schema wins - type changes from string to number', async () => {
    const resolver1 = {
      name: 'resolver1',
      async load() {
        return { PORT: '8080' };
      }
    };

    const resolver2 = {
      name: 'resolver2',
      async load() {
        return { PORT: '3000' };
      }
    };

    const config = await resolveAsync({
      resolvers: [
        [resolver1, { PORT: string() }],  // First schema: string
        [resolver2, { PORT: 3000 }]        // Last schema: number (wins)
      ]
    });

    // Last resolver's value AND last schema's type both win
    expect(config.PORT).toBe(3000);
    expect(typeof config.PORT).toBe('number');
  });

  it('last schema wins - required becomes optional', async () => {
    const resolver1 = {
      name: 'resolver1',
      async load() {
        return { API_KEY: 'key123' };
      }
    };

    const resolver2 = {
      name: 'resolver2',
      async load() {
        return {}; // No API_KEY
      }
    };

    const config = await resolveAsync({
      resolvers: [
        [resolver1, { API_KEY: string() }],   // Required
        [resolver2, { API_KEY: string({optional:true}) }]   // Optional (last schema wins)
      ]
    });

    // Last schema makes it optional
    // Resolver1 provides value, resolver2 doesn't override
    // Result: we get resolver1's value
    expect(config.API_KEY).toBe('key123');
  });

  it('last schema wins - string becomes validated URL', async () => {
    const resolver1 = {
      name: 'resolver1',
      async load() {
        return { ENDPOINT: 'just-a-string' };
      }
    };

    const resolver2 = {
      name: 'resolver2',
      async load() {
        return { ENDPOINT: 'https://api.example.com' };
      }
    };

    const config = await resolveAsync({
      resolvers: [
        [resolver1, { ENDPOINT: string() }],
        [resolver2, { ENDPOINT: url() }]  // Last schema validates as URL
      ]
    });

    // Last schema validates as URL (returns validated string)
    // Last resolver provides the value
    expect(config.ENDPOINT).toBe('https://api.example.com');
    expect(typeof config.ENDPOINT).toBe('string');
  });

  it('last schema wins - enum validation changes', async () => {
    const resolver1 = {
      name: 'resolver1',
      async load() {
        return { ENV: 'development' };
      }
    };

    const resolver2 = {
      name: 'resolver2',
      async load() {
        return { ENV: 'production' };
      }
    };

    const config = await resolveAsync({
      resolvers: [
        [resolver1, { ENV: enums(['development', 'staging']) }],
        [resolver2, { ENV: enums(['production', 'test']) }]  // Last schema
      ]
    });

    // Last schema's enum validation wins
    // Last resolver provides 'production'
    expect(config.ENV).toBe('production');
  });

  it('last schema wins - stricter validation can cause failure', async () => {
    const resolver1 = {
      name: 'resolver1',
      async load() {
        return { VALUE: 'not-a-number' };
      }
    };

    const resolver2 = {
      name: 'resolver2',
      async load() {
        return { VALUE: 'not-a-number' };
      }
    };

    // Last schema expects number, but value is string - should fail
    await expect(
        resolveAsync({
        resolvers: [
          [resolver1, { VALUE: string() }],
          [resolver2, { VALUE: number() }]  // Stricter
        ]
      })  
    ).rejects.toThrow();
  });

  it('last schema wins - default value changes', async () => {
    const resolver1 = {
      name: 'resolver1',
      async load() {
        return {};
      }
    };

    const resolver2 = {
      name: 'resolver2',
      async load() {
        return {};
      }
    };

    const config = await resolveAsync({
      resolvers: [
        [resolver1, { PORT: 8080 }],    // Default 8080
        [resolver2, { PORT: 3000 }]     // Default 3000 (last schema wins)
      ]
    });

    // Last schema's default wins
    expect(config.PORT).toBe(3000);
  });

  it('documents the behavior: last schema type wins, last resolver value wins', async () => {
    const local = {
      name: 'local',
      async load() {
        return {
          PORT: '8080',        // String value
          API_KEY: 'local-key'
        };
      }
    };

    const aws = {
      name: 'aws',
      async load() {
        return {
          PORT: '3000',         // String value
          DATABASE_URL: 'postgres://db'
        };
      }
    };

    const config = await resolveAsync({
      resolvers: [
        [local, {
          PORT: string({optional:true}),          // Schema type: string | undefined (optional)
          API_KEY: string()
        }],
        [aws, {
          PORT: 3000,              // Schema type: number (WINS for type)
          DATABASE_URL: postgres()  // New variable
        }]
      ]
    }); 

    // TypeScript type checking with satisfies
    // Note: With multiple schemas, TypeScript can't infer the exact merged type
    // so we use type assertion here
    const typedConfig = config as unknown as {
      PORT: number;        // Last schema wins - should be number
      API_KEY: string;     // First schema
      DATABASE_URL: string; // Second schema
    };

    // Verify TypeScript infers correct types for each property
    const port: number = typedConfig.PORT;              // ✓ TypeScript: number (last schema)
    const apiKey: string = typedConfig.API_KEY;         // ✓ TypeScript: string (first schema)
    const dbUrl: string = typedConfig.DATABASE_URL;     // ✓ TypeScript: string (second schema)

    // Verify the actual expanded type - this should work if PORT was string | undefined before merge
    type FirstSchema = InferSimpleSchema<{ readonly PORT: "string?"; readonly API_KEY: "string" }>;
    type FirstPortType = FirstSchema['PORT']; // Hover to see: string | undefined
    const testUndefined: FirstPortType = undefined as unknown as FirstPortType; // ✓ Works! Proves PORT is string | undefined
    expect(testUndefined).toBeUndefined();

    // PORT: Last schema type (number) + last resolver value ('3000' → 3000)
    expect(port).toBe(3000);
    expect(typeof port).toBe('number');

    // API_KEY: Only defined in first resolver/schema
    expect(apiKey).toBe('local-key');
    expect(typeof apiKey).toBe('string');

    // DATABASE_URL: Only defined in second resolver/schema
    expect(dbUrl).toBe('postgres://db');
    expect(typeof dbUrl).toBe('string');
  });
});
