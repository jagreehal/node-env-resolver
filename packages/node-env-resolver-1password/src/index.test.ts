import { afterEach, describe, expect, it, vi } from 'vitest';

const mockExecFile = vi.hoisted(() => vi.fn());

vi.mock('node:child_process', () => ({
  execFile: mockExecFile,
}));

import {
  createOnePasswordHandler,
  onePassword,
  onePasswordHandlerFromEnv,
} from './index.js';

describe('node-env-resolver-1password', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  function setExecFileSuccess(stdout = 'secret-value') {
    mockExecFile.mockImplementation((...args: unknown[]) => {
      const cb = args[args.length - 1] as (
        err: Error | null,
        stdout: string,
        stderr: string,
      ) => void;
      cb(null, stdout, '');
    });
  }

  it('resolves service-account token flow via op CLI', async () => {
    setExecFileSuccess('value-1');

    const resolver = onePassword({
      serviceAccountToken: 'ops_test_token',
      reference: 'op://vault/item/password',
    });
    if (!resolver.load) throw new Error('Expected async resolver');

    await expect(resolver.load()).resolves.toEqual({ password: 'value-1' });
    expect(mockExecFile).toHaveBeenCalled();
  });

  it('supports envKey override', async () => {
    setExecFileSuccess('value-2');

    const resolver = onePassword({
      serviceAccountToken: 'ops_test_token',
      reference: 'op://vault/item/password',
      envKey: 'API_KEY',
    });
    if (!resolver.load) throw new Error('Expected async resolver');

    await expect(resolver.load()).resolves.toEqual({ API_KEY: 'value-2' });
  });

  it('validates op:// reference format', async () => {
    setExecFileSuccess('value');

    const resolver = onePassword({
      serviceAccountToken: 'ops_test_token',
      reference: 'bad-reference',
    });
    if (!resolver.load) throw new Error('Expected async resolver');

    await expect(resolver.load()).rejects.toThrow('Invalid 1Password reference');
  });

  it('resolves 1Password Connect references', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'vault-id', name: 'MyVault' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'item-id', title: 'MyItem' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 'item-id',
          title: 'MyItem',
          fields: [{ id: 'password', label: 'password', value: 'connect-secret' }],
        }),
      });
    vi.stubGlobal('fetch', fetchMock);

    const handler = createOnePasswordHandler({
      connectHost: 'https://connect.example.com',
      connectToken: 'connect-token',
    });

    const result = await handler.resolve('op://MyVault/MyItem/password', {
      key: 'PASSWORD',
      source: 'dotenv(.env)',
      reference: 'op://MyVault/MyItem/password',
    });
    expect(result).toEqual({
      value: 'connect-secret',
      resolvedVia: '1password',
      metadata: {
        vault: 'MyVault',
        item: 'MyItem',
        field: 'password',
      },
    });
  });

  it('rejects a non-https connectHost to protect the connect token in transit', () => {
    expect(() =>
      createOnePasswordHandler({
        connectHost: 'http://connect.internal.example.com',
        connectToken: 'connect-token',
      }),
    ).toThrow('1Password connectHost must use https://');
  });

  it('allows a loopback connectHost over http for local development', () => {
    expect(() =>
      createOnePasswordHandler({
        connectHost: 'http://localhost:8080',
        connectToken: 'connect-token',
      }),
    ).not.toThrow();
  });

  it('onePasswordHandlerFromEnv validates auth env vars', () => {
    const oldSvc = process.env.OP_SERVICE_ACCOUNT_TOKEN;
    const oldHost = process.env.OP_CONNECT_HOST;
    const oldToken = process.env.OP_CONNECT_TOKEN;
    delete process.env.OP_SERVICE_ACCOUNT_TOKEN;
    delete process.env.OP_CONNECT_HOST;
    delete process.env.OP_CONNECT_TOKEN;

    expect(() => onePasswordHandlerFromEnv()).toThrow(
      'OP_SERVICE_ACCOUNT_TOKEN or OP_CONNECT_HOST+OP_CONNECT_TOKEN environment variables are required',
    );

    if (oldSvc !== undefined) process.env.OP_SERVICE_ACCOUNT_TOKEN = oldSvc;
    if (oldHost !== undefined) process.env.OP_CONNECT_HOST = oldHost;
    if (oldToken !== undefined) process.env.OP_CONNECT_TOKEN = oldToken;
  });
});
