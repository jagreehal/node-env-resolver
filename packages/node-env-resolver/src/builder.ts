/**
 * EnvBuilder - Fluent API for composing environment variables from multiple resolvers
 *
 * @example
 * ```typescript
 * const config = await env({
 *   FOO: 'string',
 *   BAR: 3000,
 * })
 *   .from(customResolver, {
 *     QUZ: 'string',
 *   })
 *   .resolve();
 * ```
 */

import type {
  Resolver,
  SimpleEnvSchema,
  EnvSchema,
  InferSimpleSchema,
  ResolveOptions,
} from './types.js';import { normalizeSchema, resolveEnvInternal, resolveEnvInternalSync } from './resolver';import { dotenv, processEnv } from './resolvers';
// Type utility: Merge two schemas (last-wins)
export type MergeSchemas<T, U> = Omit<T, keyof U> & U;

/**
 * Resolver with associated schema for type tracking
 */
interface ResolverLayer<T extends SimpleEnvSchema> {
  resolver: Resolver;
  schema: T;
}

/**
 * EnvBuilder class - accumulates resolvers and schemas, then resolves
 */
export class EnvBuilder<TAccumulated extends Record<string, unknown>> {
  private layers: ResolverLayer<SimpleEnvSchema>[] = [];

  constructor(
    private localSchema: SimpleEnvSchema,
    private options: Partial<ResolveOptions> = {}
  ) {}

  /**
   * Add a custom provider with its schema
   * Later resolvers override earlier ones (last-wins)
   */
  from<TNew extends SimpleEnvSchema>(
    resolver: Resolver,
    schema: TNew
  ): EnvBuilder<MergeSchemas<TAccumulated, InferSimpleSchema<TNew>>> {
    this.layers.push({ resolver, schema });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return this as any; // Type assertion needed for accumulation
  }

  /**
   * Resolve all resolvers and validate environment variables
   */
  async resolve(): Promise<TAccumulated> {
    // Build complete schema by merging all layers
    const completeSchema: EnvSchema = normalizeSchema(this.localSchema);

    // Add schemas from custom resolvers (last-wins merge)
    for (const layer of this.layers) {
      const layerSchema = normalizeSchema(layer.schema);
      Object.assign(completeSchema, layerSchema);
    }

    // Build resolver list: local defaults + custom resolvers
    const defaultResolvers: Resolver[] = this.buildDefaultResolvers();
    const customResolvers = this.layers.map(l => l.resolver);

    // Add extend resolvers if specified in options
    const extendResolvers = (this.options as { extend?: Resolver[] }).extend || [];

    // If resolvers option is explicitly set, use it; otherwise build from defaults + custom + extend
    const allResolvers = this.options.resolvers
      ? this.options.resolvers
      : [...defaultResolvers, ...customResolvers, ...extendResolvers];

    // Default policies: secure by default (block dotenv in production unless explicitly allowed)
    const policies = this.options.policies ?? {};

    // Resolve using internal resolver
    const result = await resolveEnvInternal(completeSchema, {
      ...this.options,
      resolvers: allResolvers,
      policies,
      interpolate: this.options.interpolate ?? true,
      strict: this.options.strict ?? true,
    });

    return result as TAccumulated;
  }

  /**
   * Build default resolvers (dotenv + process.env) for local schema
   */
  private buildDefaultResolvers(): Resolver[] {
    const isProduction = process.env.NODE_ENV === 'production';

    const resolvers: Resolver[] = [];

    // Secure by default: In production, skip .env files entirely
    // Use process.env or cloud resolvers (AWS Secrets, etc.) instead
    if (!isProduction) {
      resolvers.push(dotenv({ expand: true }));
    }

    // Always add process.env
    resolvers.push(processEnv());

    return resolvers;
  }
}

/**
 * Synchronous EnvBuilder - only works with sync-capable resolvers
 */
export class EnvBuilderSync<TAccumulated extends Record<string, unknown>> {
  private layers: ResolverLayer<SimpleEnvSchema>[] = [];

  constructor(
    private localSchema: SimpleEnvSchema,
    private options: Partial<ResolveOptions> = {}
  ) {}

  /**
   * Add a custom provider with its schema (sync version)
   */
  from<TNew extends SimpleEnvSchema>(
    resolver: Resolver,
    schema: TNew
  ): EnvBuilderSync<MergeSchemas<TAccumulated, InferSimpleSchema<TNew>>> {
    this.layers.push({ resolver, schema });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return this as any;
  }

  /**
   * Synchronously resolve all resolvers
   */
  resolveSync(): TAccumulated {
    // Build complete schema
    const completeSchema: EnvSchema = normalizeSchema(this.localSchema);

    for (const layer of this.layers) {
      const layerSchema = normalizeSchema(layer.schema);
      Object.assign(completeSchema, layerSchema);
    }

    // Build provider list
    const defaultResolvers: Resolver[] = this.buildDefaultResolvers();
    const customResolvers = this.layers.map(l => l.resolver);

    // Add extend resolvers if specified in options
    const extendResolvers = (this.options as { extend?: Resolver[] }).extend || [];

    // If resolvers option is explicitly set, use it; otherwise build from defaults + custom + extend
    const allResolvers = this.options.resolvers
      ? this.options.resolvers
      : [...defaultResolvers, ...customResolvers, ...extendResolvers];

    // Default policies: secure by default (block dotenv in production unless explicitly allowed)
    const policies = this.options.policies ?? {};

    // Resolve using internal sync resolver
    const result = resolveEnvInternalSync(completeSchema, {
      ...this.options,
      resolvers: allResolvers,
      policies,
      interpolate: this.options.interpolate ?? true,
      strict: this.options.strict ?? true,
    });

    return result as TAccumulated;
  }

  private buildDefaultResolvers(): Resolver[] {
    const isProduction = process.env.NODE_ENV === 'production';

    const resolvers: Resolver[] = [];

    // Secure by default: In production, skip .env files entirely
    // Use process.env or cloud resolvers (AWS Secrets, etc.) instead
    if (!isProduction) {
      resolvers.push(dotenv({ expand: true }));
    }

    resolvers.push(processEnv());

    return resolvers;
  }
}

/**
 * Create an environment builder with local schema
 * Use .from() to add custom resolvers, then .resolve() to execute
 *
 * @example
 * ```typescript
 * const config = await env({
 *   FOO: 'string',
 *   BAR: 3000,
 * })
 *   .from(customResolver, { QUZ: 'string' })
 *   .resolve();
 * ```
 */
export function env<T extends SimpleEnvSchema>(
  localSchema: T,
  options?: Partial<ResolveOptions>
): EnvBuilder<InferSimpleSchema<T>> {
  return new EnvBuilder<InferSimpleSchema<T>>(localSchema, options);
}

/**
 * Synchronous version of env() - only works with sync-capable resolvers
 *
 * @example
 * ```typescript
 * const config = envSync({
 *   FOO: 'string',
 *   BAR: 3000,
 * }).resolveSync();
 * ```
 */
export function envSync<T extends SimpleEnvSchema>(
  localSchema: T,
  options?: Partial<ResolveOptions>
): EnvBuilderSync<InferSimpleSchema<T>> {
  return new EnvBuilderSync<InferSimpleSchema<T>>(localSchema, options);
}

/**
 * ResolvableBuilder - A builder that is both awaitable AND chainable
 * Simple usage: await resolve({...})
 * Composition: await resolve({...}).from(...).compose()
 */
export class ResolvableBuilder<TAccumulated extends Record<string, unknown>> implements PromiseLike<TAccumulated> {
  private builder: EnvBuilder<TAccumulated>;
  private simpleResolve: Promise<TAccumulated> | null = null;

  constructor(
    localSchema: SimpleEnvSchema,
    options: Partial<ResolveOptions> = {}
  ) {
    this.builder = new EnvBuilder<TAccumulated>(localSchema, options);
  }

  /**
   * Add a custom provider with its schema
   */
  from<TNew extends SimpleEnvSchema>(
    resolver: Resolver,
    schema: TNew
  ): ResolvableBuilder<MergeSchemas<TAccumulated, InferSimpleSchema<TNew>>> {
    this.builder.from(resolver, schema);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return this as any;
  }

  /**
   * Terminal operation for composition - resolves all resolvers
   * Only needed when using .from() - otherwise just await directly
   */
  async compose(): Promise<TAccumulated> {
    return this.builder.resolve();
  }

  /**
   * Make this object awaitable (PromiseLike)
   * Allows: const config = await resolve({...})
   */
  then<TResult1 = TAccumulated, TResult2 = never>(
    onfulfilled?: ((value: TAccumulated) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): PromiseLike<TResult1 | TResult2> {
    if (!this.simpleResolve) {
      this.simpleResolve = this.builder.resolve();
    }
    return this.simpleResolve.then(onfulfilled, onrejected);
  }

  /**
   * Catch errors (Promise-like interface)
   */
  catch<TResult = never>(
    onrejected?: ((reason: unknown) => TResult | PromiseLike<TResult>) | null
  ): Promise<TAccumulated | TResult> {
    if (!this.simpleResolve) {
      this.simpleResolve = this.builder.resolve();
    }
    return this.simpleResolve.catch(onrejected);
  }

  /**
   * Finally handler (Promise-like interface)
   */
  finally(onfinally?: (() => void) | null): Promise<TAccumulated> {
    if (!this.simpleResolve) {
      this.simpleResolve = this.builder.resolve();
    }
    return this.simpleResolve.finally(onfinally);
  }
}

/**
 * ResolvableBuilderSync - Synchronous version
 * Returns the resolved value directly, but also chainable
 *
 * The returned object has all properties from TAccumulated plus builder methods
 */
export class ResolvableBuilderSync<TAccumulated extends Record<string, unknown>> {
  private builder!: EnvBuilderSync<TAccumulated>; // Assigned via Object.defineProperty
  private _resolved: TAccumulated | null = null;
  private _hasComposition: boolean = false;

  constructor(
    localSchema: SimpleEnvSchema,
    options: Partial<ResolveOptions> = {}
  ) {
    // Make internal properties non-enumerable so they don't show up in spread/JSON
    Object.defineProperty(this, 'builder', {
      value: new EnvBuilderSync<TAccumulated>(localSchema, options),
      enumerable: false,
      writable: true
    });

    Object.defineProperty(this, '_hasComposition', {
      value: false,
      enumerable: false,
      writable: true
    });

    // Auto-resolve for simple usage and copy properties to this object
    // This allows accessing properties directly: const port = resolveSync({...}).PORT
    const resolved = this.builder.resolveSync();

    Object.defineProperty(this, '_resolved', {
      value: resolved,
      enumerable: false,
      writable: true
    });

    // Copy all properties from resolved value to this object (these ARE enumerable)
    Object.assign(this, resolved);
  }

  /**
   * Add a custom provider with its schema
   */
  from<TNew extends SimpleEnvSchema>(
    resolver: Resolver,
    schema: TNew
  ): ResolvableBuilderSync<MergeSchemas<TAccumulated, InferSimpleSchema<TNew>>> {
    Object.defineProperty(this, '_hasComposition', {
      value: true,
      enumerable: false,
      writable: true
    });
    this.builder.from(resolver, schema);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return this as any;
  }

  /**
   * Terminal operation for composition - resolves all resolvers synchronously
   * Only needed when using .from() - otherwise properties are already available
   */
  compose(): TAccumulated {
    if (this._hasComposition) {
      // Re-resolve with the new composition
      this._resolved = this.builder.resolveSync();
      Object.assign(this, this._resolved);
    }
    return this._resolved!;
  }

  /**
   * Convert to plain object
   */
  valueOf(): TAccumulated {
    return this._resolved!;
  }

  /**
   * For JSON serialization
   */
  toJSON(): TAccumulated {
    return this._resolved!;
  }
}
