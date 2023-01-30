export interface ResolverFunction {
  (): Promise<EnvValues>;
}

export type EnvValues = { [key: string]: string | undefined };

export type ResolveOptions = {
  strict?: boolean;
};

export type EnvsToResolve = string[] | EnvValues;

export type ResolveProps =
  | string
  | ResolverFunction
  | (string | ResolverFunction)[];
