import { describe, it, expect, beforeEach } from 'vitest';
import { resolve, getAuditLog, clearAuditLog } from './index';
describe('Audit Logging', () => {
  beforeEach(() => {
    clearAuditLog();
  });

  it('logs successful env loads in production', async () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    try {
      await resolve({
        SECRET_KEY: 'string',
      }, {
        resolvers: [{
          name: 'test',
          async load() {
            return { SECRET_KEY: 'test-secret' };
          },
        }],
        enableAudit: true,
      });

      const logs = getAuditLog();
      const envLogs = logs.filter(l => l.type === 'env_loaded');

      expect(envLogs.length).toBeGreaterThan(0);
      expect(envLogs[0].key).toBe('SECRET_KEY');
      expect(envLogs[0].source).toBe('test');
    } finally {
      process.env.NODE_ENV = originalEnv;
    }
  });

  it('logs policy violations', async () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    try {
      await resolve({
        DATABASE_URL: 'url',
      }, {
        resolvers: [{
          name: 'dotenv(.env)',
          async load() {
            return { DATABASE_URL: 'http://localhost' };
          },
        }],
        enableAudit: true,
      }).catch(() => {
        // Expected to fail
      });

      const logs = getAuditLog();
      const policyViolations = logs.filter(l => l.type === 'policy_violation');

      expect(policyViolations.length).toBeGreaterThan(0);
      expect(policyViolations[0].key).toBe('DATABASE_URL');
    } finally {
      process.env.NODE_ENV = originalEnv;
    }
  });

  it('logs validation failures', async () => {
    try {
      await resolve({
        PORT: 'port',
      }, {
        resolvers: [{
          name: 'test',
          async load() {
            return { PORT: 'not-a-number' };
          },
        }],
        enableAudit: true,
      });
    } catch {
      // Expected to fail
    }

    const logs = getAuditLog();
    const failures = logs.filter(l => l.type === 'validation_failure');

    expect(failures.length).toBeGreaterThan(0);
  });

  it('limits audit log size to prevent memory leaks', async () => {
    // Generate > 1000 events
    for (let i = 0; i < 1100; i++) {
      try {
        await resolve({
          PORT: 'port',
        }, {
          resolvers: [{
            name: 'test',
            async load() {
              return { PORT: 'invalid' };
            },
          }],
          enableAudit: true,
        });
      } catch {
        // Expected to fail
      }
    }

    const logs = getAuditLog();
    expect(logs.length).toBeLessThanOrEqual(1000);
  });

  it('does not log in development by default', async () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';

    try {
      clearAuditLog();

      await resolve({
        PORT: 3000,
      }, {
        resolvers: [{
          name: 'test',
          async load() {
            return { PORT: '3000' };
          },
        }],
      });

      const logs = getAuditLog();
      const validationLogs = logs.filter(l => l.type === 'validation_success');

      expect(validationLogs.length).toBe(0);
    } finally {
      process.env.NODE_ENV = originalEnv;
    }
  });
});

describe('Security Policies', () => {
  beforeEach(() => {
    clearAuditLog();
  });

  it('enforceAllowedSources - restricts variables to specific resolvers', async () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    try {
      await expect(
        resolve({
          DATABASE_URL: 'url',
          API_KEY: 'string',
        }, {
          resolvers: [
            {
              name: 'process.env',
              async load() {
                return { DATABASE_URL: 'http://localhost', API_KEY: 'key123' };
              },
            },
          ],
          policies: {
            enforceAllowedSources: {
              DATABASE_URL: ['aws-secrets'],
              API_KEY: ['aws-secrets']
            }
          },
          enableAudit: true,
        })
      ).rejects.toThrow();

      const logs = getAuditLog();
      const policyViolations = logs.filter(l => l.type === 'policy_violation');

      expect(policyViolations.length).toBeGreaterThan(0);
    } finally {
      process.env.NODE_ENV = originalEnv;
    }
  });

  it('enforceAllowedSources - allows variables from correct resolvers', async () => {
    const config = await resolve({
      DATABASE_URL: 'url',
      API_KEY: 'string',
    }, {
      resolvers: [
        {
          name: 'aws-secrets',
          async load() {
            return { DATABASE_URL: 'http://localhost', API_KEY: 'key123' };
          },
        },
      ],
      policies: {
        enforceAllowedSources: {
          DATABASE_URL: ['aws-secrets'],
          API_KEY: ['aws-secrets']
        }
      },
    });

    expect(config.DATABASE_URL).toBe('http://localhost');
    expect(config.API_KEY).toBe('key123');
  });

  it('allowDotenvInProduction - blocks dotenv by default in production', async () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    try {
      await expect(
        resolve({
          SECRET: 'string',
        }, {
          resolvers: [
            {
              name: 'dotenv(.env)',
              async load() {
                return { SECRET: 'secret123' };
              },
            },
          ],
        })
      ).rejects.toThrow(/cannot be sourced from \.env files in production/);
    } finally {
      process.env.NODE_ENV = originalEnv;
    }
  });

  it('allowDotenvInProduction - allows dotenv when explicitly enabled', async () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    try {
      const config = await resolve({
        SECRET: 'string',
      }, {
        resolvers: [
          {
            name: 'dotenv(.env)',
            async load() {
              return { SECRET: 'secret123' };
            },
          },
        ],
        policies: {
          allowDotenvInProduction: true
        },
      });

      expect(config.SECRET).toBe('secret123');
    } finally {
      process.env.NODE_ENV = originalEnv;
    }
  });

  it('allowDotenvInProduction - allows specific variables from dotenv', async () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    try {
      const config = await resolve({
        ALLOWED_VAR: 'string',
        BLOCKED_VAR: 'string',
      }, {
        resolvers: [
          {
            name: 'dotenv(.env)',
            async load() {
              return { ALLOWED_VAR: 'allowed', BLOCKED_VAR: 'blocked' };
            },
          },
        ],
        policies: {
          allowDotenvInProduction: ['ALLOWED_VAR']
        },
      });

      expect(config.ALLOWED_VAR).toBe('allowed');
      // BLOCKED_VAR should fail validation
      expect(config.BLOCKED_VAR).toBeUndefined();
    } catch (error) {
      // Expected: BLOCKED_VAR should be rejected
      expect(String(error)).toMatch(/BLOCKED_VAR/);
    } finally {
      process.env.NODE_ENV = originalEnv;
    }
  });
});
