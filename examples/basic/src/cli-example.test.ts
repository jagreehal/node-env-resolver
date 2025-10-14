import { describe, it, expect } from 'vitest';
import { resolve, processEnv } from 'node-env-resolver';
import { cliArgs } from 'node-env-resolver/cli';
import { withComputed } from 'node-env-resolver/utils';

describe('CLI and Computed Fields Examples', () => {
  it('CLI args with env prefix - typical CLI tool pattern', async () => {
    // Simulate: node app.js --port 8080 --database-url postgres://localhost --verbose
    const config = await resolve.async(
      [processEnv(), {
        PORT: 3000,
        DATABASE_URL: 'postgres',
        VERBOSE: false
      }],
      [cliArgs({
        argv: ['--port', '8080', '--database-url', 'postgres://localhost:5432/mydb', '--verbose']
      }), {
        PORT: 3000,
        DATABASE_URL: 'postgres',
        VERBOSE: false
      }]
    );

    expect(config.PORT).toBe(8080);
    expect(config.DATABASE_URL).toBe('postgres://localhost:5432/mydb');
    expect(config.VERBOSE).toBe(true);
  });

  it('Computed fields - build connection URLs', () => {
    process.env.DB_HOST = 'localhost';
    process.env.DB_PORT = '5432';
    process.env.DB_USER = 'admin';
    process.env.DB_PASSWORD = 'secret';
    process.env.DB_NAME = 'myapp';
    process.env.REDIS_HOST = 'localhost';
    process.env.REDIS_PORT = '6379';

    const config = resolve({
      DB_HOST: 'string',
      DB_PORT: 'number',
      DB_USER: 'string',
      DB_PASSWORD: 'string',
      DB_NAME: 'string',
      REDIS_HOST: 'string',
      REDIS_PORT: 'number'
    });

    // Add computed properties
    const appConfig = withComputed(config, {
      // Computed database URL
      databaseUrl: (c) => 
        `postgres://${c.DB_USER}:${c.DB_PASSWORD}@${c.DB_HOST}:${c.DB_PORT}/${c.DB_NAME}`,
      
      // Computed Redis URL
      redisUrl: (c) => 
        `redis://${c.REDIS_HOST}:${c.REDIS_PORT}`,
      
      // Computed connection config object
      dbConfig: (c) => ({
        host: c.DB_HOST,
        port: c.DB_PORT,
        user: c.DB_USER,
        password: c.DB_PASSWORD,
        database: c.DB_NAME
      })
    });

    expect(appConfig.databaseUrl).toBe('postgres://admin:secret@localhost:5432/myapp');
    expect(appConfig.redisUrl).toBe('redis://localhost:6379');
    expect(appConfig.dbConfig).toEqual({
      host: 'localhost',
      port: 5432,
      user: 'admin',
      password: 'secret',
      database: 'myapp'
    });

    delete process.env.DB_HOST;
    delete process.env.DB_PORT;
    delete process.env.DB_USER;
    delete process.env.DB_PASSWORD;
    delete process.env.DB_NAME;
    delete process.env.REDIS_HOST;
    delete process.env.REDIS_PORT;
  });

  it('Computed fields - environment-based feature flags', () => {
    process.env.NODE_ENV = 'production';
    process.env.ENABLE_ANALYTICS = 'true';
    process.env.ENABLE_CACHING = 'true';
    process.env.CACHE_TTL = '300';

    const config = resolve({
      NODE_ENV: ['development', 'staging', 'production'] as const,
      ENABLE_ANALYTICS: false,
      ENABLE_CACHING: false,
      CACHE_TTL: 'number'
    });

    const appConfig = withComputed(config, {
      // Environment checks
      isProd: (c) => c.NODE_ENV === 'production',
      isDev: (c) => c.NODE_ENV === 'development',
      
      // Feature flags object
      features: (c) => ({
        analytics: c.ENABLE_ANALYTICS,
        caching: c.ENABLE_CACHING,
        debug: c.NODE_ENV === 'development',
        monitoring: c.NODE_ENV === 'production'
      }),
      
      // Cache configuration
      cacheConfig: (c) => c.ENABLE_CACHING ? {
        enabled: true,
        ttl: c.CACHE_TTL,
        strategy: c.NODE_ENV === 'production' ? 'redis' : 'memory'
      } : {
        enabled: false
      }
    });

    expect(appConfig.isProd).toBe(true);
    expect(appConfig.isDev).toBe(false);
    expect(appConfig.features).toEqual({
      analytics: true,
      caching: true,
      debug: false,
      monitoring: true
    });
    expect(appConfig.cacheConfig).toEqual({
      enabled: true,
      ttl: 300,
      strategy: 'redis'
    });

    delete process.env.NODE_ENV;
    delete process.env.ENABLE_ANALYTICS;
    delete process.env.ENABLE_CACHING;
    delete process.env.CACHE_TTL;
  });

  it('Computed fields - API endpoints from base URL', () => {
    process.env.API_BASE_URL = 'https://api.example.com';
    process.env.API_VERSION = 'v2';
    process.env.API_KEY = 'secret-key-123';

    const config = resolve({
      API_BASE_URL: 'url',
      API_VERSION: 'string',
      API_KEY: 'string'
    });

    const appConfig = withComputed(config, {
      // Compute all API endpoints
      endpoints: (c) => ({
        users: `${c.API_BASE_URL}/${c.API_VERSION}/users`,
        posts: `${c.API_BASE_URL}/${c.API_VERSION}/posts`,
        comments: `${c.API_BASE_URL}/${c.API_VERSION}/comments`,
        auth: `${c.API_BASE_URL}/${c.API_VERSION}/auth`
      }),
      
      // Compute request headers
      headers: (c) => ({
        'Authorization': `Bearer ${c.API_KEY}`,
        'X-API-Version': c.API_VERSION
      })
    });

    expect(appConfig.endpoints).toEqual({
      users: 'https://api.example.com/v2/users',
      posts: 'https://api.example.com/v2/posts',
      comments: 'https://api.example.com/v2/comments',
      auth: 'https://api.example.com/v2/auth'
    });
    expect(appConfig.headers).toEqual({
      'Authorization': 'Bearer secret-key-123',
      'X-API-Version': 'v2'
    });

    delete process.env.API_BASE_URL;
    delete process.env.API_VERSION;
    delete process.env.API_KEY;
  });

  it('Combined: CLI args + computed fields - CLI tool with smart config', async () => {
    // Simulate: node build.js --input ./src --output ./dist --minify --workers 4
    const config = await resolve.async(
      [cliArgs({
        argv: [
          '--input', './src',
          '--output', './dist',
          '--minify',
          '--workers', '4'
        ]
      }), {
        INPUT: 'string',
        OUTPUT: 'string',
        MINIFY: false,
        WORKERS: 'number'
      }]
    );

    // Add computed properties for the build tool
    const buildConfig = withComputed(config, {
      // Compute full paths
      inputPath: (c) => `${process.cwd()}/${c.INPUT}`,
      outputPath: (c) => `${process.cwd()}/${c.OUTPUT}`,
      
      // Compute build options
      buildOptions: (c) => ({
        minify: c.MINIFY,
        sourcemap: !c.MINIFY, // No sourcemaps when minified
        workers: c.WORKERS,
        parallel: c.WORKERS > 1
      }),
      
      // Compute performance settings
      isOptimized: (c) => c.MINIFY && c.WORKERS > 2
    });

    expect(buildConfig.INPUT).toBe('./src');
    expect(buildConfig.OUTPUT).toBe('./dist');
    expect(buildConfig.MINIFY).toBe(true);
    expect(buildConfig.WORKERS).toBe(4);
    expect(buildConfig.buildOptions).toEqual({
      minify: true,
      sourcemap: false,
      workers: 4,
      parallel: true
    });
    expect(buildConfig.isOptimized).toBe(true);
  });

  it('Real-world example: Web server with CLI overrides and computed URLs', async () => {
    process.env.HOST = 'localhost';
    process.env.PORT = '3000';
    process.env.NODE_ENV = 'development';
    process.env.SSL_ENABLED = 'false';

    // CLI args override env vars
    const config = await resolve.async(
      [processEnv(), {
        HOST: 'string',
        PORT: 3000,
        NODE_ENV: ['development', 'staging', 'production'] as const,
        SSL_ENABLED: false
      }],
      [cliArgs({
        argv: ['--port', '8080', '--ssl-enabled']
      }), {
        HOST: 'string',
        PORT: 3000,
        NODE_ENV: ['development', 'staging', 'production'] as const,
        SSL_ENABLED: false
      }]
    );

    // Add computed server configuration
    const serverConfig = withComputed(config, {
      // Compute server URL
      url: (c) => {
        const protocol = c.SSL_ENABLED ? 'https' : 'http';
        return `${protocol}://${c.HOST}:${c.PORT}`;
      },
      
      // Compute server options
      serverOptions: (c) => ({
        host: c.HOST,
        port: c.PORT,
        ssl: c.SSL_ENABLED,
        cors: c.NODE_ENV !== 'production',
        compression: c.NODE_ENV === 'production',
        logging: c.NODE_ENV === 'development'
      }),
      
      // Environment checks
      isProd: (c) => c.NODE_ENV === 'production',
      isDev: (c) => c.NODE_ENV === 'development'
    });

    expect(serverConfig.url).toBe('https://localhost:8080'); // CLI enabled SSL and overrode PORT
    expect(serverConfig.SSL_ENABLED).toBe(true); // CLI overrode SSL_ENABLED
    expect(serverConfig.serverOptions).toEqual({
      host: 'localhost',
      port: 8080,
      ssl: true,
      cors: true,
      compression: false,
      logging: true
    });

    delete process.env.HOST;
    delete process.env.PORT;
    delete process.env.NODE_ENV;
    delete process.env.SSL_ENABLED;
  });
});

