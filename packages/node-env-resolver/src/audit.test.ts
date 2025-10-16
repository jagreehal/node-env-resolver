import { describe, it, expect, beforeEach } from 'vitest';
import { resolve, resolveAsync, getAuditLog, clearAuditLog, SyncResolver, AsyncResolver } from './index';
import { string, url, port } from './validators';

describe('Audit Logging', () => {
  beforeEach(() => {
    clearAuditLog();
  });

  it('logs successful env loads in production (async)', async () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    const customResolver: AsyncResolver = {
      name: 'test',
      async load() {
        return { SECRET_KEY: 'test-secret' };
      },
    };

    try {
      await resolveAsync({
        resolvers: [
          [customResolver, {
            SECRET_KEY: string(),
          }],
        ],
        options: {
          enableAudit: true,
        }
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

  it('logs successful env loads in production (sync)', () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    try {
      clearAuditLog();


      const customResolver: SyncResolver = {
        name: 'test-sync',
        async load() {
          return { SECRET_KEY: 'test-secret' };
        },
        loadSync() {
          return { SECRET_KEY: 'test-secret' };
        },
      };
      resolve({
        resolvers: [
          [customResolver, {
            SECRET_KEY: string(),
          }],
        ],
        options: {
          enableAudit: true,
        }
      });        

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

    const customResolver: AsyncResolver = {
      name: 'dotenv(.env)',
      async load() {
        return { DATABASE_URL: 'http://localhost' };
      },
    };
    try {
      try {
        await resolveAsync({
          resolvers: [
            [customResolver, {
              DATABASE_URL: url(),
            }],
          ],
          options: {
            enableAudit: true,
          }
        });
      } catch {
        // Expected to throw due to policy violation
      }

      const logs = getAuditLog();
      const policyViolations = logs.filter(l => l.type === 'policy_violation');

      expect(policyViolations.length).toBeGreaterThan(0);
      expect(policyViolations[0].key).toBe('DATABASE_URL');
    } finally {
      process.env.NODE_ENV = originalEnv;
    }
  });

  it('logs validation failures', async () => {

    const customResolver: AsyncResolver = {
      name: 'test',
      async load() {
        return { PORT: 'invalid' };
      },
    };
    try {
      await resolveAsync(
        {
        resolvers: [
          [customResolver, {
            PORT: port(),
          }],
        ],
        options: {
          enableAudit: true,
        }
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

    const customResolver: AsyncResolver = {
      name: 'test',
      async load() {
        return { PORT: 'invalid' };
      },
    };
    for (let i = 0; i < 1100; i++) {
      try {
        await resolveAsync({
          resolvers: [
            [customResolver, {
              PORT: port(),
            }],
          ],
          options: {
            enableAudit: true,
          }
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

      const customResolver: AsyncResolver = {
        name: 'test',
        async load() {
          return { PORT: '3000' };
        },
      };
      await resolveAsync({
        resolvers: [
          [customResolver, {
            PORT: 3000,
          }],
        ],
        // Don't explicitly set enableAudit - test default behavior
      });

      const logs = getAuditLog();
      const allLogs = logs.length;

      expect(allLogs).toBe(0);
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

    const customResolver: AsyncResolver = {
      name: 'process.env',
      async load() {
        return { DATABASE_URL: 'http://localhost', API_KEY: 'key123' };
      },
    };
    try {
      await expect(
        resolveAsync({
          resolvers: [
            [customResolver, {
              DATABASE_URL: url(),
              API_KEY: string(),
            }],
          ],
          options: {
            policies: {
              enforceAllowedSources: {
                DATABASE_URL: ['aws-secrets'],
                API_KEY: ['aws-secrets']
              }
            },
            enableAudit: true,
          }
        })).rejects.toThrow();

      const logs = getAuditLog();
      const policyViolations = logs.filter(l => l.type === 'policy_violation');

      expect(policyViolations.length).toBeGreaterThan(0);
    } finally {
      process.env.NODE_ENV = originalEnv;
    }
  });

  it('enforceAllowedSources - allows variables from correct resolvers', async () => {
    const customResolver: AsyncResolver = {
      name: 'aws-secrets',
      async load() {
        return { DATABASE_URL: 'http://localhost', API_KEY: 'key123' };
      },
    };
    const config = await resolveAsync(
      {
          resolvers: [
            [customResolver, {
              DATABASE_URL: url(),
              API_KEY: string(),
            }],
          ],
          options: {
            policies: {
              enforceAllowedSources: {
                DATABASE_URL: ['aws-secrets'],
                API_KEY: ['aws-secrets']
              }
            },
            enableAudit: true,
          }
        }
      ); 

    expect(config.DATABASE_URL).toBe('http://localhost');
    expect(config.API_KEY).toBe('key123');
  });

  it('allowDotenvInProduction - blocks dotenv by default in production', async () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    const customResolver: AsyncResolver = {
      name: 'dotenv(.env)',
      async load() {
        return { SECRET: 'secret123' };
      },
    };
    try {
      await expect(
        resolveAsync({
          resolvers: [
            [customResolver, {
              SECRET: string(),
            }],
          ],
          options: {
            enableAudit: true,
          }
        })
      ).rejects.toThrow(/cannot be sourced from \.env files in production/);
    } finally {
      process.env.NODE_ENV = originalEnv;
    }
  });

  it('allowDotenvInProduction - allows dotenv when explicitly enabled', async () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    const customResolver: AsyncResolver = {
      name: 'dotenv(.env)',
      async load() {
        return { SECRET: 'secret123' };
      },
    };
    try {      
      const config = await resolveAsync(
          {
          resolvers: [
            [customResolver, {
              SECRET: string(),
            }],
          ],
          options: {
            policies: {
              allowDotenvInProduction: true
            },
            enableAudit: true,
          }
        });

      expect(config.SECRET).toBe('secret123');
    } finally {
      process.env.NODE_ENV = originalEnv;
    }
  });

  it('allowDotenvInProduction - allows specific variables from dotenv', async () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    const customResolver: AsyncResolver = {
      name: 'dotenv(.env)',
      async load() {
        return { ALLOWED_VAR: 'allowed', BLOCKED_VAR: 'blocked' };
      },
    };
    try {
      const config = await resolveAsync(
        {
          resolvers: [
            [customResolver, {
              ALLOWED_VAR: string(),
              BLOCKED_VAR: string(),
            }],
          ],
          options: {
            policies: {
              allowDotenvInProduction: ['ALLOWED_VAR']
            },
            enableAudit: true,
          }
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

describe('Per-Config Audit Tracking', () => {
  beforeEach(() => {
    clearAuditLog();
  });

  it('tracks audit events per config object (async)', async () => {
    const resolver1: AsyncResolver = {
      name: 'resolver1',
      async load() {
        return { VAR1: 'value1' };
      },
    };

    const resolver2: AsyncResolver = {
      name: 'resolver2',
      async load() {
        return { VAR2: 'value2' };
      },
    };

    const config1 = await resolveAsync(
      {
        resolvers: [
          [resolver1, { VAR1: string() }],
        ],
        options: {
          enableAudit: true,
        }
      }
    );

    const config2 = await resolveAsync(
      {
        resolvers: [
          [resolver2, { VAR2: string() }],
        ],
        options: {
          enableAudit: true,
        }
      }
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
    const resolver1: SyncResolver = {
      name: 'resolver1',
      async load() {
        return { VAR1: 'value1' };
      },
      loadSync() {
        return { VAR1: 'value1' };
      },
    };

    const resolver2: SyncResolver = {
      name: 'resolver2',
      async load() {
        return { VAR2: 'value2' };
      },
      loadSync() {
        return { VAR2: 'value2' };
      },
    };

    const config1 = resolve(
      {
        resolvers: [
          [resolver1, { VAR1: string() }],
        ],
        options: {
          enableAudit: true,
        }
      }
    );

    const config2 = resolve(
      {
        resolvers: [
          [resolver2, { VAR2: string() }],
        ],
        options: {
          enableAudit: true,
        }
      }
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

    const customResolver: AsyncResolver = {
      name: 'test',
      async load() {
        return { VAR: 'value' };
      },
    };
    const config = await resolveAsync(
      {
        resolvers: [
          [customResolver, { VAR: string() }],
        ],
        options: {
          enableAudit: false,
        }
      }
    );

    const audit = getAuditLog(config);
    expect(audit).toEqual([]);
  });

  it('handles multiple configs with same variables', async () => {

    const customResolver1: AsyncResolver = {
      name: 'source1',
      async load() {
        return { SHARED: 'from-source1' };
      },
    };
    const customResolver2: AsyncResolver = {
      name: 'source2',
      async load() {
        return { SHARED: 'from-source2' };
      },
    };
    const config1 = await resolveAsync(
      {
        resolvers: [
          [customResolver1, { SHARED: string() }],
        ],
        options: {
          enableAudit: true,
        }
      }
    );

    const config2 = await resolveAsync(
      {
        resolvers: [
          [customResolver2, { SHARED: string() }],
        ],
        options: {
          enableAudit: true,
        }
      }
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

    const customResolver1: AsyncResolver = {
      name: 'test1',
      async load() {
        return { VAR1: 'value1' };
      },
    };
    const customResolver2: AsyncResolver = {
      name: 'test2',
      async load() {
        return { VAR2: 'value2' };
      },
    };
    await resolveAsync(
      {
        resolvers: [
          [customResolver1, { VAR1: string() }],
        ],
        options: {
          enableAudit: true,
        }
      }
    );

    await resolveAsync(
      {
        resolvers: [
          [customResolver2, { VAR2: string() }],
        ],
        options: {
          enableAudit: true,
        }
      }
    );

    // Calling getAuditLog() without config returns all events
    const allLogs = getAuditLog();
    expect(allLogs.some(e => e.key === 'VAR1')).toBe(true);
    expect(allLogs.some(e => e.key === 'VAR2')).toBe(true);
  });
});
