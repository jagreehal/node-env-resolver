/**
 * Type inference tests for multiple resolver scenarios
 *
 * These tests verify that TypeScript correctly infers types when using
 * resolveAsync with multiple resolver tuples.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { resolve, resolveAsync } from './index';
import { string, number, boolean, url } from './validators';
import { processEnv } from './resolvers';
import type { Resolver, SimpleEnvSchema, InferSimpleSchema } from './types';

// Test resolvers
const createMockResolver = (
  name: string,
  data: Record<string, string>,
): Resolver => ({
  name,
  async load() {
    return data;
  },
  loadSync() {
    return data;
  },
});

describe('Multi-resolver type inference', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('Single resolver tuple - should infer types correctly', () => {
    it('infers types from single resolver tuple', async () => {
      process.env.DB_NAME = 'mydb';
      process.env.DB_PORT = '5432';

      const config = {
        DB_NAME: string(),
        DB_PORT: number(),
      };

      // Single resolver tuple - type inference SHOULD work
      const envVar = await resolveAsync({
        resolvers: [[processEnv(), config]],
      });

      // These should compile without errors - verifying correct inference
      const dbName: string = envVar.DB_NAME;
      const dbPort: number = envVar.DB_PORT;

      expect(dbName).toBe('mydb');
      expect(dbPort).toBe(5432);

      // @ts-expect-error - DB_NAME should be string, not number
      const _wrongName: number = envVar.DB_NAME;

      // @ts-expect-error - DB_PORT should be number, not string
      const _wrongPort: string = envVar.DB_PORT;

      // Suppress unused variable warnings
      void _wrongName;
      void _wrongPort;
    });

    it('infers optional types correctly', async () => {
      process.env.REQUIRED_VAR = 'value';
      // OPTIONAL_VAR is not set

      const config = {
        REQUIRED_VAR: string(),
        OPTIONAL_VAR: string({ optional: true }),
      };

      const envVar = await resolveAsync({
        resolvers: [[processEnv(), config]],
      });

      // Required should be string
      const required: string = envVar.REQUIRED_VAR;
      expect(required).toBe('value');

      // Optional should be string | undefined
      const optional: string | undefined = envVar.OPTIONAL_VAR;
      expect(optional).toBeUndefined();

      // @ts-expect-error - OPTIONAL_VAR can be undefined, so string assignment should fail
      const _wrongOptional: string = envVar.OPTIONAL_VAR;
      void _wrongOptional;
    });
  });

  describe('Multiple resolver tuples - type inference', () => {
    it('should infer merged schema types from multiple resolvers', async () => {
      const dotenvResolver = createMockResolver('dotenv', {
        PORT: '3000',
        HOST: 'localhost',
      });

      const awsResolver = createMockResolver('aws', {
        DATABASE_URL: 'postgres://localhost:5432/db',
        API_KEY: 'secret-key',
      });

      // Define schemas for each resolver
      const dotenvSchema = {
        PORT: number(),
        HOST: string(),
      };

      const awsSchema = {
        DATABASE_URL: url(),
        API_KEY: string(),
      };

      // Multiple resolvers - use '' on the resolvers array for type inference
      const envVar = await resolveAsync({
        resolvers: [
          [dotenvResolver, dotenvSchema],
          [awsResolver, awsSchema],
        ],
      });

      // With proper inference, all properties should be correctly typed
      const port: number = envVar.PORT;
      const host: string = envVar.HOST;
      const dbUrl: string = envVar.DATABASE_URL;
      const apiKey: string = envVar.API_KEY;

      expect(port).toBe(3000);
      expect(host).toBe('localhost');
      expect(dbUrl).toBe('postgres://localhost:5432/db');
      expect(apiKey).toBe('secret-key');

      // @ts-expect-error - PORT should be number
      const _wrongPort: string = envVar.PORT;

      // @ts-expect-error - HOST should be string
      const _wrongHost: number = envVar.HOST;

      void _wrongPort;
      void _wrongHost;
    });

    it('infers types with  on resolvers array', async () => {
      const resolver1 = createMockResolver('resolver1', { FOO: 'bar' });
      const resolver2 = createMockResolver('resolver2', { BAZ: '123' });

      const schema1 = { FOO: string() };
      const schema2 = { BAZ: number() };

      // With '' on the resolvers array, types are inferred correctly
      const envVar = await resolveAsync({
        resolvers: [
          [resolver1, schema1],
          [resolver2, schema2],
        ],
      });

      // Type inference should now work correctly
      const foo: string = envVar.FOO;
      const baz: number = envVar.BAZ;

      expect(foo).toBe('bar');
      expect(baz).toBe(123);

      // @ts-expect-error - FOO should be string
      const _wrongFoo: number = envVar.FOO;

      // @ts-expect-error - BAZ should be number
      const _wrongBaz: string = envVar.BAZ;

      void _wrongFoo;
      void _wrongBaz;
    });

    it('without , falls back to Record<string, unknown>', async () => {
      const resolver1 = createMockResolver('resolver1', { FOO: 'bar' });
      const resolver2 = createMockResolver('resolver2', { BAZ: '123' });

      const schema1 = { FOO: string() };
      const schema2 = { BAZ: number() };

      // WITHOUT '' - TypeScript widens the array type
      // This results in less specific type inference
      const envVar = await resolveAsync({
        resolvers: [
          [resolver1, schema1],
          [resolver2, schema2],
        ],
      });

      // Runtime values are still correct
      expect(envVar.FOO).toBe('bar');
      expect(envVar.BAZ).toBe(123);
    });
  });

  describe('schema property - type inference', () => {
    it('infers types correctly when using schema property', async () => {
      process.env.APP_NAME = 'MyApp';
      process.env.APP_PORT = '8080';
      process.env.DEBUG = 'true';

      const schema = {
        APP_NAME: string(),
        APP_PORT: number(),
        DEBUG: boolean(),
      };

      // Using schema property - should infer correctly
      const envVar = await resolveAsync({
        schema,
      });

      // Type inference should work
      const appName: string = envVar.APP_NAME;
      const appPort: number = envVar.APP_PORT;
      const debug: boolean = envVar.DEBUG;

      expect(appName).toBe('MyApp');
      expect(appPort).toBe(8080);
      expect(debug).toBe(true);

      // @ts-expect-error - APP_NAME is string, not number
      const _wrongName: number = envVar.APP_NAME;

      // @ts-expect-error - DEBUG is boolean, not string
      const _wrongDebug: string = envVar.DEBUG;

      void _wrongName;
      void _wrongDebug;
    });
  });

  describe('sync resolve - type inference', () => {
    it('infers types from sync resolve with single resolver', () => {
      process.env.SYNC_VAR = 'sync-value';
      process.env.SYNC_NUM = '42';

      const config = {
        SYNC_VAR: string(),
        SYNC_NUM: number(),
      };

      const envVar = resolve({
        resolvers: [[processEnv(), config]],
      });

      // Types should be inferred correctly
      const syncVar: string = envVar.SYNC_VAR;
      const syncNum: number = envVar.SYNC_NUM;

      expect(syncVar).toBe('sync-value');
      expect(syncNum).toBe(42);

      // @ts-expect-error - SYNC_VAR is string
      const _wrongVar: number = envVar.SYNC_VAR;

      // @ts-expect-error - SYNC_NUM is number
      const _wrongNum: string = envVar.SYNC_NUM;

      void _wrongVar;
      void _wrongNum;
    });

    it('infers types from sync resolve with schema property', () => {
      process.env.NAME = 'test';
      process.env.COUNT = '10';

      const schema = {
        NAME: string(),
        COUNT: number(),
      };

      // Simple schema syntax
      const envVar = resolve(schema);

      const name: string = envVar.NAME;
      const count: number = envVar.COUNT;

      expect(name).toBe('test');
      expect(count).toBe(10);

      // @ts-expect-error - NAME is string
      const _wrongName: boolean = envVar.NAME;

      // @ts-expect-error - COUNT is number
      const _wrongCount: string = envVar.COUNT;

      void _wrongName;
      void _wrongCount;
    });
  });

  describe('InferSimpleSchema utility type', () => {
    it('correctly infers schema types', () => {
      const schema = {
        STR: string(),
        NUM: number(),
        BOOL: boolean(),
        OPT: string({ optional: true }),
      };

      // Use schema at runtime to satisfy linter
      expect(schema).toBeDefined();

      type Inferred = InferSimpleSchema<typeof schema>;

      // These type assertions verify the InferSimpleSchema utility works
      type _AssertStr = Inferred['STR'] extends string ? true : false;
      type _AssertNum = Inferred['NUM'] extends number ? true : false;
      type _AssertBool = Inferred['BOOL'] extends boolean ? true : false;
      type _AssertOpt = Inferred['OPT'] extends string | undefined
        ? true
        : false;

      // Compile-time type checks
      const _str: _AssertStr = true;
      const _num: _AssertNum = true;
      const _bool: _AssertBool = true;
      const _opt: _AssertOpt = true;

      expect(_str).toBe(true);
      expect(_num).toBe(true);
      expect(_bool).toBe(true);
      expect(_opt).toBe(true);
    });
  });

  describe('Same schema across multiple resolvers', () => {
    it('handles same schema used with multiple resolvers (user reported case)', async () => {
      const dotenvResolver = createMockResolver('dotenv', {
        DB_NAME: 'from-dotenv',
        DB_PORT: '5432',
      });

      const processEnvResolver = createMockResolver('processEnv', {
        DB_NAME: 'from-process',
        DB_PORT: '3306',
      });

      const awsResolver = createMockResolver('aws', {
        DB_NAME: 'from-aws',
        DB_PORT: '1433',
      });

      const config = {
        DB_NAME: string(),
        DB_PORT: number(),
      };

      // This is the exact pattern from the user's issue
      // Use '' on resolvers array for type inference
      const envVar = await resolveAsync({
        resolvers: [
          [dotenvResolver, config],
          [processEnvResolver, config],
          [awsResolver, config],
        ],
        options: { priority: 'first' },
      });

      // priority: 'first' means dotenv values win
      const dbName: string = envVar.DB_NAME;
      const dbPort: number = envVar.DB_PORT;

      expect(dbName).toBe('from-dotenv');
      expect(dbPort).toBe(5432);

      // @ts-expect-error - DB_NAME is string
      const _wrongName: number = envVar.DB_NAME;

      // @ts-expect-error - DB_PORT is number
      const _wrongPort: string = envVar.DB_PORT;

      void _wrongName;
      void _wrongPort;
    });

    it('priority: last means last resolver wins', async () => {
      const resolver1 = createMockResolver('first', { VALUE: 'first' });
      const resolver2 = createMockResolver('last', { VALUE: 'last' });

      const config = { VALUE: string() };

      const envVar = await resolveAsync({
        resolvers: [
          [resolver1, config],
          [resolver2, config],
        ],
        options: { priority: 'last' },
      });

      expect(envVar.VALUE).toBe('last');
    });
  });
});

describe('Type narrowing with validated values', () => {
  it('url validator returns string type', async () => {
    const resolver = createMockResolver('test', {
      ENDPOINT: 'https://api.example.com',
    });

    const config = {
      ENDPOINT: url(),
    };

    const envVar = await resolveAsync({
      resolvers: [[resolver, config]],
    });

    // URL validator returns string
    const endpoint: string = envVar.ENDPOINT;
    expect(endpoint).toBe('https://api.example.com');

    // @ts-expect-error - ENDPOINT is string, not URL object
    const _wrongType: URL = envVar.ENDPOINT;
    void _wrongType;
  });
});

describe('Generic helper function pattern', () => {
  it('infers return type correctly in generic wrapper function', async () => {
    // Helper function that wraps resolveAsync - NO explicit type parameter needed
    async function getEnvVar<TSchema extends SimpleEnvSchema>(schema: TSchema) {
      const resolver = createMockResolver('test', {
        DB_NAME: 'mydb',
        DB_PORT: '5432',
      });

      return resolveAsync({
        resolvers: [
          [resolver, schema],
          [resolver, schema],
        ],
        options: { priority: 'first' },
      });
    }

    const mongoSchema = {
      DB_NAME: string(),
      DB_PORT: number(),
    };

    const result = await getEnvVar(mongoSchema);

    // Type should be inferred correctly - no explicit type parameter or cast needed!
    const dbName: string = result.DB_NAME;
    const dbPort: number = result.DB_PORT;

    expect(dbName).toBe('mydb');
    expect(dbPort).toBe(5432);

    // @ts-expect-error - DB_NAME should be string, not number
    const _wrongName: number = result.DB_NAME;

    // @ts-expect-error - DB_PORT should be number, not string
    const _wrongPort: string = result.DB_PORT;

    void _wrongName;
    void _wrongPort;
  });

  it('works with sync resolve as well', () => {
    function getEnvSync<TSchema extends SimpleEnvSchema>(schema: TSchema) {
      const resolver = {
        name: 'test',
        loadSync: () => ({
          APP_NAME: 'myapp',
          APP_PORT: '3000',
        }),
      };

      return resolve({
        resolvers: [
          [resolver, schema],
          [resolver, schema],
        ],
      });
    }

    const appSchema = {
      APP_NAME: string(),
      APP_PORT: number(),
    };

    const result = getEnvSync(appSchema);

    const appName: string = result.APP_NAME;
    const appPort: number = result.APP_PORT;

    expect(appName).toBe('myapp');
    expect(appPort).toBe(3000);

    // @ts-expect-error - APP_NAME should be string
    const _wrongName: boolean = result.APP_NAME;

    void _wrongName;
  });
});
