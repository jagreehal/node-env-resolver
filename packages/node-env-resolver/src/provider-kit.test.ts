import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  assertSecureUrl,
  fetchWithTimeout,
  requireCredential,
  resolveCredential,
  resolveOptionalCredential,
} from './provider-kit';

describe('requireCredential', () => {
  it('accepts a non-empty string', () => {
    expect(requireCredential('token', 'X token')).toBe('token');
  });

  it('accepts a function provider as-is (deferred validation)', () => {
    const fn = () => 'token';
    expect(requireCredential(fn, 'X token')).toBe(fn);
  });

  it('throws synchronously for an empty / missing string', () => {
    expect(() => requireCredential('', 'X token')).toThrow('X token is required');
    expect(() => requireCredential('   ', 'X token')).toThrow('X token is required');
    expect(() => requireCredential(undefined, 'X token')).toThrow('X token is required');
  });
});

describe('resolveCredential', () => {
  it('returns a literal string', async () => {
    await expect(resolveCredential('token', 'X token')).resolves.toBe('token');
  });

  it('resolves a sync function', async () => {
    await expect(resolveCredential(() => 'token', 'X token')).resolves.toBe('token');
  });

  it('resolves an async function (e.g. keychain read)', async () => {
    await expect(
      resolveCredential(async () => 'from-keychain', 'X token'),
    ).resolves.toBe('from-keychain');
  });

  it('throws when a function yields an empty value', async () => {
    await expect(resolveCredential(() => '', 'X token')).rejects.toThrow('X token is required');
  });
});

describe('resolveOptionalCredential', () => {
  it('passes undefined through', async () => {
    await expect(resolveOptionalCredential(undefined, 'X token')).resolves.toBeUndefined();
  });

  it('resolves a provided value', async () => {
    await expect(resolveOptionalCredential(() => 'token', 'X token')).resolves.toBe('token');
  });
});

describe('assertSecureUrl', () => {
  it('allows https', () => {
    expect(() => assertSecureUrl('https://api.example.com', 'endpoint')).not.toThrow();
  });

  it('rejects plain http by default', () => {
    expect(() => assertSecureUrl('http://api.example.com', 'endpoint')).toThrow(
      'endpoint must use https://',
    );
  });

  it('always allows loopback over http', () => {
    for (const host of ['http://localhost:8080', 'http://127.0.0.1:8080', 'http://[::1]:8080']) {
      expect(() => assertSecureUrl(host, 'endpoint')).not.toThrow();
    }
  });

  it('allows http when explicitly opted in', () => {
    expect(() => assertSecureUrl('http://api.example.com', 'endpoint', true)).not.toThrow();
  });

  it('throws on a malformed URL', () => {
    expect(() => assertSecureUrl('not a url', 'endpoint')).toThrow('endpoint is not a valid URL');
  });
});

describe('fetchWithTimeout', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('returns the response on success', async () => {
    const response = new Response('ok');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response));
    await expect(fetchWithTimeout('https://x', {}, 'Service')).resolves.toBe(response);
  });

  it('surfaces a clear error when the request aborts past the timeout', async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url: string, init: RequestInit) =>
          new Promise((_resolve, reject) => {
            init.signal?.addEventListener('abort', () => {
              const err = new Error('aborted');
              err.name = 'AbortError';
              reject(err);
            });
          }),
      ),
    );
    const pending = fetchWithTimeout('https://x', {}, 'Service', 1000);
    const assertion = expect(pending).rejects.toThrow('Request to Service timed out after 1000ms');
    await vi.advanceTimersByTimeAsync(1000);
    await assertion;
  });

  it('propagates a non-abort error unchanged', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('boom')));
    await expect(fetchWithTimeout('https://x', {}, 'Service')).rejects.toThrow('boom');
  });
});
