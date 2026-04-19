import { describe, it, expect, vi } from 'vitest';
import { createKeychainHandler, keychainHandler } from './handlers';

describe('Keychain Reference Handlers', () => {
  it('creates handlers with explicit platform names', () => {
    expect(createKeychainHandler({ platform: 'macos' }).name).toBe('keychain-macos');
    expect(createKeychainHandler({ platform: 'linux' }).name).toBe('keychain-linux');
    expect(createKeychainHandler({ platform: 'windows' }).name).toBe('keychain-windows');
  });

  it('resolves keychain reference on macOS', () => {
    const execFileSync = vi.fn(() => 'my-secret-value\n');
    const handler = createKeychainHandler({ platform: 'macos' }, { execFileSync, platform: 'darwin' });

    const result = handler.resolve('keychain://prod/database-password', {
      key: 'DATABASE_URL',
      source: 'dotenv(.env)',
      reference: 'keychain://prod/database-password',
    });

    expect(result).toEqual({
      value: 'my-secret-value',
      resolvedVia: 'keychain-macos',
      metadata: {
        keyName: 'prod/database-password',
        platform: 'macos',
        service: 'node-env-resolver',
      },
    });

    expect(execFileSync).toHaveBeenCalledWith(
      'security',
      ['find-generic-password', '-a', 'prod/database-password', '-s', 'node-env-resolver', '-w'],
      { encoding: 'utf-8', timeout: 5000 },
    );
  });

  it('uses custom service prefix', () => {
    const execFileSync = vi.fn(() => 'secret\n');
    const handler = createKeychainHandler(
      { platform: 'macos', servicePrefix: 'myapp' },
      { execFileSync, platform: 'darwin' },
    );

    handler.resolve('keychain://db-pass', {
      key: 'DB_PASS',
      source: null,
      reference: 'keychain://db-pass',
    });

    expect(execFileSync).toHaveBeenCalledWith(
      'security',
      ['find-generic-password', '-a', 'db-pass', '-s', 'myapp', '-w'],
      { encoding: 'utf-8', timeout: 5000 },
    );
  });

  it('resolves keychain reference on Linux', () => {
    const execFileSync = vi.fn(() => 'linux-secret\n');
    const handler = createKeychainHandler({ platform: 'linux' }, { execFileSync, platform: 'linux' });

    const result = handler.resolve('keychain://prod/api-key', {
      key: 'API_KEY',
      source: null,
      reference: 'keychain://prod/api-key',
    });

    expect(result).toEqual({
      value: 'linux-secret',
      resolvedVia: 'keychain-linux',
      metadata: {
        keyName: 'prod/api-key',
        platform: 'linux',
        service: 'node-env-resolver',
      },
    });
  });

  it('resolves keychain reference on Windows', () => {
    const execFileSync = vi.fn(() => 'windows-secret\n');
    const handler = createKeychainHandler({ platform: 'windows' }, { execFileSync, platform: 'win32' });

    const result = handler.resolve('keychain://prod/db-url', {
      key: 'DB_URL',
      source: null,
      reference: 'keychain://prod/db-url',
    }) as { value: string; resolvedVia: string };

    expect(result.value).toBe('windows-secret');
    expect(result.resolvedVia).toBe('keychain-windows');
  });

  it('throws actionable error on keychain backend failures', () => {
    const execFileSync = vi.fn(() => {
      throw new Error('missing');
    });
    const handler = createKeychainHandler({ platform: 'macos' }, { execFileSync, platform: 'darwin' });

    expect(() =>
      handler.resolve('keychain://missing-key', {
        key: 'TEST',
        source: null,
        reference: 'keychain://missing-key',
      }),
    ).toThrow(/Failed to read from macOS Keychain/);
  });

  it('throws for invalid reference format', () => {
    const handler = createKeychainHandler({ platform: 'macos' });
    expect(() =>
      handler.resolve('invalid-format', {
        key: 'TEST',
        source: null,
        reference: 'invalid-format',
      }),
    ).toThrow('Invalid keychain reference');
  });

  it('supports resolveSync', () => {
    const execFileSync = vi.fn(() => 'sync-secret\n');
    const handler = createKeychainHandler({ platform: 'macos' }, { execFileSync, platform: 'darwin' });

    const result = handler.resolveSync!('keychain://prod/api-key', {
      key: 'API_KEY',
      source: null,
      reference: 'keychain://prod/api-key',
    }) as { value: string; resolvedVia: string };

    expect(result.value).toBe('sync-secret');
    expect(result.resolvedVia).toBe('keychain-macos');
  });

  it('exports pre-configured keychainHandler', () => {
    expect(keychainHandler.name).toMatch(/^keychain-/);
    expect(typeof keychainHandler.resolve).toBe('function');
  });
});
