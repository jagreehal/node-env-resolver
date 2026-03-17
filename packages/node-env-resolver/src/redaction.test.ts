import { describe, it, expect, vi, afterEach } from 'vitest';
import { resolve } from './index';
import { string, sensitive, number } from './validators';
import {
  getSensitiveKeys,
  getSensitiveValues,
  redactString,
  createRedactor,
  redactSensitiveConfig,
  patchGlobalConsole,
  reveal,
  REVEAL_SYMBOL,
} from './redaction';

function makeConfig(env: Record<string, string>) {
  const original = { ...process.env };
  Object.assign(process.env, env);
  try {
    return resolve({
      API_KEY: sensitive(string()),
      DB_PASSWORD: string({ sensitive: true }),
      PORT: number({ default: 3000 }),
      APP_NAME: string({ default: 'test' }),
    });
  } finally {
    for (const key of Object.keys(env)) {
      if (original[key] === undefined) delete process.env[key];
      else process.env[key] = original[key];
    }
  }
}

describe('redaction', () => {
  const config = makeConfig({
    API_KEY: 'sk-live-abc123xyz',
    DB_PASSWORD: 'supersecretpass',
  });

  describe('getSensitiveKeys', () => {
    it('returns sensitive keys from resolved config', () => {
      const keys = getSensitiveKeys(config);
      expect(keys).toBeInstanceOf(Set);
      expect(keys.has('API_KEY')).toBe(true);
      expect(keys.has('DB_PASSWORD')).toBe(true);
      expect(keys.has('PORT')).toBe(false);
      expect(keys.has('APP_NAME')).toBe(false);
    });

    it('returns empty set for plain objects', () => {
      const keys = getSensitiveKeys({ foo: 'bar' });
      expect(keys.size).toBe(0);
    });
  });

  describe('getSensitiveValues', () => {
    it('returns map of sensitive key to string value', () => {
      const values = getSensitiveValues(config);
      expect(values.get('API_KEY')).toBe('sk-live-abc123xyz');
      expect(values.get('DB_PASSWORD')).toBe('supersecretpass');
      expect(values.has('PORT')).toBe(false);
    });
  });

  describe('redactString', () => {
    it('masks string showing first 2 chars by default', () => {
      expect(redactString('secret123')).toBe('se*****');
    });

    it('masks short strings entirely', () => {
      expect(redactString('ab')).toBe('**');
      expect(redactString('a')).toBe('*');
    });

    it('respects showChars parameter', () => {
      expect(redactString('secret123', 4)).toBe('secr*****');
      expect(redactString('secret123', 0)).toBe('*****');
    });
  });

  describe('createRedactor', () => {
    it('redacts sensitive values in strings', () => {
      const redact = createRedactor(config);
      expect(redact('The key is sk-live-abc123xyz')).toBe('The key is sk*****');
    });

    it('redacts multiple sensitive values', () => {
      const redact = createRedactor(config);
      const input = 'key=sk-live-abc123xyz pass=supersecretpass';
      const result = redact(input) as string;
      expect(result).not.toContain('sk-live-abc123xyz');
      expect(result).not.toContain('supersecretpass');
    });

    it('redacts values in arrays', () => {
      const redact = createRedactor(config);
      const result = redact(['hello', 'sk-live-abc123xyz', 42]) as unknown[];
      expect(result[0]).toBe('hello');
      expect(result[1]).not.toContain('sk-live-abc123xyz');
      expect(result[2]).toBe(42);
    });

    it('redacts values in objects', () => {
      const redact = createRedactor(config);
      const result = redact({ key: 'sk-live-abc123xyz', port: 3000 }) as Record<string, unknown>;
      expect(result.key).not.toContain('sk-live-abc123xyz');
      expect(result.port).toBe(3000);
    });

    it('passes through non-string primitives', () => {
      const redact = createRedactor(config);
      expect(redact(42)).toBe(42);
      expect(redact(true)).toBe(true);
      expect(redact(null)).toBe(null);
      expect(redact(undefined)).toBe(undefined);
    });

    it('skips revealed values', () => {
      const redact = createRedactor(config);
      const revealed = reveal('sk-live-abc123xyz');
      expect(redact(revealed)).toBe('sk-live-abc123xyz');
    });
  });

  describe('redactSensitiveConfig', () => {
    it('is a convenience wrapper around createRedactor', () => {
      const result = redactSensitiveConfig('The key is sk-live-abc123xyz', config);
      expect(result).toBe('The key is sk*****');
    });
  });

  describe('reveal', () => {
    it('wraps value with REVEAL_SYMBOL', () => {
      const r = reveal('secret');
      expect(r[REVEAL_SYMBOL]).toBe(true);
      expect(r.value).toBe('secret');
    });
  });

  describe('patchGlobalConsole', () => {
    afterEach(() => {
      // Clean up any remaining patches
      delete (globalThis as Record<symbol, unknown>)[Symbol.for('node-env-resolver:consolePatchedBy')];
    });

    it('patches console.log to redact sensitive values', () => {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const unpatch = patchGlobalConsole(config);

      console.log('Key:', 'sk-live-abc123xyz');

      expect(spy).toHaveBeenCalledWith('Key:', 'sk*****');

      unpatch();
      spy.mockRestore();
    });

    it('returns unpatch function that restores originals', () => {
      const originalLog = console.log;
      const unpatch = patchGlobalConsole(config);
      expect(console.log).not.toBe(originalLog);
      unpatch();
      // After unpatch, should be restored
    });

    it('prevents double-patching', () => {
      const unpatch1 = patchGlobalConsole(config);
      const patchedLog = console.log;
      const unpatch2 = patchGlobalConsole(config);
      expect(console.log).toBe(patchedLog); // Same patched function
      unpatch2(); // no-op
      unpatch1();
    });
  });
});
