import { beforeEach, describe, expect, it, vi } from 'vitest';
import { string } from 'node-env-resolver/validators';
import { dotenvx, dotenvxKeychain, resolveDotenvx, safeResolveDotenvx } from './index';

type SpyFn<T extends (...args: never[]) => unknown> = ReturnType<typeof vi.fn<T>>;

type TestDeps = {
  existsSync: SpyFn<(path: string) => boolean>;
  resolvePath: SpyFn<(...args: string[]) => string>;
  cwd: SpyFn<() => string>;
  dotenvxConfig: SpyFn<(options: Record<string, unknown>) => { parsed?: Record<string, string>; error?: Error }>;
  resolveAsync: SpyFn<(value: unknown) => Promise<Record<string, unknown>>>;
  safeResolveAsync: SpyFn<(value: unknown) => Promise<{ success: boolean; data?: Record<string, unknown>; error?: string }>>;
};

function makeDeps(): TestDeps {
  return {
    existsSync: vi.fn<(path: string) => boolean>(() => true),
    resolvePath: vi.fn<(...args: string[]) => string>((...args: string[]) => args.join('/')),
    cwd: vi.fn<() => string>(() => '/repo'),
    dotenvxConfig: vi.fn<(options: Record<string, unknown>) => { parsed?: Record<string, string>; error?: Error }>(
      () => ({ parsed: {} }),
    ),
    resolveAsync: vi.fn<(value: unknown) => Promise<Record<string, unknown>>>(),
    safeResolveAsync: vi.fn<(value: unknown) => Promise<{ success: boolean; data?: Record<string, unknown>; error?: string }>>(),
  };
}

describe('dotenvx resolver', () => {
  let deps: TestDeps;

  beforeEach(() => {
    deps = makeDeps();
  });

  it('creates resolver with default name', () => {
    const resolver = dotenvx(undefined, deps);
    expect(resolver.name).toBe('dotenvx(.env)');
  });

  it('creates resolver with custom path name', () => {
    const resolver = dotenvx('.env.local.secrets', deps);
    expect(resolver.name).toBe('dotenvx(.env.local.secrets)');
  });

  it('returns empty object when file does not exist', async () => {
    deps.existsSync.mockReturnValue(false);
    const resolver = dotenvx({ path: '/missing/.env' }, deps);
    await expect(resolver.load!()).resolves.toEqual({});
  });

  it('passes expected dotenvx options', async () => {
    deps.dotenvxConfig.mockReturnValue({ parsed: { DB_PASSWORD: 'decrypted-value' } });

    const resolver = dotenvx(
      { path: '.env.local.secrets', overload: true, privateKey: 'test-key' },
      deps,
    );

    await expect(resolver.load!()).resolves.toEqual({ DB_PASSWORD: 'decrypted-value' });
    expect(deps.resolvePath).toHaveBeenCalledWith('/repo', '.env.local.secrets');
    expect(deps.dotenvxConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        path: '/repo/.env.local.secrets',
        overload: true,
        DOTENV_KEY: expect.stringContaining('test-key'),
        processEnv: {},
        quiet: true,
        noOps: true,
      }),
    );
  });

  it('throws actionable error when dotenvx fails', async () => {
    deps.dotenvxConfig.mockReturnValue({ error: new Error('Missing private key') });
    const resolver = dotenvx({ path: '.env.encrypted' }, deps);
    await expect(resolver.load!()).rejects.toThrow('dotenvx: failed to load .env.encrypted');
  });

  it('supports sync mode', () => {
    deps.dotenvxConfig.mockReturnValue({ parsed: { API_KEY: 'sync-value' } });
    const resolver = dotenvx('.env.local.secrets', deps);
    expect(resolver.loadSync!()).toEqual({ API_KEY: 'sync-value' });
  });
});

describe('dotenvxKeychain resolver', () => {
  let deps: TestDeps;

  beforeEach(() => {
    deps = makeDeps();
  });

  it('creates resolver with default name', () => {
    const resolver = dotenvxKeychain(undefined, deps);
    expect(resolver.name).toBe('dotenvxKeychain(.env.local+.env.local.secrets)');
  });

  it('merges plain then secrets values', async () => {
    deps.dotenvxConfig.mockImplementation((opts: Record<string, unknown>) => {
      const path = String(opts.path ?? '');
      if (path.includes('.env.local.secrets')) {
        return { parsed: { DB_PASSWORD: 'secret-value', DEBUG: 'true' } as Record<string, string> };
      }
      return { parsed: { APP_URL: 'http://localhost:3000', DEBUG: 'false' } as Record<string, string> };
    });

    const resolver = dotenvxKeychain(undefined, deps);
    await expect(resolver.load!()).resolves.toEqual({
      APP_URL: 'http://localhost:3000',
      DB_PASSWORD: 'secret-value',
      DEBUG: 'true',
    });
  });

  it('supports sync mode', () => {
    deps.dotenvxConfig.mockImplementation((opts: Record<string, unknown>) => {
      const path = String(opts.path ?? '');
      if (path.includes('.env.local.secrets')) {
        return { parsed: { SECRET: 'decrypted' } as Record<string, string> };
      }
      return { parsed: { HOST: 'localhost' } as Record<string, string> };
    });

    const resolver = dotenvxKeychain(undefined, deps);
    expect(resolver.loadSync!()).toEqual({ HOST: 'localhost', SECRET: 'decrypted' });
  });
});

describe('resolveDotenvx', () => {
  let deps: TestDeps;

  beforeEach(() => {
    deps = makeDeps();
  });

  it('resolves with dotenvx resolver', async () => {
    const expectedConfig = { DB_PASSWORD: 'decrypted-pass', API_KEY: 'decrypted-key' };
    deps.resolveAsync.mockResolvedValueOnce(expectedConfig);

    const result = await resolveDotenvx(
      { path: '.env.local.secrets' },
      { DB_PASSWORD: string(), API_KEY: string() },
      undefined,
      deps,
    );

    expect(result).toEqual(expectedConfig);
    expect(deps.resolveAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        resolvers: [
          [
            expect.objectContaining({ name: 'dotenvx(.env.local.secrets)' }),
            { DB_PASSWORD: expect.any(Function), API_KEY: expect.any(Function) },
          ],
        ],
      }),
    );
  });

  it('passes resolve options', async () => {
    deps.resolveAsync.mockResolvedValueOnce({ DB_PASSWORD: 'val' });

    await resolveDotenvx('.env.secrets', { DB_PASSWORD: string() }, { strict: false }, deps);

    expect(deps.resolveAsync).toHaveBeenCalledWith(
      expect.objectContaining({ options: { strict: false } }),
    );
  });
});

describe('safeResolveDotenvx', () => {
  let deps: TestDeps;

  beforeEach(() => {
    deps = makeDeps();
  });

  it('returns success result', async () => {
    const expectedConfig = { DB_PASSWORD: 'decrypted' };
    deps.safeResolveAsync.mockResolvedValueOnce({ success: true, data: expectedConfig });

    await expect(
      safeResolveDotenvx({ path: '.env.local.secrets' }, { DB_PASSWORD: string() }, undefined, deps),
    ).resolves.toEqual({ success: true, data: expectedConfig });
  });

  it('returns error result from resolver', async () => {
    deps.safeResolveAsync.mockResolvedValueOnce({
      success: false,
      error: 'Missing required environment variable: DB_PASSWORD',
    });

    await expect(
      safeResolveDotenvx({ path: '.env.local.secrets' }, { DB_PASSWORD: string() }, undefined, deps),
    ).resolves.toEqual({
      success: false,
      error: 'Missing required environment variable: DB_PASSWORD',
    });
  });

  it('wraps unexpected exceptions as failed safe result', async () => {
    deps.safeResolveAsync.mockRejectedValueOnce(new Error('unexpected'));

    await expect(
      safeResolveDotenvx({ path: '.env.local.secrets' }, { DB_PASSWORD: string() }, undefined, deps),
    ).resolves.toEqual({
      success: false,
      error: 'unexpected',
    });
  });
});
