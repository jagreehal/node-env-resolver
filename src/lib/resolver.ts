import localResolver from '../resolvers/local';
import awsSecretsResolver from '../resolvers/aws-secrets';
import { ResolveProps, ResolverFunction } from '../types';

const resolverLookUp = {
  local: localResolver,
  'aws-secrets': awsSecretsResolver,
};

export async function resolveEnvs(resolveProps: ResolveProps = 'local') {
  const resolverFunctions = mapResolvePropsToResolverFunctions(resolveProps);

  const resolversEnvs = await Promise.all(
    resolverFunctions.map((resolverFunction) => {
      return resolverFunction();
    })
  );

  return resolversEnvs.reduce((envs, resolverEnvs) => {
    return { ...envs, ...resolverEnvs };
  }, {});
}

export function lookUpResolver(name: string) {
  const resolver = resolverLookUp[name];
  if (!resolver) {
    throw new Error(`Resolver function for "${name}" not found.`);
  }
  return resolver;
}

export function mapResolvePropsToResolverFunctions(
  resolveProps: ResolveProps
): ResolverFunction[] {
  if (typeof resolveProps === 'function') {
    return [resolveProps];
  }
  if (typeof resolveProps === 'string') {
    return [lookUpResolver(resolveProps)];
  }

  return resolveProps.map((prop) => {
    if (typeof prop === 'function') {
      return prop;
    }
    if (typeof prop === 'string') {
      return lookUpResolver(prop);
    }
    throw new Error(
      `Expected a resolver function or string, but received: ${prop}`
    );
  });
}
