import { describe, it, expect, beforeEach } from 'vitest';
import { resolve, getAuditLog, clearAuditLog, string, url, port } from './index';

describe('Audit Logging', () => {
  beforeEach(() => {
    clearAuditLog();
  });

  it('logs successful env loads in production (async)', async () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    try {
      await resolve.async(
        [{
          name: 'test',
          async load() {
            return { SECRET_KEY: 'test-secret' };
          },
        }, {
          SECRET_KEY: string(),
        }],
        { enableAudit: true }
      );

      const logs = getAuditLog();
      const envLogs = logs.filter(l => l.type === 'env_loaded');

      expect(envLogs.length).toBeGreaterThan(0);
      expect(envLogs[0].key).toBe('SECRET_KEY');
      expect(envLogs[0].source).toBe('test');
    } finally {
      process.env.NODE_ENV = originalEnv;
    }
  });

  it('logs successful env loads in production (sync)', () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    try {
      clearAuditLog();
      
      resolve(
        [{
          name: 'test-sync',
          async load() {
            return { SECRET_KEY: 'test-secret' };
          },
          loadSync() {
            return { SECRET_KEY: 'test-secret' };
          },
        }, {
          SECRET_KEY: string(),
        }],
        { enableAudit: true }
      );

      const logs = getAuditLog();
      const envLogs = logs.filter(l => l.type === 'env_loaded');

      expect(envLogs.length).toBeGreaterThan(0);
      expect(envLogs[0].key).toBe('SECRET_KEY');
      expect(envLogs[0].source).toBe('test-sync');
    } finally {
      process.env.NODE_ENV = originalEnv;
    }
  });

  it('logs policy violations', async () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    try {
      await resolve.async(
        [{
          name: 'dotenv(.env)',
          async load() {
            return { DATABASE_URL: 'http://localhost' };
          },
        }, {
          DATABASE_URL: url(),
        }],
        { enableAudit: true }
      ).catch(() => {
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
      await resolve.async(
        [{
          name: 'test',
          async load() {
            return { PORT: 'not-a-number' };
          },
        }, {
          PORT: port(),
        }],
        { enableAudit: true }
      );
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
        await resolve.async(
          [{
            name: 'test',
            async load() {
              return { PORT: 'invalid' };
            },
          }, {
            PORT: port(),
          }],
          { enableAudit: true }
        );
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

      await resolve.async(
        [{
          name: 'test',
          async load() {
            return { PORT: '3000' };
          },
        }, {
          PORT: 3000,
        }]
      );

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
        resolve.async(
          [
            {
              name: 'process.env',
              async load() {
                return { DATABASE_URL: 'http://localhost', API_KEY: 'key123' };
              },
            }, {
              DATABASE_URL: url(),
              API_KEY: string(),
            }
          ],
          {
            policies: {
              enforceAllowedSources: {
                DATABASE_URL: ['aws-secrets'],
                API_KEY: ['aws-secrets']
              }
            },
            enableAudit: true,
          }
        )
      ).rejects.toThrow();

      const logs = getAuditLog();
      const policyViolations = logs.filter(l => l.type === 'policy_violation');

      expect(policyViolations.length).toBeGreaterThan(0);
    } finally {
      process.env.NODE_ENV = originalEnv;
    }
  });

  it('enforceAllowedSources - allows variables from correct resolvers', async () => {
    const config = await resolve.async(
      [
        {
          name: 'aws-secrets',
          async load() {
            return { DATABASE_URL: 'http://localhost', API_KEY: 'key123' };
          },
        }, {
          DATABASE_URL: url(),
          API_KEY: string(),
        }
      ],
      {
        policies: {
          enforceAllowedSources: {
            DATABASE_URL: ['aws-secrets'],
            API_KEY: ['aws-secrets']
          }
        },
      }
    );

    expect(config.DATABASE_URL).toBe('http://localhost');
    expect(config.API_KEY).toBe('key123');
  });

  it('allowDotenvInProduction - blocks dotenv by default in production', async () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    try {
      await expect(
        resolve.async(
          [
            {
              name: 'dotenv(.env)',
              async load() {
                return { SECRET: 'secret123' };
              },
            }, {
              SECRET: string(),
            }
          ]
        )
      ).rejects.toThrow(/cannot be sourced from \.env files in production/);
    } finally {
      process.env.NODE_ENV = originalEnv;
    }
  });

  it('allowDotenvInProduction - allows dotenv when explicitly enabled', async () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    try {
      const config = await resolve.async(
        [
          {
            name: 'dotenv(.env)',
            async load() {
              return { SECRET: 'secret123' };
            },
          }, {
            SECRET: string(),
          }
        ],
        {
          policies: {
            allowDotenvInProduction: true
          },
        }
      );

      expect(config.SECRET).toBe('secret123');
    } finally {
      process.env.NODE_ENV = originalEnv;
    }
  });

  it('allowDotenvInProduction - allows specific variables from dotenv', async () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    try {
      const config = await resolve.async(
        [
          {
            name: 'dotenv(.env)',
            async load() {
              return { ALLOWED_VAR: 'allowed', BLOCKED_VAR: 'blocked' };
            },
          }, {
            ALLOWED_VAR: string(),
            BLOCKED_VAR: string(),
          }
        ],
        {
          policies: {
            allowDotenvInProduction: ['ALLOWED_VAR']
          },
        }
      );

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

describe('Per-Config Audit Tracking', () => {
  beforeEach(() => {
    clearAuditLog();
  });

  it('tracks audit events per config object (async)', async () => {
    const resolver1 = {
      name: 'resolver1',
      async load() {
        return { VAR1: 'value1' };
      },
    };

    const resolver2 = {
      name: 'resolver2',
      async load() {
        return { VAR2: 'value2' };
      },
    };

    const config1 = await resolve.async(
      [resolver1, { VAR1: string() }],
      { enableAudit: true }
    );

    const config2 = await resolve.async(
      [resolver2, { VAR2: string() }],
      { enableAudit: true }
    );

    // Get audit logs for each config
    const audit1 = getAuditLog(config1);
    const audit2 = getAuditLog(config2);

    // Config1 should only have VAR1 events
    expect(audit1.some(e => e.key === 'VAR1')).toBe(true);
    expect(audit1.some(e => e.key === 'VAR2')).toBe(false);

    // Config2 should only have VAR2 events
    expect(audit2.some(e => e.key === 'VAR2')).toBe(true);
    expect(audit2.some(e => e.key === 'VAR1')).toBe(false);

    // Global audit should have both
    const allAudit = getAuditLog();
    expect(allAudit.some(e => e.key === 'VAR1')).toBe(true);
    expect(allAudit.some(e => e.key === 'VAR2')).toBe(true);
  });

  it('tracks audit events per config object (sync)', () => {
    const resolver1 = {
      name: 'resolver1',
      async load() {
        return { VAR1: 'value1' };
      },
      loadSync() {
        return { VAR1: 'value1' };
      },
    };

    const resolver2 = {
      name: 'resolver2',
      async load() {
        return { VAR2: 'value2' };
      },
      loadSync() {
        return { VAR2: 'value2' };
      },
    };

    const config1 = resolve(
      [resolver1, { VAR1: string() }],
      { enableAudit: true }
    );

    const config2 = resolve(
      [resolver2, { VAR2: string() }],
      { enableAudit: true }
    );

    // Get audit logs for each config
    const audit1 = getAuditLog(config1);
    const audit2 = getAuditLog(config2);

    // Config1 should only have VAR1 events
    expect(audit1.some(e => e.key === 'VAR1')).toBe(true);
    expect(audit1.some(e => e.key === 'VAR2')).toBe(false);

    // Config2 should only have VAR2 events
    expect(audit2.some(e => e.key === 'VAR2')).toBe(true);
    expect(audit2.some(e => e.key === 'VAR1')).toBe(false);

    // Global audit should have both
    const allAudit = getAuditLog();
    expect(allAudit.some(e => e.key === 'VAR1')).toBe(true);
    expect(allAudit.some(e => e.key === 'VAR2')).toBe(true);
  });

  it('returns empty array for config without audit session', async () => {
    const config = await resolve.async(
      [{
        name: 'test',
        async load() {
          return { VAR: 'value' };
        },
      }, {
        VAR: string(),
      }],
      { enableAudit: false } // Audit disabled
    );

    const audit = getAuditLog(config);
    expect(audit).toEqual([]);
  });

  it('handles multiple configs with same variables', async () => {
    const config1 = await resolve.async(
      [{
        name: 'source1',
        async load() {
          return { SHARED: 'from-source1' };
        },
      }, {
        SHARED: string(),
      }],
      { enableAudit: true }
    );

    const config2 = await resolve.async(
      [{
        name: 'source2',
        async load() {
          return { SHARED: 'from-source2' };
        },
      }, {
        SHARED: string(),
      }],
      { enableAudit: true }
    );

    const audit1 = getAuditLog(config1);
    const audit2 = getAuditLog(config2);

    // Each config should have its own SHARED variable event
    const shared1 = audit1.find(e => e.key === 'SHARED');
    const shared2 = audit2.find(e => e.key === 'SHARED');

    expect(shared1?.source).toBe('source1');
    expect(shared2?.source).toBe('source2');
  });

  it('maintains backward compatibility with getAuditLog()', async () => {
    await resolve.async(
      [{
        name: 'test1',
        async load() {
          return { VAR1: 'value1' };
        },
      }, {
        VAR1: string(),
      }],
      { enableAudit: true }
    );

    await resolve.async(
      [{
        name: 'test2',
        async load() {
          return { VAR2: 'value2' };
        },
      }, {
        VAR2: string(),
      }],
      { enableAudit: true }
    );

    // Calling getAuditLog() without config returns all events
    const allLogs = getAuditLog();
    expect(allLogs.some(e => e.key === 'VAR1')).toBe(true);
    expect(allLogs.some(e => e.key === 'VAR2')).toBe(true);
  });
});
