import { describe, it, expect } from 'vitest';
import {
  strictReferencePolicies,
  strictReferenceResolveOptions,
  resolveAsync,
  type AsyncResolver,
} from './index';
import { string } from './validators';

describe('strictReferencePolicies', () => {
  it('creates source-lock policies for sensitive keys with secure defaults', () => {
    const policies = strictReferencePolicies({
      sensitiveKeys: ['STRIPE_KEY', 'DATABASE_URL'],
    });

    expect(policies.allowDotenvInProduction).toBe(false);
    expect(policies.enforceAllowedSources).toEqual({
      STRIPE_KEY: ['aws-secrets'],
      DATABASE_URL: ['aws-secrets'],
    });
  });

  it('merges with base policy and supports multiple allowed sources', () => {
    const policies = strictReferencePolicies({
      sensitiveKeys: ['STRIPE_KEY'],
      secretSources: ['aws-secrets', 'vault'],
      basePolicies: {
        enforceAllowedSources: {
          PORT: ['process.env'],
        },
      },
    });

    expect(policies.enforceAllowedSources).toEqual({
      PORT: ['process.env'],
      STRIPE_KEY: ['aws-secrets', 'vault'],
    });
  });

  it('overwrites existing enforceAllowedSources entries for explicit sensitive keys', () => {
    const policies = strictReferencePolicies({
      sensitiveKeys: ['STRIPE_KEY'],
      secretSources: ['aws-secrets'],
      basePolicies: {
        enforceAllowedSources: {
          STRIPE_KEY: ['vault'],
        },
      },
    });

    expect(policies.enforceAllowedSources).toEqual({
      STRIPE_KEY: ['aws-secrets'],
    });
  });
});

describe('strictReferenceResolveOptions', () => {
  it('builds resolve options with audit enabled by default', () => {
    const options = strictReferenceResolveOptions({
      sensitiveKeys: ['STRIPE_KEY'],
    });

    expect(options.enableAudit).toBe(true);
    expect(options.policies).toEqual({
      allowDotenvInProduction: false,
      enforceAllowedSources: {
        STRIPE_KEY: ['aws-secrets'],
      },
    });
  });

  it('enforces source lock at runtime', async () => {
    const resolver: AsyncResolver = {
      name: 'process.env',
      async load() {
        return { STRIPE_KEY: 'mock_secret_value_for_testing_12345' };
      },
    };

    await expect(
        resolveAsync({
          resolvers: [[resolver, { STRIPE_KEY: string() }]],
          options: strictReferenceResolveOptions({
            sensitiveKeys: ['STRIPE_KEY'],
            secretSources: ['aws-secrets'],
          }),
      }),
    ).rejects.toThrow(/must be sourced from one of: aws-secrets/);
  });

  it('accepts resolver names that include source metadata suffix', async () => {
    const resolver: AsyncResolver = {
      name: 'aws-secrets(prod/app)',
      async load() {
        return { STRIPE_KEY: 'mock_secret_value_for_testing_12345' };
      },
    };

    const config = await resolveAsync({
      resolvers: [[resolver, { STRIPE_KEY: string() }]],
      options: strictReferenceResolveOptions({
        sensitiveKeys: ['STRIPE_KEY'],
      }),
    });

    expect(config.STRIPE_KEY).toBe('mock_secret_value_for_testing_12345');
  });

  it('accepts pointer-in-env values when reference handler resolves via allowed source', async () => {
    const resolver: AsyncResolver = {
      name: 'process.env',
      async load() {
        return { STRIPE_KEY: 'aws-sm://prod/stripe-key' };
      },
    };

    const config = await resolveAsync({
      resolvers: [[resolver, { STRIPE_KEY: string() }]],
      references: {
        handlers: {
          'aws-sm': {
            name: 'aws-sm',
            async resolve() {
              return {
                value: 'mock_secret_value_for_testing_12345',
                resolvedVia: 'aws-secrets',
              };
            },
          },
        },
      },
      options: strictReferenceResolveOptions({
        sensitiveKeys: ['STRIPE_KEY'],
      }),
    });

    expect(config.STRIPE_KEY).toBe('mock_secret_value_for_testing_12345');
  });

  it('rejects pointer-in-env values when resolvedVia is not in allowed sources', async () => {
    const resolver: AsyncResolver = {
      name: 'process.env',
      async load() {
        return { STRIPE_KEY: 'aws-sm://prod/stripe-key' };
      },
    };

    await expect(
      resolveAsync({
        resolvers: [[resolver, { STRIPE_KEY: string() }]],
        references: {
          handlers: {
            'aws-sm': {
              name: 'aws-sm',
              async resolve() {
                return {
                  value: 'mock_secret_value_for_testing_12345',
                  resolvedVia: 'vault',
                };
              },
            },
          },
        },
        options: strictReferenceResolveOptions({
          sensitiveKeys: ['STRIPE_KEY'],
          secretSources: ['aws-secrets'],
        }),
      }),
    ).rejects.toThrow(/must be sourced from one of: aws-secrets/);
  });
});
