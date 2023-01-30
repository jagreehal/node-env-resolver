import { z } from 'zod';
import { resolveEnvs } from './lib/resolver';
import { ResolveProps } from './types';

export * from './types';
export * from './resolvers/aws-secrets';

export async function resolveZod<T>(
  schema: z.ZodSchema<T>,
  resolveProps: ResolveProps = 'local'
): Promise<T> {
  const envValues = await resolveEnvs(resolveProps);
  return schema.parse(envValues);
}
