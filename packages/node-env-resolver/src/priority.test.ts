/**
 * Tests for priority option in resolve()
 * Controls merge behavior when multiple resolvers provide the same variable
 */

import { describe, it, expect } from 'vitest';
import { resolveAsync, safeResolveAsync } from './index';
import { string, postgres, number, boolean } from './resolvers';
import type { Resolver } from './types';

// Helper to create mock resolvers
function createResolver(name: string, env: Record<string, string>): Resolver {
  return {
    name,
    async load() {
      return env;
    },
    loadSync() {
      return env;
    }
  };
}

describe('Priority option - async resolve()', () => {
  it('priority: "last" (default) - later resolvers override earlier ones', async () => {
    const resolver1 = createResolver('local', {
      DATABASE_URL: 'postgres://local:5432/db',
      PORT: '8080'
    });

    const resolver2 = createResolver('aws', {
      DATABASE_URL: 'postgres://aws:5432/db',
      API_KEY: 'secret123'
    });

    const config = await resolveAsync({
      resolvers: [
        [resolver1, { DATABASE_URL: postgres(), PORT: number() }],
        [resolver2, { DATABASE_URL: postgres(), API_KEY: string() }],
      ],
      options: { priority: 'last' }
    });
    expect(config.DATABASE_URL).toBe('postgres://aws:5432/db'); // AWS wins
    expect(config.PORT).toBe(8080); // Only in resolver1
    expect(config.API_KEY).toBe('secret123'); // Only in resolver2
  });

  it('priority: "last" - explicit setting behaves same as default', async () => {
    const resolver1 = createResolver('first', { VAR: 'first-value' });
    const resolver2 = createResolver('second', { VAR: 'second-value' });

    const config = await resolveAsync({
      resolvers: [
        [resolver1, { VAR: string() }],
        [resolver2, { VAR: string() }],
      ],
      options: { priority: 'last' }
    });
    expect(config.VAR).toBe('second-value'); // Last wins
  });

  it('priority: "first" - earlier resolvers take precedence', async () => {
    const resolver1 = createResolver('local', {
      DATABASE_URL: 'postgres://local:5432/db',
      PORT: '8080'
    });

    const resolver2 = createResolver('aws', {
      DATABASE_URL: 'postgres://aws:5432/db', // Won't override local
      API_KEY: 'secret123'
    });

    const config = await resolveAsync({
      resolvers: [
        [resolver1, { DATABASE_URL: postgres(), PORT: number() }],
        [resolver2, { DATABASE_URL: postgres(), API_KEY: string() }],
      ],
      options: { priority: 'first' }
    });

    expect(config.DATABASE_URL).toBe('postgres://local:5432/db'); // Local wins
    expect(config.PORT).toBe(8080); // Only in resolver1
    expect(config.API_KEY).toBe('secret123'); // Only in resolver2
  });

  it('priority: "first" - does not overwrite already-defined values', async () => {
    const resolver1 = createResolver('first', {
      PREFIX: 'dev-',
      SUFFIX: 'first-value'
    });

    const resolver2 = createResolver('second', {
      PREFIX: 'prod-', // Won't override
      SUFFIX: 'second-value' // Won't override
    });

    const config = await resolveAsync({
      resolvers: [
        [resolver1, { PREFIX: string(), SUFFIX: string() }],
        [resolver2, { PREFIX: string(), SUFFIX: string() }],
      ],
      options: { priority: 'first' }
    });

    expect(config.PREFIX).toBe('dev-'); // First value not overwritten
    expect(config.SUFFIX).toBe('first-value'); // First value not overwritten
  });

  it('priority: "first" - later resolvers still set undefined values', async () => {
    const resolver1 = createResolver('first', {
      VAR1: 'first-value'
      // VAR2 not provided
    });

    const resolver2 = createResolver('second', {
      VAR1: 'second-value', // Won't override
      VAR2: 'second-value' // Will set (VAR2 was undefined)
    });

      const config = await resolveAsync({
      resolvers: [
        [resolver1, { VAR1: string(), VAR2: string() }], 
        [resolver2, { VAR1: string(), VAR2: string() }],
      ],
      options: { priority: 'first' }
    });

    expect(config.VAR1).toBe('first-value'); // First set, skip second
    expect(config.VAR2).toBe('second-value'); // First didn't set, second sets
  });

  it('priority: "first" - multiple resolvers chain correctly', async () => {
    const resolver1 = createResolver('first', { A: 'A1' });
    const resolver2 = createResolver('second', { B: 'B2' });
    const resolver3 = createResolver('third', { A: 'A3', B: 'B3', C: 'C3' });

    const config = await resolveAsync({
      resolvers: [
        [resolver1, { A: string() }],
        [resolver2, { B: string() }],
        [resolver3, { A: string(), B: string(), C: string() }],
      ],
      options: { priority: 'first' }
    });

    expect(config.A).toBe('A1'); // First resolver wins
    expect(config.B).toBe('B2'); // Second resolver wins (first didn't provide)
    expect(config.C).toBe('C3'); // Third resolver (only one providing C)
  });
});

describe('Priority option - safeResolve()', () => {
  it('priority: "last" works with saferesolveAsync()', async () => {
    const resolver1 = createResolver('first', { VAR: 'first' });
    const resolver2 = createResolver('second', { VAR: 'second' });

    const result = await safeResolveAsync({
      resolvers: [
        [resolver1, { VAR: string() }],
        [resolver2, { VAR: string() }],
      ],
      options: { priority: 'last' }
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.VAR).toBe('second');
    }
  });

  it('priority: "first" works with saferesolveAsync()', async () => {
    const resolver1 = createResolver('first', { VAR: 'first' });
    const resolver2 = createResolver('second', { VAR: 'second' });

    const result = await safeResolveAsync({
      resolvers: [
        [resolver1, { VAR: string() }],
        [resolver2, { VAR: string() }],
      ],
      options: { priority: 'first' }
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.VAR).toBe('first');
    }
  });
});

describe('Priority option - sync resolveAsync()', () => {
  it('priority: "last" (default) works with resolveAsync()', async () => {
    const resolver1 = createResolver('first', { VAR: 'first' });
    const resolver2 = createResolver('second', { VAR: 'second' });

    const config = await resolveAsync({
      resolvers: [
        [resolver1, { VAR: string() }],
        [resolver2, { VAR: string() }],
      ],
      options: { priority: 'last' }
    });

    expect(config.VAR).toBe('second');
  });

  it('priority: "first" works with resolveAsync()', async () => {
    const resolver1 = createResolver('first', { VAR: 'first' });
    const resolver2 = createResolver('second', { VAR: 'second' });

    const config = await resolveAsync({
      resolvers: [
        [resolver1, { VAR: string() }],
        [resolver2, { VAR: string() }],
      ],
      options: { priority: 'first' }
    });

    expect(config.VAR).toBe('first');
  });
});

describe('Priority option - sync saferesolveAsync()', () => {
  it('priority: "last" works with saferesolveAsync()', async () => {
    const resolver1 = createResolver('first', { VAR: 'first' });
    const resolver2 = createResolver('second', { VAR: 'second' });

    const result = await safeResolveAsync({
      resolvers: [
        [resolver1, { VAR: string() }],
        [resolver2, { VAR: string() }],
      ],
      options: { priority: 'last' }
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.VAR).toBe('second');
    }
  });

  it('priority: "first" works with saferesolveAsync()', async () => {
    const resolver1 = createResolver('first', { VAR: 'first' });
    const resolver2 = createResolver('second', { VAR: 'second' });

    const result = await safeResolveAsync({
      resolvers: [
        [resolver1, { VAR: string() }],
        [resolver2, { VAR: string() }],
      ],
      options: { priority: 'first' }
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.VAR).toBe('first');
    }
  });
});

describe('Priority option - real-world use cases', () => {
  it('use case: local .env overrides AWS secrets for development', async () => {
    const dotenvResolver = createResolver('dotenv(.env)', {
      DATABASE_URL: 'postgres://localhost:5432/dev',
      DEBUG: 'true' // Local override
    });

    const awsResolver = createResolver('aws-secrets', {
      DATABASE_URL: 'postgres://prod-db:5432/app',
      API_KEY: 'prod-secret-key',
      DEBUG: 'false'
    });

    const config = await resolveAsync({
      resolvers: [
        [dotenvResolver, { DATABASE_URL: postgres(), DEBUG: boolean() }],
        [awsResolver, { DATABASE_URL: postgres(), API_KEY: string(), DEBUG: boolean() }],
      ],
      options: { priority: 'first', policies: { allowDotenvInProduction: true } }
    });

    expect(config.DATABASE_URL).toBe('postgres://localhost:5432/dev'); // Local wins
    expect(config.DEBUG).toBe(true); // Local debug wins
    expect(config.API_KEY).toBe('prod-secret-key'); // From AWS (not in local)
  });

  it('use case: production secrets override process.env (default)', async () => {
    const processEnvResolver = createResolver('process.env', {
      DATABASE_URL: 'postgres://default:5432/app',
      PORT: '8080'
    });

    const awsResolver = createResolver('aws-secrets', {
      DATABASE_URL: 'postgres://secure-prod:5432/app', // Should override
      API_KEY: 'secure-key'
    });

    const config = await resolveAsync({
      resolvers: [
        [processEnvResolver, { DATABASE_URL: postgres(), PORT: number() }],
        [awsResolver, { DATABASE_URL: postgres(), API_KEY: string() }],
      ],
      options: { priority: 'last' }
    });

    expect(config.DATABASE_URL).toBe('postgres://secure-prod:5432/app'); // AWS wins
    expect(config.PORT).toBe(8080); // From process.env (not in AWS)
    expect(config.API_KEY).toBe('secure-key'); // From AWS
  });

  it('use case: fallback chain - try multiple sources until one provides value', async () => {
    const processEnvResolver = createResolver('process.env', {
      PORT: '8080'
      // No DATABASE_URL
    });

    const dotenvResolver = createResolver('dotenv', {
      DATABASE_URL: 'postgres://from-dotenv:5432/db'
      // No API_KEY
    });

    const awsResolver = createResolver('aws-secrets', {
      API_KEY: 'from-aws'
      // No DATABASE_URL or PORT
    });

    const config = await resolveAsync({
      resolvers: [
        [processEnvResolver, { PORT: number(), DATABASE_URL: postgres(), API_KEY: string() }],
        [dotenvResolver, { PORT: number(), DATABASE_URL: postgres(), API_KEY: string() }],
        [awsResolver, { PORT: number(), DATABASE_URL: postgres(), API_KEY: string() }],
      ],
      options: { priority: 'first' }
    });

    expect(config.PORT).toBe(8080); // From process.env (first)
    expect(config.DATABASE_URL).toBe('postgres://from-dotenv:5432/db'); // From dotenv (second)
    expect(config.API_KEY).toBe('from-aws'); // From AWS (third)
  });
});
