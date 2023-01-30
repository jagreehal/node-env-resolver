import { resolveEnvs } from './lib/resolver';
import {
  EnvsToResolve,
  EnvValues,
  ResolveOptions,
  ResolveProps,
} from './types';
import { resolveEnvValues } from './utils';

export * from './types';
export * from './resolvers/aws-secrets';

export async function resolve(
  envsToResolve: EnvsToResolve,
  resolveProps: ResolveProps = 'local',
  resolveOptions: ResolveOptions = { strict: true }
): Promise<EnvValues> {
  const envValues = await resolveEnvs(resolveProps);
  return resolveEnvValues(envValues, envsToResolve, resolveOptions);
}
