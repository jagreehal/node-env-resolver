/**
 * Client/Server Split Example Tests
 * 
 * This example shows how to safely separate server and client environment variables
 * for web applications, preventing accidental secret exposure.
 */
import { describe, it, expect } from 'vitest';
import { resolveEnvSplit } from 'node-env-resolver/web';
import { dotenv, processEnv } from 'node-env-resolver';

// Mock process.env for testing
const originalEnv = process.env;

describe('Client/Server Split Example', () => {
  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should split environment variables into server and client', async () => {
    // Set up environment variables to ensure we get expected values
    process.env.DATABASE_URL = 'postgres://localhost:5432/myapp';
    process.env.JWT_SECRET = 'super-secret-key';
    process.env.ADMIN_EMAIL = 'admin@example.com';
    process.env.PUBLIC_API_URL = 'https://api.example.com';
    process.env.PUBLIC_APP_NAME = 'My Awesome App';
    
    const { server, client } = await resolveEnvSplit({
      server: {
        // Server-only variables (never exposed to client)
        DATABASE_URL: { 
          type: 'string', 
          secret: true,
          default: 'postgres://localhost:5432/myapp'
        },
        JWT_SECRET: { 
          type: 'string', 
          secret: true,
          default: 'super-secret-key'
        },
        ADMIN_EMAIL: {
          type: 'email',
          default: 'admin@example.com'
        }
      },
      client: {
        // Client-safe variables (exposed to browser)
        PUBLIC_API_URL: { 
          type: 'url',
          default: 'https://api.example.com'
        },
        PUBLIC_APP_NAME: { 
          type: 'string',
          default: 'My Awesome App'
        },
        PUBLIC_ANALYTICS_ID: {
          type: 'string',
          optional: true
        }
      }
    }, {
      resolvers: [
        dotenv({ expand: true }),
        processEnv()
      ],
      clientPrefix: 'PUBLIC_' // Only variables with this prefix go to client
    });

    // Server environment should contain server-only variables
    expect(server.DATABASE_URL).toBe('postgres://localhost:5432/myapp');
    expect(server.JWT_SECRET).toBe('super-secret-key');
    expect(server.ADMIN_EMAIL).toBe('admin@example.com');

    // Client environment should contain client-safe variables
    expect(client.PUBLIC_API_URL).toBe('https://api.example.com');
    expect(client.PUBLIC_APP_NAME).toBe('My Awesome App');
    expect(client.PUBLIC_ANALYTICS_ID).toBeUndefined();
  });

  it('should handle environment variables from process.env', async () => {
    // Set up environment variables
    process.env.DATABASE_URL = 'postgres://prod-db:5432/myapp';
    process.env.JWT_SECRET = 'prod-secret-key';
    process.env.ADMIN_EMAIL = 'admin@myapp.com';
    process.env.PUBLIC_API_URL = 'https://api.myapp.com';
    process.env.PUBLIC_APP_NAME = 'My Production App';
    process.env.PUBLIC_ANALYTICS_ID = 'GA-123456789';

    const { server, client } = await resolveEnvSplit({
      server: {
        DATABASE_URL: { 
          type: 'string', 
          secret: true,
          default: 'postgres://localhost:5432/myapp'
        },
        JWT_SECRET: { 
          type: 'string', 
          secret: true,
          default: 'super-secret-key'
        },
        ADMIN_EMAIL: {
          type: 'email',
          default: 'admin@example.com'
        }
      },
      client: {
        PUBLIC_API_URL: { 
          type: 'url',
          default: 'https://api.example.com'
        },
        PUBLIC_APP_NAME: { 
          type: 'string',
          default: 'My Awesome App'
        },
        PUBLIC_ANALYTICS_ID: {
          type: 'string',
          optional: true
        }
      }
    }, {
      resolvers: [
        dotenv({ expand: true }),
        processEnv()
      ],
      clientPrefix: 'PUBLIC_'
    });

    // Should use values from process.env
    expect(server.DATABASE_URL).toBe('postgres://prod-db:5432/myapp');
    expect(server.JWT_SECRET).toBe('prod-secret-key');
    expect(server.ADMIN_EMAIL).toBe('admin@myapp.com');
    expect(client.PUBLIC_API_URL).toBe('https://api.myapp.com');
    expect(client.PUBLIC_APP_NAME).toBe('My Production App');
    expect(client.PUBLIC_ANALYTICS_ID).toBe('GA-123456789');
  });

  it('should provide correct TypeScript types', async () => {
    const { server, client } = await resolveEnvSplit({
      server: {
        DATABASE_URL: { 
          type: 'string', 
          secret: true,
          default: 'postgres://localhost:5432/myapp'
        },
        JWT_SECRET: { 
          type: 'string', 
          secret: true,
          default: 'super-secret-key'
        },
        ADMIN_EMAIL: {
          type: 'email',
          default: 'admin@example.com'
        }
      },
      client: {
        PUBLIC_API_URL: { 
          type: 'url',
          default: 'https://api.example.com'
        },
        PUBLIC_APP_NAME: { 
          type: 'string',
          default: 'My Awesome App'
        },
        PUBLIC_ANALYTICS_ID: {
          type: 'string',
          optional: true
        }
      }
    }, {
      resolvers: [
        dotenv({ expand: true }),
        processEnv()
      ],
      clientPrefix: 'PUBLIC_'
    });

    // TypeScript should know the correct types
    expect(typeof server.DATABASE_URL).toBe('string');
    expect(typeof server.JWT_SECRET).toBe('string');
    expect(typeof server.ADMIN_EMAIL).toBe('string');
    expect(typeof client.PUBLIC_API_URL).toBe('string');
    expect(typeof client.PUBLIC_APP_NAME).toBe('string');
    expect(typeof client.PUBLIC_ANALYTICS_ID).toBe('undefined');
  });

  it('should handle optional client variables', async () => {
    const { client } = await resolveEnvSplit({
      server: {},
      client: {
        PUBLIC_API_URL: { 
          type: 'url',
          default: 'https://api.example.com'
        },
        PUBLIC_APP_NAME: { 
          type: 'string',
          default: 'My Awesome App'
        },
        PUBLIC_ANALYTICS_ID: {
          type: 'string',
          optional: true
        }
      }
    }, {
      resolvers: [
        dotenv({ expand: true }),
        processEnv()
      ],
      clientPrefix: 'PUBLIC_'
    });

    expect(client.PUBLIC_API_URL).toBe('https://api.example.com');
    expect(client.PUBLIC_APP_NAME).toBe('My Awesome App');
    expect(client.PUBLIC_ANALYTICS_ID).toBeUndefined();
  });

  it('should validate email format', async () => {
    // Set up invalid email
    process.env.ADMIN_EMAIL = 'not-an-email';

    await expect(resolveEnvSplit({
      server: {
        ADMIN_EMAIL: {
          type: 'email',
          default: 'admin@example.com'
        }
      },
      client: {}
    }, {
      resolvers: [
        dotenv({ expand: true }),
        processEnv()
      ],
      clientPrefix: 'PUBLIC_'
    })).rejects.toThrow();
  });

  it('should validate URL format', async () => {
    // Set up invalid URL
    process.env.PUBLIC_API_URL = 'not-a-url';

    await expect(resolveEnvSplit({
      server: {},
      client: {
        PUBLIC_API_URL: { 
          type: 'url',
          default: 'https://api.example.com'
        }
      }
    }, {
      resolvers: [
        dotenv({ expand: true }),
        processEnv()
      ],
      clientPrefix: 'PUBLIC_'
    })).rejects.toThrow();
  });

  it('should demonstrate security separation', async () => {
    const { server, client } = await resolveEnvSplit({
      server: {
        DATABASE_URL: { 
          type: 'string', 
          secret: true,
          default: 'postgres://localhost:5432/myapp'
        },
        JWT_SECRET: { 
          type: 'string', 
          secret: true,
          default: 'super-secret-key'
        }
      },
      client: {
        PUBLIC_API_URL: { 
          type: 'url',
          default: 'https://api.example.com'
        },
        PUBLIC_APP_NAME: { 
          type: 'string',
          default: 'My Awesome App'
        }
      }
    }, {
      resolvers: [
        dotenv({ expand: true }),
        processEnv()
      ],
      clientPrefix: 'PUBLIC_'
    });

    // Server variables should not be accessible from client
    expect(server.DATABASE_URL).toBeDefined();
    expect(server.JWT_SECRET).toBeDefined();
    expect(client.DATABASE_URL).toBeUndefined();
    expect(client.JWT_SECRET).toBeUndefined();

    // Client variables should be accessible from client
    expect(client.PUBLIC_API_URL).toBeDefined();
    expect(client.PUBLIC_APP_NAME).toBeDefined();

    // Server can access client variables (this is safe)
    expect(client.PUBLIC_APP_NAME).toBe('My Awesome App');
  });

  it('should handle client prefix configuration', async () => {
    // Set up environment variables with different prefixes
    process.env.PUBLIC_API_URL = 'https://api.example.com';
    process.env.PUBLIC_CLIENT_APP_NAME = 'My App';
    process.env.SERVER_DB_URL = 'postgres://localhost:5432/myapp';

    const { server, client } = await resolveEnvSplit({
      server: {
        SERVER_DB_URL: { 
          type: 'string', 
          secret: true,
          default: 'postgres://localhost:5432/myapp'
        }
      },
      client: {
        PUBLIC_API_URL: { 
          type: 'url',
          default: 'https://api.example.com'
        },
        PUBLIC_CLIENT_APP_NAME: { 
          type: 'string',
          default: 'My App'
        }
      }
    }, {
      resolvers: [
        dotenv({ expand: true }),
        processEnv()
      ],
      clientPrefix: 'PUBLIC_' // Only PUBLIC_ prefixed variables go to client
    });

    // Only PUBLIC_ prefixed variables should be in client
    expect(client.PUBLIC_API_URL).toBe('https://api.example.com');
    expect(client.PUBLIC_CLIENT_APP_NAME).toBe('My App'); // Now properly prefixed

    // Server variables should be in server
    expect(server.SERVER_DB_URL).toBe('postgres://localhost:5432/myapp');
  });

  it('should handle empty server and client configurations', async () => {
    const { server, client } = await resolveEnvSplit({
      server: {},
      client: {}
    }, {
      resolvers: [
        dotenv({ expand: true }),
        processEnv()
      ],
      clientPrefix: 'PUBLIC_'
    });

    expect(server).toEqual({});
    expect(client).toEqual({});
  });

  it('should demonstrate type safety benefits', async () => {
    const { server, client } = await resolveEnvSplit({
      server: {
        DATABASE_URL: { 
          type: 'string', 
          secret: true,
          default: 'postgres://localhost:5432/myapp'
        },
        PORT: {
          type: 'port',
          default: 3000
        },
        DEBUG: {
          type: 'boolean',
          default: false
        }
      },
      client: {
        PUBLIC_API_URL: { 
          type: 'url',
          default: 'https://api.example.com'
        },
        PUBLIC_APP_NAME: { 
          type: 'string',
          default: 'My Awesome App'
        }
      }
    }, {
      resolvers: [
        dotenv({ expand: true }),
        processEnv()
      ],
      clientPrefix: 'PUBLIC_'
    });

    // TypeScript should infer correct types
    expect(typeof server.DATABASE_URL).toBe('string');
    expect(typeof server.PORT).toBe('number');
    expect(typeof server.DEBUG).toBe('boolean');
    expect(typeof client.PUBLIC_API_URL).toBe('string');
    expect(typeof client.PUBLIC_APP_NAME).toBe('string');
  });
});
