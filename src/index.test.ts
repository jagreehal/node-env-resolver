import * as resolver from './lib/resolver';
import { resolve, resolveZod } from './index';
import { z } from 'zod';

describe('resolve', () => {
  const mockEnvValues = {
    KEY1: 'value1',
    KEY2: 'value2',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(resolver, 'resolveEnvs').mockImplementation(() => {
      return Promise.resolve(mockEnvValues);
    });
  });

  it('should call resolveEnvs and resolveEnvValues', async () => {
    const envsToResolve = ['KEY1'];
    const resolveOptions = { strict: false };
    const resolvedEnvs = await resolve(envsToResolve, 'local', resolveOptions);
    expect(resolvedEnvs).toEqual({ KEY1: 'value1' });
    expect(resolver.resolveEnvs).toHaveBeenCalledWith('local');
  });

  it('should resolve envs with default options if options are not provided', async () => {
    const envsToResolve = ['KEY1'];
    const resolvedEnvs = await resolve(envsToResolve, 'local', {
      strict: false,
    });
    expect(resolvedEnvs).toEqual({ KEY1: 'value1' });
    expect(resolver.resolveEnvs).toHaveBeenCalledWith('local');
  });

  it('should throw Error in strict mode', async () => {
    const envsToResolve = ['KEY1'];
    expect(() => resolve(envsToResolve, 'local')).rejects.toThrow(
      'Could not find value for the following envs: KEY2'
    );
  });
});

describe('resolveZod', () => {
  const mockEnvValues = {
    KEY1: 'value1',
    KEY2: 'value2',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(resolver, 'resolveEnvs').mockImplementation(() => {
      return Promise.resolve(mockEnvValues);
    });
  });

  it('should call resolveEnvs and parse the resolved env values with the provided schema', async () => {
    const schema = z.object({
      KEY1: z.string(),
      KEY2: z.string(),
    });

    const resolvedEnvs = await resolveZod(schema, 'local');
    expect(resolvedEnvs).toEqual({ KEY1: 'value1', KEY2: 'value2' });
    expect(resolver.resolveEnvs).toHaveBeenCalledWith('local');
  });
});
