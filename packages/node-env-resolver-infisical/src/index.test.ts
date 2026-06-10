import { afterEach, describe, expect, it, vi } from 'vitest';
import { createInfisicalHandler, infisical, infisicalHandlerFromEnv } from './index.js';

describe('node-env-resolver-infisical', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('maps resolved secret to secretName by default', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ accessToken: 'token', expiresIn: 3600, tokenType: 'Bearer' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ secret: { secretKey: 'API_KEY', secretValue: 'value-1' } }),
      });
    vi.stubGlobal('fetch', fetchMock);

    const resolver = infisical({
      clientId: 'cid',
      clientSecret: 'secret',
      projectId: 'project',
      environment: 'dev',
      secretName: 'API_KEY',
    });
    if (!resolver.load) throw new Error('Expected async resolver');

    await expect(resolver.load()).resolves.toEqual({ API_KEY: 'value-1' });
  });

  it('supports envKey override', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ accessToken: 'token', expiresIn: 3600, tokenType: 'Bearer' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ secret: { secretKey: 'DIFFERENT', secretValue: 'value-2' } }),
      });
    vi.stubGlobal('fetch', fetchMock);

    const resolver = infisical({
      clientId: 'cid',
      clientSecret: 'secret',
      projectId: 'project',
      environment: 'dev',
      secretName: 'DIFFERENT',
      envKey: 'API_KEY',
    });
    if (!resolver.load) throw new Error('Expected async resolver');

    await expect(resolver.load()).resolves.toEqual({ API_KEY: 'value-2' });
  });

  it('rejects a non-https siteUrl to protect the client secret in transit', () => {
    expect(() =>
      infisical({
        clientId: 'cid',
        clientSecret: 'secret',
        projectId: 'project',
        environment: 'dev',
        secretName: 'API_KEY',
        siteUrl: 'http://infisical.internal.example.com',
      }),
    ).toThrow('Infisical siteUrl must use https://');
  });

  it('accepts a function clientSecret so it can stay out of process.env', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ accessToken: 'token', expiresIn: 3600, tokenType: 'Bearer' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ secret: { secretKey: 'API_KEY', secretValue: 'value-1' } }),
      });
    vi.stubGlobal('fetch', fetchMock);

    const clientSecret = vi.fn(async () => 'secret');
    const resolver = infisical({
      clientId: 'cid',
      clientSecret,
      projectId: 'project',
      environment: 'dev',
      secretName: 'API_KEY',
    });
    if (!resolver.load) throw new Error('Expected async resolver');

    await expect(resolver.load()).resolves.toEqual({ API_KEY: 'value-1' });
    expect(clientSecret).toHaveBeenCalled();
  });

  it('reuses auth token across repeated loads with same resolver instance', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ accessToken: 'token', expiresIn: 3600, tokenType: 'Bearer' }),
      })
      .mockResolvedValue({
        ok: true,
        json: async () => ({ secret: { secretKey: 'API_KEY', secretValue: 'value' } }),
      });
    vi.stubGlobal('fetch', fetchMock);

    const resolver = infisical({
      clientId: 'cid',
      clientSecret: 'secret',
      projectId: 'project',
      environment: 'dev',
      secretName: 'API_KEY',
    });
    if (!resolver.load) throw new Error('Expected async resolver');

    await resolver.load();
    await resolver.load();

    const calls = fetchMock.mock.calls.map(([url]) => String(url));
    expect(calls.filter((u) => u.includes('/universal-auth/login'))).toHaveLength(1);
    expect(calls.filter((u) => u.includes('/api/v3/secrets/raw/'))).toHaveLength(2);
  });

  it('resolves infisical:// references', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ accessToken: 'token', expiresIn: 3600, tokenType: 'Bearer' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ secret: { secretKey: 'API_KEY', secretValue: 'value-3' } }),
      });
    vi.stubGlobal('fetch', fetchMock);

    const handler = createInfisicalHandler({
      clientId: 'cid',
      clientSecret: 'secret',
      projectId: 'project',
      environment: 'dev',
    });
    const result = await handler.resolve('infisical://API_KEY', {
      key: 'API_KEY',
      source: 'dotenv(.env)',
      reference: 'infisical://API_KEY',
    });

    expect(result).toEqual({
      value: 'value-3',
      resolvedVia: 'infisical',
      metadata: {
        secretName: 'API_KEY',
        projectId: 'project',
        environment: 'dev',
      },
    });
  });

  it('infisicalHandlerFromEnv fails when env vars are missing', () => {
    const prevId = process.env.INFISICAL_CLIENT_ID;
    const prevSecret = process.env.INFISICAL_CLIENT_SECRET;
    delete process.env.INFISICAL_CLIENT_ID;
    delete process.env.INFISICAL_CLIENT_SECRET;

    expect(() => infisicalHandlerFromEnv('project', 'dev')).toThrow(
      'INFISICAL_CLIENT_ID and INFISICAL_CLIENT_SECRET environment variables are required',
    );

    if (prevId !== undefined) process.env.INFISICAL_CLIENT_ID = prevId;
    if (prevSecret !== undefined) process.env.INFISICAL_CLIENT_SECRET = prevSecret;
  });
});
