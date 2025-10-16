import { boolean, number, resolve, resolveSync, string, url } from './packages/node-env-resolver/src/index';
async function testTypes() {
  // ============================================
  // ASYNC - Simple usage
  // ============================================
  process.env.PORT = '3000';
  process.env.DATABASE_URL = 'postgres://localhost/db';
  process.env.DEBUG = 'true';
  process.env.NODE_ENV = 'development';

  const config = resolve({
    PORT: number(),
    DATABASE_URL: url(),
    DEBUG: boolean(),
    NODE_ENV: ['development', 'production'] as const,
    OPTIONAL: string({optional:true})
  });

  // TypeScript should infer these types correctly:
  const port: number = config.PORT;                          // ✅ number
  const dbUrl: string = config.DATABASE_URL;                 // ✅ string (URL type)
  const debug: boolean = config.DEBUG;                       // ✅ boolean
  const env: 'development' | 'production' = config.NODE_ENV; // ✅ enum
  const optional: string | undefined = config.OPTIONAL;      // ✅ optional

  console.log('✅ Async simple types work!');

  // ============================================
  // ASYNC - Composition with .from()
  // ============================================
  const mockProvider = {
    name: 'mock',
    async load() {
      return { SECRET_KEY: 'sk_test_123' };
    },
    loadSync() {
      return { SECRET_KEY: 'sk_test_123' };
    }
  };

  process.env.APP_NAME = 'MyApp';
  process.env.API_ENDPOINT = 'https://api.example.com';

  const composedConfig = await resolve({
    PORT: 3000,
    APP_NAME: string()
  })
  .from(mockProvider, {
    SECRET_KEY: string(),
    API_ENDPOINT: url()
  })
  .compose();

  // Types should merge correctly:
  const port2: number = composedConfig.PORT;              // ✅ number (from first schema)
  const appName: string = composedConfig.APP_NAME;        // ✅ string (from first schema)
  const secretKey: string = composedConfig.SECRET_KEY;    // ✅ string (from second schema)
  const apiEndpoint: string = composedConfig.API_ENDPOINT; // ✅ string (from second schema)

  console.log('✅ Async composition types work!');

  // ============================================
  // SYNC - Simple usage
  // ============================================
  process.env.SYNC_PORT = '4000';
  process.env.SYNC_DEBUG = 'false';

  const syncConfig = resolveSync({
    SYNC_PORT: 'number',
    SYNC_DEBUG: 'boolean',
    SYNC_OPTIONAL: string({optional:true})
  });

  // Access properties directly with correct types:
  const syncPort: number = syncConfig.SYNC_PORT;                    // ✅ number
  const syncDebug: boolean = syncConfig.SYNC_DEBUG;                 // ✅ boolean
  const syncOptional: string | undefined = syncConfig.SYNC_OPTIONAL; // ✅ optional

  // Spread should work and maintain types:
  const spreadConfig = { ...syncConfig };
  const spreadPort: number = spreadConfig.SYNC_PORT;                // ✅ number

  console.log('✅ Sync simple types work!');

  // ============================================
  // SYNC - Composition with .from()
  // ============================================
  process.env.FOO = 'foo-value';
  process.env.BAR = '123';

  const syncComposed = resolveSync({
    FOO: string()
  })
  .from(mockProvider, {
    BAR: 'number'
  })
  .compose();

  const foo: string = syncComposed.FOO; // ✅ string
  const bar: number = syncComposed.BAR; // ✅ number

  console.log('✅ Sync composition types work!');

  // ============================================
  // Type Inference with defaults
  // ============================================
  process.env.NODE_ENV = 'dev';

  const withDefaults = await resolve({
    PORT: 3000,                              // number with default
    DEBUG: false,                            // boolean with default
    NODE_ENV: ['dev', 'prod'] as const,      // enum
    OPTIONAL: string({optional:true}),                     // optional string
    URL_WITH_DEFAULT: 'url:http://localhost' // url with default
  });

  const defaultPort: number = withDefaults.PORT;
  const defaultDebug: boolean = withDefaults.DEBUG;
  const defaultEnv: 'dev' | 'prod' = withDefaults.NODE_ENV;
  const defaultOptional: string | undefined = withDefaults.OPTIONAL;
  const defaultUrl: string = withDefaults.URL_WITH_DEFAULT;

  console.log('✅ Default value types work!');

  console.log('\n🎉 All types are 100% type-safe with IntelliSense!');
}

testTypes().catch(console.error);
