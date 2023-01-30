import localResolver from '../resolvers/local';
import awsSecretsResolver from '../resolvers/aws-secrets';
import {
  resolveEnvs,
  mapResolvePropsToResolverFunctions,
} from './resolver';

jest.mock('../resolvers/local', () =>
  jest.fn(() => Promise.resolve({ localKey: 'localValue' }))
);
jest.mock('../resolvers/aws-secrets', () =>
  jest.fn(() => Promise.resolve({ awsKey: 'awsValue' }))
);

describe('resolveEnvs', () => {
  it('should return a resolved environment using a single resolver', async () => {
    const resolveProps = 'local';
    const expectedEnvs = { localKey: 'localValue' };

    const envs = await resolveEnvs(resolveProps);

    expect(envs).toEqual(expectedEnvs);
  });

  it('should return a resolved environment using multiple resolvers', async () => {
    const resolveProps = ['local', 'aws-secrets'];
    const expectedEnvs = { localKey: 'localValue', awsKey: 'awsValue' };

    const envs = await resolveEnvs(resolveProps);

    expect(envs).toEqual(expectedEnvs);
  });

  it('should return a resolved environment using a custom resolver', async () => {
    const resolveProps = jest.fn(() =>
      Promise.resolve({ customKey: 'customValue' })
    );
    const expectedEnvs = { customKey: 'customValue' };

    const envs = await resolveEnvs(resolveProps);

    expect(envs).toEqual(expectedEnvs);
  });
});

describe('mapResolvePropsToResolverFunctions', () => {
  it('should return an array of resolver functions from a string resolve prop', () => {
    const resolveProps = 'local';
    const resolverFunctions = mapResolvePropsToResolverFunctions(resolveProps);

    expect(resolverFunctions).toHaveLength(1);
    expect(resolverFunctions[0]).toBe(localResolver);
  });

  it('should return an array of resolver functions from a string resolve prop', () => {
    const resolveProps = 'local';
    const resolverFunctions = mapResolvePropsToResolverFunctions(resolveProps);

    expect(resolverFunctions).toHaveLength(1);
    expect(resolverFunctions[0]).toBe(localResolver);
  });

  it('should return an array of resolver functions from a string array resolve prop', () => {
    const resolveProps = ['local', 'aws-secrets'];
    const resolverFunctions = mapResolvePropsToResolverFunctions(resolveProps);

    expect(resolverFunctions).toHaveLength(2);
    expect(resolverFunctions[0]).toBe(localResolver);
    expect(resolverFunctions[1]).toBe(awsSecretsResolver);
  });
});
