import { EnvValues } from '../../types';

export default async function configResolver(): Promise<EnvValues> {
  return Promise.resolve(process.env);
}
