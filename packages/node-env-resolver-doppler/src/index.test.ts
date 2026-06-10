import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDopplerHandler, doppler, dopplerBulk, dopplerHandlerFromEnv } from './index.js';

describe('node-env-resolver-doppler', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  function mockSecretsResponse(overrides?: Record<string, { raw: string; computed: string }>) {
    return {
      ok: true,
      json: async () => ({
        secrets: overrides ?? {
          API_KEY: { raw: 'raw', computed: 'computed' },
          DATABASE_URL: { raw: 'db', computed: 'db' },
        },
      }),
    };
  }

  it('maps secret to secretName by default', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockSecretsResponse()));

    const resolver = doppler({
      serviceToken: 'dp.token',
      project: 'proj',
      config: 'dev',
      secretName: 'API_KEY',
    });
    if (!resolver.load) throw new Error('Expected async resolver');

    await expect(resolver.load()).resolves.toEqual({ API_KEY: 'computed' });
  });

  it('supports envKey override', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockSecretsResponse()));

    const resolver = doppler({
      serviceToken: 'dp.token',
      project: 'proj',
      config: 'dev',
      secretName: 'API_KEY',
      envKey: 'RENAMED',
    });
    if (!resolver.load) throw new Error('Expected async resolver');

    await expect(resolver.load()).resolves.toEqual({ RENAMED: 'computed' });
  });

  it('reuses cached all-secrets response across repeated loads', async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockSecretsResponse());
    vi.stubGlobal('fetch', fetchMock);

    const resolver = doppler({
      serviceToken: 'dp.token',
      project: 'proj',
      config: 'dev',
      secretName: 'API_KEY',
    });
    if (!resolver.load) throw new Error('Expected async resolver');

    await resolver.load();
    await resolver.load();

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('resolves doppler:// references with metadata', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockSecretsResponse()));

    const handler = createDopplerHandler({
      serviceToken: 'dp.token',
      project: 'proj',
      config: 'dev',
    });

    const result = await handler.resolve('doppler://API_KEY', {
      key: 'API_KEY',
      source: 'dotenv(.env)',
      reference: 'doppler://API_KEY',
    });

    expect(result).toEqual({
      value: 'computed',
      resolvedVia: 'doppler',
      metadata: {
        secretName: 'API_KEY',
        project: 'proj',
        config: 'dev',
      },
    });
  });

  it('exposes bulk resolver', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockSecretsResponse()));

    const resolver = dopplerBulk({
      serviceToken: 'dp.token',
      project: 'proj',
      config: 'dev',
    });
    if (!resolver.load) throw new Error('Expected async resolver');

    await expect(resolver.load()).resolves.toEqual({
      API_KEY: 'computed',
      DATABASE_URL: 'db',
    });
  });

  it('dopplerHandlerFromEnv validates token presence', () => {
    const prev = process.env.DOPPLER_TOKEN;
    delete process.env.DOPPLER_TOKEN;
    expect(() => dopplerHandlerFromEnv('proj', 'dev')).toThrow(
      'DOPPLER_TOKEN environment variable is required for dopplerHandlerFromEnv()',
    );
    if (prev !== undefined) process.env.DOPPLER_TOKEN = prev;
  });
});
