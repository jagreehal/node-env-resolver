import {
  EnvsToResolve,
  EnvValues as EnvValues,
  ResolveOptions,
} from '../types';

export function findMissingEntries(
  envKeys: string[],
  envsToResolveKeys: string[]
): string[] {
  const intersect = envsToResolveKeys.filter((entry) =>
    envKeys.includes(entry)
  );
  return envsToResolveKeys.filter((entry) => !intersect.includes(entry));
}

export function resolveEnvValues(
  envValues: EnvValues,
  envsToResolve: EnvsToResolve,
  resolveOptions: ResolveOptions
): EnvValues {
  const envKeys = Array.isArray(envsToResolve)
    ? envsToResolve
    : Object.keys(envsToResolve);

  if (resolveOptions?.strict) {
    const missingEntries = findMissingEntries(envKeys, Object.keys(envValues));
    if (missingEntries.length) {
      const error = `Could not find value for the following envs: ${missingEntries.join(
        ', '
      )}`;
      throw new Error(error);
    }
  }

  return envKeys.reduce((env: EnvValues, key) => {
    env[key] = envValues[key];
    return env;
  }, Object.create(null));
}
