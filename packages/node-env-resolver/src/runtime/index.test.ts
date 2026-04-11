import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  protect,
  patchGlobalConsole,
  createConsoleRedactor,
  extractSensitiveValues,
  createRedactor,
  createResponseMiddleware,
  scanBodyForSecrets,
} from './index';

// ─── extractSensitiveValues ───────────────────────────────────────────────────

describe('extractSensitiveValues', () => {
  it('extracts values from sensitive keys', () => {
    const config = {
      DATABASE_URL: 'postgres://user:pass@localhost/db',
      API_KEY: 'sk_test_123',
      SECRET_TOKEN: 'secret-value',
      PORT: 3000,
    };

    const values = extractSensitiveValues(config);

    expect(values.has('DATABASE_URL')).toBe(true);
    expect(values.has('API_KEY')).toBe(true);
    expect(values.has('SECRET_TOKEN')).toBe(true);
    expect(values.has('PORT')).toBe(false);
  });

  it('only extracts string values', () => {
    const config = {
      API_KEY: 'secret-key',
      SECRET_PORT: 3000,
      TOKEN: { nested: 'value' },
    };

    const values = extractSensitiveValues(config);

    expect(values.get('API_KEY')).toBe('secret-key');
    expect(values.has('SECRET_PORT')).toBe(false);
    expect(values.has('TOKEN')).toBe(false);
  });

  it('respects custom sensitive key patterns', () => {
    const config = {
      CUSTOM_SECRET: 'custom-value',
      NORMAL_VAR: 'normal-value',
    };

    const values = extractSensitiveValues(config, {
      sensitiveKeys: ['CUSTOM'],
    });

    expect(values.has('CUSTOM_SECRET')).toBe(true);
    expect(values.has('NORMAL_VAR')).toBe(false);
  });

  it('extracts DATABASE_URL, DB_URL, CONNECTION_STRING, and DSN', () => {
    const config = {
      DATABASE_URL: 'postgres://host/db',
      DB_URL: 'postgres://host/db2',
      DSN: 'some-dsn',
      CONNECTION_STRING: 'conn-string',
    };

    const values = extractSensitiveValues(config);

    expect(values.has('DATABASE_URL')).toBe(true);
    expect(values.has('DB_URL')).toBe(true);
    expect(values.has('DSN')).toBe(true);
    expect(values.has('CONNECTION_STRING')).toBe(true);
  });
});

// ─── createRedactor ───────────────────────────────────────────────────────────

describe('createRedactor', () => {
  it('redacts exact secret values', () => {
    const secrets = new Map([['API_KEY', 'sk_live_abc123']]);
    const redactor = createRedactor(secrets);

    expect(redactor.redactString('The key is sk_live_abc123')).toBe(
      'The key is [REDACTED]',
    );
  });

  it('redacts known secret patterns', () => {
    const redactor = createRedactor(new Map());

    expect(
      redactor.redactString('Key: sk_test_FAKE000000000000000000000000'),
    ).toBe('Key: [REDACTED]');
  });

  it('redacts database connection strings', () => {
    // Exact value match: full URL replaced when in secrets Map
    const secrets = new Map([
      ['DATABASE_URL', 'postgres://admin:password123@localhost:5432/mydb'],
    ]);
    const redactor = createRedactor(secrets);

    expect(
      redactor.redactString('postgres://admin:password123@localhost:5432/mydb'),
    ).toBe('[REDACTED]');
  });

  it('redacts credential portion of connection strings by pattern', () => {
    // Pattern-only match (no secrets Map): strips user:pass@ from the URL
    const redactor = createRedactor(new Map());

    const result = redactor.redactString(
      'postgres://admin:password123@localhost:5432/mydb',
    );
    expect(result).toBe('[REDACTED]localhost:5432/mydb');
  });

  it('masks values correctly', () => {
    const redactor = createRedactor(new Map());

    expect(redactor.maskValue('ab')).toBe('****');
    expect(redactor.maskValue('abc')).toBe('****');
    expect(redactor.maskValue('abcdef')).toBe('a****f');
    expect(redactor.maskValue('abcdefghij')).toBe('ab****ij');
    expect(redactor.maskValue('abcdefghijklmnop')).toBe('ab****op');
    expect(redactor.maskValue('abcdefghijklmnopqrst')).toBe('abcd...qrst');
  });

  it('creates deterministic fingerprints', () => {
    const redactor = createRedactor(new Map());

    const fp1 = redactor.createFingerprint('secret123');
    expect(fp1).toMatch(/^sha256:[a-f0-9]{8}$/);
    expect(fp1).toBe(redactor.createFingerprint('secret123'));
    expect(fp1).not.toBe(redactor.createFingerprint('different-secret'));
  });

  it('redacts objects deeply', () => {
    const secrets = new Map([
      ['API_KEY', 'my-secret'],
      ['SECRET_TOKEN', 'my-secret'],
    ]);
    const redactor = createRedactor(secrets);

    const obj = {
      name: 'app',
      config: {
        apiKey: 'other-value',
        nested: { token: 'my-secret' },
      },
      array: ['my-secret', 'public'],
    };

    const redacted = redactor.redactObject(obj) as typeof obj;

    expect(redacted.config.apiKey).toBe('[REDACTED]');
    expect(redacted.config.nested.token).toBe('[REDACTED]');
    expect(redacted.array[0]).toBe('[REDACTED]');
    expect(redacted.name).toBe('app');
    expect(redacted.array[1]).toBe('public');
  });

  it('handles circular references', () => {
    const redactor = createRedactor(new Map());
    const obj: Record<string, unknown> = { name: 'test' };
    obj.self = obj;

    const redacted = redactor.redactObject(obj) as Record<string, unknown>;
    expect(redacted.self).toBe('[Circular]');
  });

  it('redacts strings nested inside objects', () => {
    const secrets = new Map([['SECRET', 'hidden']]);
    const redactor = createRedactor(secrets);

    const obj = {
      message: 'The secret is hidden',
      nested: { text: 'hidden is the secret' },
    };

    const redacted = redactor.redactObject(obj) as typeof obj;
    expect(redacted.message).toBe('The secret is [REDACTED]');
    expect(redacted.nested.text).toBe('[REDACTED] is the secret');
  });
});

// ─── createConsoleRedactor ────────────────────────────────────────────────────

describe('createConsoleRedactor', () => {
  it('creates a redact function', () => {
    const config = { API_KEY: 'secret-key' };
    const redactor = createConsoleRedactor(config);

    const result = redactor.redact('The API key is secret-key');
    expect(result[0]).toBe('The API key is [REDACTED]');
  });

  it('handles multiple arguments', () => {
    const config = { API_KEY: 'secret' };
    const redactor = createConsoleRedactor(config);

    const result = redactor.redact('API:', 'secret', { key: 'secret' });
    expect(result[0]).toBe('API:');
    expect(result[1]).toBe('[REDACTED]');
    expect(result[2]).toEqual({ key: '[REDACTED]' });
  });
});

// ─── patchGlobalConsole ───────────────────────────────────────────────────────

describe('patchGlobalConsole', () => {
  let originalLog: typeof console.log;
  let originalError: typeof console.error;

  beforeEach(() => {
    // Clear any patch state that may have leaked from a previous test.
    // The implementation uses a plain string property, not a Symbol.
    delete (console as unknown as Record<string, unknown>)[
      '__nodeEnvResolverPatched'
    ];
    originalLog = console.log;
    originalError = console.error;
  });

  afterEach(() => {
    console.log = originalLog;
    console.error = originalError;
    delete (console as unknown as Record<string, unknown>)[
      '__nodeEnvResolverPatched'
    ];
  });

  it('patches console methods', () => {
    const config = { API_KEY: 'my-secret-key' };
    const messages: string[] = [];

    console.log = (...args: unknown[]) => {
      messages.push(args.map(String).join(' '));
    };

    const unpatch = patchGlobalConsole(config, { methods: ['log'] });

    console.log('API key:', 'my-secret-key');

    expect(messages).toHaveLength(1);
    expect(messages[0]).toBe('API key: [REDACTED]');

    unpatch();
  });

  it('returns no-op when disabled', () => {
    const unpatch = patchGlobalConsole(
      { API_KEY: 'secret' },
      { enabled: false },
    );
    expect(unpatch).toBeInstanceOf(Function);
    expect(unpatch()).toBeUndefined();
  });

  it('does not patch twice', () => {
    const config = { API_KEY: 'secret' };
    let callCount = 0;

    console.log = () => {
      callCount++;
    };

    const unpatch = patchGlobalConsole(config, { methods: ['log'] });
    patchGlobalConsole(config, { methods: ['log'] }); // second call is a no-op

    console.log('test');
    expect(callCount).toBe(1);

    unpatch();
  });

  it('restores original methods on unpatch', () => {
    const config = { API_KEY: 'secret' };
    const messages: string[] = [];

    const savedLog = console.log;
    console.log = (...args: unknown[]) => {
      messages.push(args.map(String).join(' '));
    };

    const unpatch = patchGlobalConsole(config, { methods: ['log'] });

    console.log('key:', 'secret');
    expect(messages[messages.length - 1]).toBe('key: [REDACTED]');

    unpatch();

    console.log('key:', 'secret');
    expect(messages[messages.length - 1]).toBe('key: secret');

    console.log = savedLog;
  });
});

// ─── protect ─────────────────────────────────────────────────────────────────

describe('protect', () => {
  let originalLog: typeof console.log;
  let originalError: typeof console.error;

  beforeEach(() => {
    delete (console as unknown as Record<string, unknown>)[
      '__nodeEnvResolverPatched'
    ];
    originalLog = console.log;
    originalError = console.error;
  });

  afterEach(() => {
    console.log = originalLog;
    console.error = originalError;
    delete (console as unknown as Record<string, unknown>)[
      '__nodeEnvResolverPatched'
    ];
  });

  it('patches console and returns unpatch', () => {
    const config = { API_KEY: 'top-secret' };
    const captured: string[] = [];

    console.log = (...args: unknown[]) =>
      captured.push(args.map(String).join(' '));

    const unprotect = protect(config);

    console.log('key is top-secret');
    expect(captured[0]).toBe('key is [REDACTED]');

    unprotect();

    console.log('key is top-secret');
    expect(captured[1]).toBe('key is top-secret');
  });

  it('returns no-op when console: false', () => {
    const unprotect = protect({ API_KEY: 'secret' }, { console: false });
    expect(typeof unprotect).toBe('function');
    expect(unprotect()).toBeUndefined();
  });

  it('forwards console options', () => {
    const config = { API_KEY: 'secret' };
    const captured: string[] = [];

    console.log = (...args: unknown[]) => captured.push(args.join(' '));

    // Only patch warn, not log
    const unprotect = protect(config, { console: { methods: ['warn'] } });

    console.log('secret'); // not patched
    expect(captured[0]).toBe('secret');

    unprotect();
  });
});

// ─── createResponseMiddleware ─────────────────────────────────────────────────

describe('createResponseMiddleware', () => {
  it('redacts secrets in response body (mode: redact)', () => {
    const config = { API_KEY: 'super-secret' };
    const middleware = createResponseMiddleware(config, { mode: 'redact' });

    let writtenBody = '';
    const res = {
      end: (...args: unknown[]) => {
        writtenBody = args[0] as string;
      },
      getHeader: () => 'application/json',
    };

    middleware(null, res, () => {});
    res.end('{"key":"super-secret","name":"app"}');

    expect(writtenBody).toBe('{"key":"[REDACTED]","name":"app"}');
  });

  it('warns and passes original body through (mode: warn)', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const config = { API_KEY: 'super-secret' };
    const middleware = createResponseMiddleware(config, { mode: 'warn' });

    let writtenBody = '';
    const res = {
      end: (...args: unknown[]) => {
        writtenBody = args[0] as string;
      },
      getHeader: () => 'application/json',
    };

    middleware(null, res, () => {});
    res.end('value: super-secret');

    expect(warnSpy).toHaveBeenCalled();
    expect(writtenBody).toBe('value: super-secret'); // original passed through
    warnSpy.mockRestore();
  });

  it('throws when secret found (mode: throw)', () => {
    const config = { API_KEY: 'super-secret' };
    const middleware = createResponseMiddleware(config, { mode: 'throw' });

    const res: { end: (...args: unknown[]) => void; getHeader: () => string } =
      {
        end: () => {},
        getHeader: () => 'application/json',
      };

    middleware(null, res, () => {});
    expect(() => res.end('value: super-secret')).toThrow(
      'Secret leak detected',
    );
  });

  it('skips binary content types', () => {
    const config = { API_KEY: 'super-secret' };
    const middleware = createResponseMiddleware(config, { mode: 'throw' });

    let written = '';
    const res = {
      end: (...args: unknown[]) => {
        written = args[0] as string;
      },
      getHeader: () => 'image/png',
    };

    middleware(null, res, () => {});
    res.end('super-secret'); // would throw if scanned
    expect(written).toBe('super-secret');
  });

  it('calls next()', () => {
    const middleware = createResponseMiddleware({ API_KEY: 'secret' });
    const next = vi.fn();
    middleware(null, { end: () => {}, getHeader: () => '' }, next);
    expect(next).toHaveBeenCalledTimes(1);
  });
});

// ─── scanBodyForSecrets ───────────────────────────────────────────────────────

describe('scanBodyForSecrets', () => {
  it('returns safe: true when no secrets', () => {
    const result = scanBodyForSecrets('hello world', { API_KEY: 'secret' });
    expect(result.safe).toBe(true);
  });

  it('returns safe: false with redacted body when secret found', () => {
    const config = { API_KEY: 'my-secret-value' };
    const result = scanBodyForSecrets('key: my-secret-value', config);
    expect(result.safe).toBe(false);
    expect(result.redacted).toBe('key: [REDACTED]');
  });

  it('returns safe: true for non-string/buffer bodies', () => {
    const result = scanBodyForSecrets({ key: 'value' }, { API_KEY: 'secret' });
    expect(result.safe).toBe(true);
  });
});
