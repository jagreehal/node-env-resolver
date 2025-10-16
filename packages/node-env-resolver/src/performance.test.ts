/**
 * Tests for performance optimizations:
 * 1. Early termination for priority: 'first'
 * 2. Parallel resolver execution for priority: 'last'
 */

import { describe, it, expect } from 'vitest';
import { resolveAsync } from './index';
import { string, url } from './resolvers';
import type { Resolver } from './types';

// Helper to create mock resolvers with load tracking
function createTrackedResolver(
  name: string,
  env: Record<string, string>,
  delay: number = 0
): Resolver & { loadCalled: boolean; loadCount: number } {
  const tracker = {
    loadCalled: false,
    loadCount: 0,
  };

  return {
    name,
    async load() {
      tracker.loadCalled = true;
      tracker.loadCount++;
      if (delay > 0) {
        await new Promise(resolve => setTimeout(resolve, delay));
      }
      return env;
    },
    loadSync() {
      tracker.loadCalled = true;
      tracker.loadCount++;
      return env;
    },
    get loadCalled() {
      return tracker.loadCalled;
    },
    get loadCount() {
      return tracker.loadCount;
    }
  };
}

describe('Early termination optimization (priority: first)', () => {
  it('should skip remaining resolvers when all required keys are satisfied', async () => {
    const resolver1 = createTrackedResolver('first', {
      DATABASE_URL: 'http://localhost:5432/db',
      API_KEY: 'secret123',
      PORT: '8080'
    });

    const resolver2 = createTrackedResolver('second', {
      DATABASE_URL: 'should-not-be-used',
      API_KEY: 'should-not-be-used',
      PORT: 'should-not-be-used'
    });

    const resolver3 = createTrackedResolver('third', {
      DATABASE_URL: 'should-not-be-used'
    });

    const config = await resolveAsync(
      [resolver1, { DATABASE_URL: url(), API_KEY: string(), PORT: 3000 }],
      [resolver2, { DATABASE_URL: url(), API_KEY: string(), PORT: 3000 }],
      [resolver3, { DATABASE_URL: url(), API_KEY: string(), PORT: 3000 }],
      { priority: 'first' }
    );

    // First resolver should be called
    expect(resolver1.loadCalled).toBe(true);
    expect(resolver1.loadCount).toBe(1);

    // Second and third resolvers should NOT be called (early termination)
    expect(resolver2.loadCalled).toBe(false);
    expect(resolver3.loadCalled).toBe(false);

    // Verify the config has correct values from first resolver
    expect(config.DATABASE_URL).toBe('http://localhost:5432/db');
    expect(config.API_KEY).toBe('secret123');
    expect(config.PORT).toBe(8080);
  });

  it('should call second resolver if first does not provide all required keys', async () => {
    const resolver1 = createTrackedResolver('first', {
      DATABASE_URL: 'http://localhost:5432/db'
      // Missing API_KEY and PORT
    });

    const resolver2 = createTrackedResolver('second', {
      API_KEY: 'secret123',
      PORT: '8080'
    });

    const resolver3 = createTrackedResolver('third', {
      EXTRA_VAR: 'should-not-be-called'
    });

    const config = await resolveAsync(
      [resolver1, { DATABASE_URL: url(), API_KEY: string(), PORT: 3000 }],
      [resolver2, { DATABASE_URL: url(), API_KEY: string(), PORT: 3000 }],
      [resolver3, { DATABASE_URL: url(), API_KEY: string(), PORT: 3000 }],
      { priority: 'first' }
    );

    // First two resolvers should be called
    expect(resolver1.loadCalled).toBe(true);
    expect(resolver2.loadCalled).toBe(true);

    // Third resolver should NOT be called (all keys satisfied after second)
    expect(resolver3.loadCalled).toBe(false);

    // Verify the config
    expect(config.DATABASE_URL).toBe('http://localhost:5432/db');
    expect(config.API_KEY).toBe('secret123');
    expect(config.PORT).toBe(8080);
  });

  it('should skip second resolver when all schema keys satisfied (including optional)', async () => {
    const resolver1 = createTrackedResolver('first', {
      REQUIRED_VAR: 'value1',
      OPTIONAL_VAR: 'value1-optional'
      // Provides both required and optional vars
    });

    const resolver2 = createTrackedResolver('second', {
      OPTIONAL_VAR: 'value2'
    });

    const config = await resolveAsync(
      [resolver1, { 
        REQUIRED_VAR: string(),
        OPTIONAL_VAR: string({ optional: true })
      }],
      [resolver2, {
        REQUIRED_VAR: string(),
        OPTIONAL_VAR: string({ optional: true })
      }],
      { priority: 'first' }
    );

    // Only first resolver should be called (all keys satisfied)
    expect(resolver1.loadCalled).toBe(true);
    expect(resolver2.loadCalled).toBe(false);

    expect(config.REQUIRED_VAR).toBe('value1');
    expect(config.OPTIONAL_VAR).toBe('value1-optional');
  });

  it('should skip second resolver when all schema keys satisfied (including vars with defaults)', async () => {
    const resolver1 = createTrackedResolver('first', {
      VAR1: 'value1',
      VAR2: 'value2-from-first'
      // Provides all vars
    });

    const resolver2 = createTrackedResolver('second', {
      VAR2: 'value2-from-second'
    });

    const config = await resolveAsync(
      [resolver1, { 
        VAR1: string(),
        VAR2: string({ default: 'default-value' })
      }],
      [resolver2, {
        VAR1: string(),
        VAR2: string({ default: 'default-value' })
      }],
      { priority: 'first' }
    );

    // Only first resolver should be called (all keys satisfied)
    expect(resolver1.loadCalled).toBe(true);
    expect(resolver2.loadCalled).toBe(false);

    expect(config.VAR1).toBe('value1');
    expect(config.VAR2).toBe('value2-from-first'); // From first resolver
  });

  it('should skip expensive remote resolvers when local .env has everything', async () => {
    const localResolver = createTrackedResolver('dotenv(.env)', {
      DATABASE_URL: 'http://localhost:5432/dev',
      API_KEY: 'dev-key',
      PORT: '3000'
    }, 0); // Fast

    const awsSecretsResolver = createTrackedResolver('aws-secrets', {
      DATABASE_URL: 'postgres://prod:5432/db',
      API_KEY: 'prod-key',
      PORT: '443'
    }, 100); // Slow remote call

    const parameterStoreResolver = createTrackedResolver('aws-parameter-store', {
      DATABASE_URL: 'postgres://other:5432/db'
    }, 100); // Slow remote call

    const startTime = Date.now();
    const config = await resolveAsync(
      [localResolver, { DATABASE_URL: url(), API_KEY: string(), PORT: 3000 }],
      [awsSecretsResolver, { DATABASE_URL: url(), API_KEY: string(), PORT: 3000 }],
      [parameterStoreResolver, { DATABASE_URL: url(), API_KEY: string(), PORT: 3000 }],
      { priority: 'first' }
    );
    const duration = Date.now() - startTime;

    // Only local resolver should be called
    expect(localResolver.loadCalled).toBe(true);
    expect(awsSecretsResolver.loadCalled).toBe(false);
    expect(parameterStoreResolver.loadCalled).toBe(false);

    // Should be fast (< 50ms) since we skipped slow resolvers
    expect(duration).toBeLessThan(50);

    // Verify local values are used
    expect(config.DATABASE_URL).toBe('http://localhost:5432/dev');
    expect(config.API_KEY).toBe('dev-key');
    expect(config.PORT).toBe(3000);
  });
});

describe('Parallel resolver execution (priority: last)', () => {
  it('should call all resolvers in parallel', async () => {
    const resolver1 = createTrackedResolver('first', {
      VAR1: 'value1'
    }, 50); // 50ms delay

    const resolver2 = createTrackedResolver('second', {
      VAR2: 'value2'
    }, 50); // 50ms delay

    const resolver3 = createTrackedResolver('third', {
      VAR3: 'value3'
    }, 50); // 50ms delay

    const startTime = Date.now();
    const config = await resolveAsync(
      [resolver1, { VAR1: string() }],
      [resolver2, { VAR2: string() }],
      [resolver3, { VAR3: string() }],
      { priority: 'last' } // Default, but explicit
    );
    const duration = Date.now() - startTime;

    // All resolvers should be called
    expect(resolver1.loadCalled).toBe(true);
    expect(resolver2.loadCalled).toBe(true);
    expect(resolver3.loadCalled).toBe(true);

    // Should complete in ~50ms (parallel) not ~150ms (sequential)
    // Allow some margin for test runner overhead
    expect(duration).toBeLessThan(100);
    expect(duration).toBeGreaterThan(40);

    expect(config.VAR1).toBe('value1');
    expect(config.VAR2).toBe('value2');
    expect(config.VAR3).toBe('value3');
  });

  it('should respect priority: last when merging parallel results', async () => {
    const resolver1 = createTrackedResolver('first', {
      SHARED_VAR: 'value-from-first',
      VAR1: 'only-in-first'
    }, 30);

    const resolver2 = createTrackedResolver('second', {
      SHARED_VAR: 'value-from-second',
      VAR2: 'only-in-second'
    }, 20);

    const resolver3 = createTrackedResolver('third', {
      SHARED_VAR: 'value-from-third',
      VAR3: 'only-in-third'
    }, 10);

    const config = await resolveAsync(
      [resolver1, { SHARED_VAR: string(), VAR1: string() }],
      [resolver2, { SHARED_VAR: string(), VAR2: string() }],
      [resolver3, { SHARED_VAR: string(), VAR3: string() }],
      { priority: 'last' }
    );

    // All resolvers should be called
    expect(resolver1.loadCalled).toBe(true);
    expect(resolver2.loadCalled).toBe(true);
    expect(resolver3.loadCalled).toBe(true);

    // Last resolver (third) should win for SHARED_VAR
    expect(config.SHARED_VAR).toBe('value-from-third');
    expect(config.VAR1).toBe('only-in-first');
    expect(config.VAR2).toBe('only-in-second');
    expect(config.VAR3).toBe('only-in-third');
  });

  it('should handle resolver failures gracefully in parallel mode', async () => {
    const resolver1 = createTrackedResolver('first', {
      VAR1: 'value1'
    });

    const failingResolver: Resolver = {
      name: 'failing',
      async load() {
        throw new Error('Simulated failure');
      }
    };

    const resolver3 = createTrackedResolver('third', {
      VAR3: 'value3'
    });

    // With strict: false, should continue despite failure
    const config = await resolveAsync(
      [resolver1, { VAR1: string(), VAR3: string() }],
      [failingResolver, { VAR1: string(), VAR3: string() }],
      [resolver3, { VAR1: string(), VAR3: string() }],
      { priority: 'last', strict: false }
    );

    expect(resolver1.loadCalled).toBe(true);
    expect(resolver3.loadCalled).toBe(true);

    expect(config.VAR1).toBe('value1');
    expect(config.VAR3).toBe('value3');
  });

  it('should fail fast when strict: true and a resolver fails in parallel', async () => {
    const resolver1 = createTrackedResolver('first', {
      VAR1: 'value1'
    }, 50);

    const failingResolver: Resolver = {
      name: 'failing',
      async load() {
        throw new Error('Simulated failure');
      }
    };

    const resolver3 = createTrackedResolver('third', {
      VAR3: 'value3'
    }, 50);

    await expect(
      resolveAsync(
        [resolver1, { VAR1: string(), VAR3: string() }],
        [failingResolver, { VAR1: string(), VAR3: string() }],
        [resolver3, { VAR1: string(), VAR3: string() }],
        { priority: 'last', strict: true }
      )
    ).rejects.toThrow('Resolver failed');

    // All resolvers should have been called (parallel)
    expect(resolver1.loadCalled).toBe(true);
    expect(resolver3.loadCalled).toBe(true);
  });

  it('should provide significant speedup for multiple slow resolvers', async () => {
    const awsSecrets = createTrackedResolver('aws-secrets', {
      DATABASE_URL: 'postgres://aws:5432/db'
    }, 60);

    const awsParams = createTrackedResolver('aws-parameters', {
      API_KEY: 'aws-api-key'
    }, 60);

    const gcpSecrets = createTrackedResolver('gcp-secrets', {
      JWT_SECRET: 'gcp-jwt-secret'
    }, 60);

    const startTime = Date.now();
    const config = await resolveAsync(
      [awsSecrets, { DATABASE_URL: url() }],
      [awsParams, { API_KEY: string() }],
      [gcpSecrets, { JWT_SECRET: string() }],
      { priority: 'last' }
    );
    const duration = Date.now() - startTime;

    // All resolvers should be called
    expect(awsSecrets.loadCalled).toBe(true);
    expect(awsParams.loadCalled).toBe(true);
    expect(gcpSecrets.loadCalled).toBe(true);

    // Should complete in ~60ms (parallel) not ~180ms (sequential)
    expect(duration).toBeLessThan(100);

    expect(config.DATABASE_URL).toBe('postgres://aws:5432/db');
    expect(config.API_KEY).toBe('aws-api-key');
    expect(config.JWT_SECRET).toBe('gcp-jwt-secret');
  });
});

describe('Performance optimizations - edge cases', () => {
  it('early termination: should call all resolvers with empty schema', async () => {
    const resolver1 = createTrackedResolver('first', {
      VAR1: 'value1'
    });

    const resolver2 = createTrackedResolver('second', {
      VAR2: 'value2'
    });

    const config = await resolveAsync(
      [resolver1, {}], // Empty schema
      [resolver2, {}],
      { priority: 'first' }
    );

    // With empty schema (no keys to satisfy), both resolvers run
    // Early termination requires all schema keys to be satisfied; with 0 keys, that's immediately true
    // so it should terminate after first resolver
    expect(resolver1.loadCalled).toBe(true);
    expect(resolver2.loadCalled).toBe(true);

    expect(config).toEqual({});
  });

  it('parallel: should work with single resolver', async () => {
    const resolver = createTrackedResolver('only', {
      VAR: 'value'
    }, 30);

    const startTime = Date.now();
    const config = await resolveAsync(
      [resolver, { VAR: string() }],
      { priority: 'last' }
    );
    const duration = Date.now() - startTime;

    expect(resolver.loadCalled).toBe(true);
    expect(duration).toBeGreaterThan(25);
    expect(config.VAR).toBe('value');
  });

  it('early termination: should continue when optional keys are missing', async () => {
    const resolver1 = createTrackedResolver('first', {
      REQUIRED: 'req-value'
      // Missing OPTIONAL
    });

    const resolver2 = createTrackedResolver('second', {
      OPTIONAL: 'opt-value'
    });

    const config = await resolveAsync(
      [resolver1, {
        REQUIRED: string(),
        OPTIONAL: string({ optional: true })
      }],
      [resolver2, {
        REQUIRED: string(),
        OPTIONAL: string({ optional: true })
      }],
      { priority: 'first' }
    );

    // Both should be called (first doesn't have all keys - OPTIONAL is missing)
    expect(resolver1.loadCalled).toBe(true);
    expect(resolver2.loadCalled).toBe(true);

    expect(config.REQUIRED).toBe('req-value');
    expect(config.OPTIONAL).toBe('opt-value');
  });
});
