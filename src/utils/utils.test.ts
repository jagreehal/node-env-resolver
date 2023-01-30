import { findMissingEntries, resolveEnvValues } from './index';

describe('findMissingEntries', () => {
  it('should return an empty array if all env keys are found', () => {
    const envKeys = ['FOO', 'BAZ'];
    const envsToResolveKeys = ['FOO', 'BAZ'];
    const missingEntries = findMissingEntries(envKeys, envsToResolveKeys);
    expect(missingEntries).toEqual([]);
  });

  it('should return an array of missing env keys if some envs are not found', () => {
    const envKeys = ['FOO', 'BAZ'];
    const envsToResolveKeys = ['FOO', 'MISSING'];
    const missingEntries = findMissingEntries(envKeys, envsToResolveKeys);
    expect(missingEntries).toEqual(['MISSING']);
  });

  it('should return all env keys if none of the envs are found', () => {
    const envKeys = ['FOO', 'BAZ'];
    const envsToResolveKeys = ['MISSING1', 'MISSING2'];
    const missingEntries = findMissingEntries(envKeys, envsToResolveKeys);
    expect(missingEntries).toEqual(['MISSING1', 'MISSING2']);
  });
});

describe('resolveEnvValues', () => {
  const envValues = {
    FOO: 'bar',
    BAZ: 'qux',
  };

  it('should resolve env values correctly with array of env keys', () => {
    const envsToResolve = ['FOO', 'BAZ'];
    const resolvedEnvValues = resolveEnvValues(envValues, envsToResolve, {
      strict: false,
    });
    expect(resolvedEnvValues).toEqual({
      FOO: 'bar',
      BAZ: 'qux',
    });
  });

  it('should resolve env values correctly with object of env keys', () => {
    const envsToResolve = { FOO: '', BAZ: '' };
    const resolvedEnvValues = resolveEnvValues(envValues, envsToResolve, {
      strict: false,
    });
    expect(resolvedEnvValues).toEqual({
      FOO: 'bar',
      BAZ: 'qux',
    });
  });

  it('should throw an error if strict mode is enabled and some envs are missing', () => {
    const envsToResolve = ['FOO', 'MISSING'];
    expect(() => {
      resolveEnvValues(envValues, envsToResolve, { strict: true });
    }).toThrow('Could not find value for the following envs: BAZ');
  });
});
