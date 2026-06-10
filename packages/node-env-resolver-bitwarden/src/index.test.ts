import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { bitwarden, bitwardenHandlerFromEnv, createBitwardenHandler } from './index.js';

const organizationKey = Buffer.alloc(64, 7).toString('base64');

vi.mock('./crypto.js', () => {
  return {
    deriveKeyFromAccessToken: vi.fn(async () => ({
      encKey: {} as CryptoKey,
      macKey: {} as CryptoKey,
    })),
    decryptAes256CbcHmac: vi.fn(async (encryptedValue: string) => {
      if (encryptedValue === 'encrypted_payload') {
        return JSON.stringify({ encryptionKey: organizationKey });
      }
      if (encryptedValue === 'encrypted_secret') {
        return 'decrypted-secret-value';
      }
      throw new Error(`Unexpected encrypted value: ${encryptedValue}`);
    }),
    hkdfExpand: vi.fn(),
  };
});

describe('node-env-resolver-bitwarden', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('maps secret value to the Bitwarden secret key by default', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: 'jwt-token',
          expires_in: 3600,
          token_type: 'Bearer',
          encrypted_payload: 'encrypted_payload',
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: '12345678-1234-1234-1234-123456789abc',
          organizationId: 'org-id',
          key: 'API_KEY',
          value: 'encrypted_secret',
          note: '',
          creationDate: '',
          revisionDate: '',
        }),
      });
    vi.stubGlobal('fetch', fetchMock);

    const resolver = bitwarden({
      accessToken: '0.client.secret:c2VjcmV0S2V5',
      secretId: '12345678-1234-1234-1234-123456789abc',
    });
    if (!resolver.load) throw new Error('Expected async resolver');

    const result = await resolver.load();
    expect(result).toEqual({ API_KEY: 'decrypted-secret-value' });
  });

  it('supports envKey override for deterministic schema mapping', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: 'jwt-token',
          expires_in: 3600,
          token_type: 'Bearer',
          encrypted_payload: 'encrypted_payload',
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: '12345678-1234-1234-1234-123456789abc',
          organizationId: 'org-id',
          key: 'DIFFERENT_KEY',
          value: 'encrypted_secret',
          note: '',
          creationDate: '',
          revisionDate: '',
        }),
      });
    vi.stubGlobal('fetch', fetchMock);

    const resolver = bitwarden({
      accessToken: '0.client.secret:c2VjcmV0S2V5',
      secretId: '12345678-1234-1234-1234-123456789abc',
      envKey: 'API_KEY',
    });
    if (!resolver.load) throw new Error('Expected async resolver');

    const result = await resolver.load();
    expect(result).toEqual({ API_KEY: 'decrypted-secret-value' });
  });

  it('throws a clear error when accessToken is missing', async () => {
    expect(() =>
      bitwarden({
        accessToken: undefined as unknown as string,
        secretId: '12345678-1234-1234-1234-123456789abc',
      }),
    ).toThrow('Bitwarden accessToken is required');
  });

  it('reuses authentication cache across repeated resolver loads', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: 'jwt-token',
          expires_in: 3600,
          token_type: 'Bearer',
          encrypted_payload: 'encrypted_payload',
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: '12345678-1234-1234-1234-123456789abc',
          organizationId: 'org-id',
          key: 'API_KEY',
          value: 'encrypted_secret',
          note: '',
          creationDate: '',
          revisionDate: '',
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: '12345678-1234-1234-1234-123456789abc',
          organizationId: 'org-id',
          key: 'API_KEY',
          value: 'encrypted_secret',
          note: '',
          creationDate: '',
          revisionDate: '',
        }),
      });
    vi.stubGlobal('fetch', fetchMock);

    const resolver = bitwarden({
      accessToken: '0.client.secret:c2VjcmV0S2V5',
      secretId: '12345678-1234-1234-1234-123456789abc',
    });
    if (!resolver.load) throw new Error('Expected async resolver');

    await resolver.load();
    await resolver.load();

    const calls = fetchMock.mock.calls.map(([url]) => String(url));
    expect(calls.filter((url) => url.endsWith('/connect/token'))).toHaveLength(1);
    expect(calls.filter((url) => url.includes('/secrets/'))).toHaveLength(2);
  });

  it('resolves bws:// references with metadata', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: 'jwt-token',
          expires_in: 3600,
          token_type: 'Bearer',
          encrypted_payload: 'encrypted_payload',
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: '12345678-1234-1234-1234-123456789abc',
          organizationId: 'org-id',
          key: 'API_KEY',
          value: 'encrypted_secret',
          note: '',
          creationDate: '',
          revisionDate: '',
        }),
      });
    vi.stubGlobal('fetch', fetchMock);

    const handler = createBitwardenHandler({ accessToken: '0.client.secret:c2VjcmV0S2V5' });
    const result = await handler.resolve('bws://12345678-1234-1234-1234-123456789abc', {
      key: 'API_KEY',
      source: 'dotenv(.env)',
      reference: 'bws://12345678-1234-1234-1234-123456789abc',
    });

    expect(result).toEqual({
      value: 'decrypted-secret-value',
      resolvedVia: 'bitwarden',
      metadata: {
        secretId: '12345678-1234-1234-1234-123456789abc',
        key: 'API_KEY',
      },
    });
  });

  it('throws for invalid bws reference format', async () => {
    const handler = createBitwardenHandler({ accessToken: '0.client.secret:c2VjcmV0S2V5' });
    await expect(
      handler.resolve('not-bws://foo', {
        key: 'API_KEY',
        source: null,
        reference: 'not-bws://foo',
      }),
    ).rejects.toThrow('Invalid bws reference');
  });

  it('bitwardenHandlerFromEnv throws when env var is missing', () => {
    const previous = process.env.BWS_ACCESS_TOKEN;
    delete process.env.BWS_ACCESS_TOKEN;
    expect(() => bitwardenHandlerFromEnv()).toThrow(
      'BWS_ACCESS_TOKEN environment variable is required for bitwardenHandlerFromEnv()',
    );
    if (previous !== undefined) {
      process.env.BWS_ACCESS_TOKEN = previous;
    }
  });

  it('maps timeout errors to actionable network guidance', async () => {
    const abortError = new Error('The operation was aborted');
    abortError.name = 'AbortError';
    const fetchMock = vi.fn().mockRejectedValueOnce(abortError);
    vi.stubGlobal('fetch', fetchMock);

    const resolver = bitwarden({
      accessToken: '0.client.secret:c2VjcmV0S2V5',
      secretId: '12345678-1234-1234-1234-123456789abc',
    });
    if (!resolver.load) throw new Error('Expected async resolver');

    await expect(resolver.load()).rejects.toThrow(
      /timed out|service status and your network connection/i,
    );
  });
});
