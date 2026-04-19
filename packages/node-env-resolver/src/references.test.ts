import { afterEach, describe, expect, it } from 'vitest';
import { resolve, resolveAsync } from './index';
import { postgres, string } from './validators';

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
});

function mockResolver(env: Record<string, string>, name = 'mock') {
  return {
    name,
    async load() {
      return env;
    },
    loadSync() {
      return env;
    },
  };
}

describe('reference handlers', () => {
  it('resolves process-env references without custom handlers', () => {
    process.env.API_KEY = 'from-process-env';
    process.env.OPENAI_API_KEY = 'process-env://API_KEY';

    const config = resolve(
      {
        OPENAI_API_KEY: string(),
      },
    );

    expect(config.OPENAI_API_KEY).toBe('from-process-env');
  });

  it('dereferences process.env values via resolve(schema, options)', () => {
    process.env.JWT_SECRET = 'aws-sm://prod/app/jwt_secret';

    const config = resolve(
      {
        JWT_SECRET: string(),
      },
      {
        references: {
          handlers: {
            'aws-sm': {
              name: 'awsSecrets',
              resolve: () => 'resolved-jwt-secret',
              resolveSync: () => 'resolved-jwt-secret',
            },
          },
        },
      },
    );

    expect(config.JWT_SECRET).toBe('resolved-jwt-secret');
  });

  it('supports top-level config.references in async resolve and only dereferences registered schemes', async () => {
    const config = await resolveAsync({
      resolvers: [
        [
          mockResolver(
            {
              DATABASE_URL: 'aws-sm://prod/app/database_url',
              PUBLIC_URL: 'https://example.com',
            },
            'dotenv(.env)',
          ),
          {
            DATABASE_URL: postgres(),
            PUBLIC_URL: string(),
          },
        ],
      ],
      references: {
        handlers: {
          'aws-sm': {
            name: 'awsSecrets',
            async resolve(reference) {
              expect(reference).toBe('aws-sm://prod/app/database_url');
              return 'postgres://user:pass@db.example.com/app';
            },
            resolveSync() {
              return 'postgres://user:pass@db.example.com/app';
            },
          },
        },
      },
    });

    expect(config.DATABASE_URL).toBe('postgres://user:pass@db.example.com/app');
    expect(config.PUBLIC_URL).toBe('https://example.com');
  });

  it('includes reference metadata in debug entries after dereferencing', async () => {
    const entries: Array<Record<string, unknown>> = [];
    let seenContextSource: string | null = null;

    await resolveAsync({
      resolvers: [
        [
          mockResolver(
            {
              DATABASE_URL: 'aws-sm://prod/app/database_url',
            },
            'dotenv(.env)',
          ),
          {
            DATABASE_URL: postgres(),
          },
        ],
      ],
      references: {
        handlers: {
          'aws-sm': {
            name: 'awsSecrets',
            async resolve(_reference, context) {
              seenContextSource = context.source;
              return {
                value: 'postgres://user:pass@db.example.com/app',
                metadata: { region: 'eu-west-1' },
              };
            },
            resolveSync() {
              return 'postgres://user:pass@db.example.com/app';
            },
          },
        },
      },
      options: {
        debug: {
          enabled: true,
          valueMode: 'fingerprint',
          onDebugEntry(entry) {
            entries.push(entry as unknown as Record<string, unknown>);
          },
        },
      },
    });

    expect(seenContextSource).toBe('dotenv(.env)');
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      key: 'DATABASE_URL',
      source: 'dotenv(.env)',
      reference: 'aws-sm://prod/app/database_url',
      resolvedVia: 'awsSecrets',
    });
    expect(entries[0]?.fingerprint).toMatch(/^sha256:/);
  });

  it('rejects sync resolution when a reference handler is async-only', () => {
    expect(() =>
      resolve({
        resolvers: [
          [
            mockResolver(
              { DATABASE_URL: 'aws-sm://prod/app/database_url' },
              'dotenv(.env)',
            ),
            { DATABASE_URL: string() },
          ],
        ],
        references: {
          handlers: {
            'aws-sm': {
              async resolve() {
                return 'postgres://user:pass@db.example.com/app';
              },
            },
          },
        },
      }),
    ).toThrow(/does not support synchronous resolution/);
  });

  it('can keep unresolved references when explicitly configured', async () => {
    const config = await resolveAsync({
      resolvers: [
        [
          mockResolver(
            {
              API_KEY: 'vault://kv/prod/api_key',
            },
            'dotenv(.env)',
          ),
          {
            API_KEY: string(),
          },
        ],
      ],
      references: {
        onUnresolved: 'ignore',
        handlers: {
          vault: {
            name: 'vault',
            async resolve() {
              throw new Error('not found');
            },
            resolveSync() {
              throw new Error('not found');
            },
          },
        },
      },
    });

    expect(config.API_KEY).toBe('vault://kv/prod/api_key');
  });
});
