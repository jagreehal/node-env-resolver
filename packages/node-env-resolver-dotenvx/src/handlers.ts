/**
 * Keychain reference handler for node-env-resolver
 *
 * Resolves `keychain://` URI references by fetching secrets
 * from the OS credential store (macOS Keychain, Linux secret-tool, Windows Credential Manager).
 *
 * @example
 * ```ts
 * import { resolveAsync } from 'node-env-resolver';
 * import { processEnv } from 'node-env-resolver/resolvers';
 * import { createKeychainHandler } from 'node-env-resolver-dotenvx/handlers';
 *
 * const config = await resolveAsync({
 *   resolvers: [[processEnv(), {
 *     DATABASE_URL: string(),  // value can be 'keychain://prod/database-url'
 *   }]],
 *   references: {
 *     handlers: {
 *       'keychain': createKeychainHandler(),
 *     },
 *   },
 * });
 * ```
 *
 * .env file:
 * DATABASE_URL=keychain://prod/database-url
 */

import { execFileSync } from 'node:child_process';
import type { ReferenceHandler } from 'node-env-resolver';

export interface KeychainHandlerOptions {
  /** macOS Keychain service name prefix (default: 'node-env-resolver') */
  servicePrefix?: string;
  /** Platform override: 'macos' | 'linux' | 'windows' | 'auto' (default: 'auto') */
  platform?: 'macos' | 'linux' | 'windows' | 'auto';
}

interface KeychainDeps {
  platform: string;
  execFileSync: (command: string, args: string[], options: { encoding: 'utf-8'; timeout: number }) => string;
}

const defaultKeychainDeps: KeychainDeps = {
  platform: process.platform,
  execFileSync: (command, args, options) => execFileSync(command, args, options) as string,
};

const KEYCHAIN_PATTERN = /^keychain:\/\/(.+)$/;

function detectPlatform(platform: string): 'macos' | 'linux' | 'windows' {
  if (platform === 'darwin') return 'macos';
  if (platform === 'win32') return 'windows';
  return 'linux';
}

function execForKeychain(
  execFn: KeychainDeps['execFileSync'],
  command: string,
  args: string[],
  options: { encoding: 'utf-8'; timeout: number },
): string {
  return execFn(command, args, options);
}

function readFromMacOSKeychain(
  execFn: KeychainDeps['execFileSync'],
  service: string,
  account: string,
): string {
  try {
    return execForKeychain(
      execFn,
      'security',
      ['find-generic-password', '-a', account, '-s', service, '-w'],
      { encoding: 'utf-8', timeout: 5000 },
    ).trim();
  } catch (error) {
    throw new Error(
      `Failed to read from macOS Keychain (service: ${service}, account: ${account}). ` +
        `Run: security add-generic-password -a "${account}" -s "${service}" -w\n` +
        `Original error: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }
}

function readFromLinuxKeyring(
  execFn: KeychainDeps['execFileSync'],
  service: string,
  account: string,
): string {
  try {
    const result = execForKeychain(
      execFn,
      'secret-tool',
      ['lookup', 'service', service, 'account', account],
      { encoding: 'utf-8', timeout: 5000 },
    );
    return result.trim();
  } catch (error) {
    throw new Error(
      `Failed to read from Linux keyring (service: ${service}, account: ${account}). ` +
        `Ensure libsecret and secret-tool are installed.\n` +
        `Run: secret-tool store --label="${service}" service "${service}" account "${account}"\n` +
        `Original error: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }
}

function readFromWindowsCredentialManager(
  execFn: KeychainDeps['execFileSync'],
  service: string,
  account: string,
): string {
  try {
    const script = `
      $cred = Get-StoredCredential -Target "${service}\\${account}"
      if ($cred) {
        $ptr = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($cred.Password)
        try { [System.Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) }
        finally { [System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
      } else { Write-Error "Credential not found" }
    `;
    const result = execForKeychain(
      execFn,
      'powershell.exe',
      ['-NoProfile', '-Command', script],
      { encoding: 'utf-8', timeout: 5000 },
    );
    return result.trim();
  } catch (error) {
    throw new Error(
      `Failed to read from Windows Credential Manager (target: ${service}\\${account}). ` +
        `Run: cmdkey /generic:"${service}\\${account}" /user:"${account}" /pass\n` +
        `Original error: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }
}

function getFromKeychain(
  keyName: string,
  options: KeychainHandlerOptions,
  deps: KeychainDeps,
): string {
  const platform = options.platform === 'auto' || !options.platform
    ? detectPlatform(deps.platform)
    : options.platform;

  const service = options.servicePrefix ?? 'node-env-resolver';

  switch (platform) {
    case 'macos':
      return readFromMacOSKeychain(deps.execFileSync, service, keyName);
    case 'linux':
      return readFromLinuxKeyring(deps.execFileSync, service, keyName);
    case 'windows':
      return readFromWindowsCredentialManager(deps.execFileSync, service, keyName);
    default:
      throw new Error(`Unsupported platform for keychain handler: ${platform}`);
  }
}

export function createKeychainHandler(
  options: KeychainHandlerOptions = {},
  deps?: Partial<KeychainDeps>,
): ReferenceHandler {
  const runtime: KeychainDeps = { ...defaultKeychainDeps, ...(deps ?? {}) };
  const resolvedPlatform = options.platform === 'auto' || !options.platform
    ? detectPlatform(runtime.platform)
    : options.platform;

  return {
    name: `keychain-${resolvedPlatform}`,
    resolve(reference: string) {
      const match = KEYCHAIN_PATTERN.exec(reference);
      if (!match) {
        throw new Error(
          `Invalid keychain reference: "${reference}". ` +
            `Expected format: keychain://<key-name>`,
        );
      }

      const keyName = match[1]!;
      const value = getFromKeychain(
        keyName,
        { ...options, platform: resolvedPlatform },
        runtime,
      );

      return {
        value,
        resolvedVia: `keychain-${resolvedPlatform}`,
        metadata: {
          keyName,
          platform: resolvedPlatform,
          service: options.servicePrefix ?? 'node-env-resolver',
        },
      };
    },
    resolveSync(reference: string) {
      const match = KEYCHAIN_PATTERN.exec(reference);
      if (!match) {
        throw new Error(
          `Invalid keychain reference: "${reference}". ` +
            `Expected format: keychain://<key-name>`,
        );
      }

      const keyName = match[1]!;
      const value = getFromKeychain(
        keyName,
        { ...options, platform: resolvedPlatform },
        runtime,
      );

      return {
        value,
        resolvedVia: `keychain-${resolvedPlatform}`,
        metadata: {
          keyName,
          platform: resolvedPlatform,
          service: options.servicePrefix ?? 'node-env-resolver',
        },
      };
    },
  };
}

/** Pre-configured keychain handler using auto-detected platform */
export const keychainHandler = createKeychainHandler();
