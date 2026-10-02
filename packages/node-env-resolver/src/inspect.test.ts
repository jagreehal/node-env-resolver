import { afterEach, describe, expect, it } from 'vitest';
import { resolve, resolveAsync } from './index';
import { fromObject } from './process-env';
import {
  secret,
  string,
  url,
  port,
  postgres,
  oneOf,
  boolean,
  number,
  custom,
  file,
  json,
  withMeta,
} from './validators';
import { describeSchema, fakeEnv, checkEnv, toDotenvExample } from './inspect';
import { createDebugView } from './debug';
import { extractSensitiveValues, createRedactor } from './runtime/redactor';
import { mkdtempSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { clearSensitiveValues, isSensitiveValue } from './sensitivity';
import { withComputed } from './utils';

const schema = {
  SERVICE_CONFIG: secret(), // name heuristic would miss this
  API_URL: withMeta(url(), { description: 'Upstream API' }),
  PORT: port({ default: 3000 }),
  DATABASE_URL: postgres(),
  NODE_ENV: oneOf(['development', 'production'] as const),
  DEBUG: boolean({ optional: true }),
  NAME: 'app',
};

afterEach(() => clearSensitiveValues());

describe('sensitivity metadata', () => {
  it('debug masks a field that precedes the file() secret it contains', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ner-file-'));
    writeFileSync(join(dir, 'pw'), 'file-secret-123');
    const entries: Array<{ key: string; sensitive: boolean; preview: string | null }> = [];
    resolve({
      resolvers: [
        [
          fromObject({ CONN: 'postgres://u:file-secret-123@db/app', PW_FILE: join(dir, 'pw') }),
          { CONN: string(), PW_FILE: file() },
        ],
      ],
      options: { debug: { enabled: true, valueMode: 'masked', onDebugEntry: (e) => entries.push(e) } },
    });
    const conn = entries.find((e) => e.key === 'CONN')!;
    expect(conn.sensitive).toBe(true);
    expect(conn.preview).not.toContain('file-secret');
  });

  it('debug masks explicitly sensitive inputs whose form changes on coercion', () => {
    const entries: Array<{ key: string; sensitive: boolean; preview: string | null }> = [];
    resolve({
      resolvers: [
        [
          fromObject({ CFG: '{ "pin": "4829" }', PIN: '00004829' }),
          { CFG: withMeta(json(), { sensitive: true }), PIN: withMeta(number(), { sensitive: true }) },
        ],
      ],
      options: { debug: { enabled: true, valueMode: 'masked', onDebugEntry: (e) => entries.push(e) } },
    });
    for (const e of entries) {
      expect(e.sensitive).toBe(true);
      expect(e.preview).not.toContain('4829');
    }
    expect(isSensitiveValue('00004829')).toBe(true);
    expect(entries).toHaveLength(2);
  });

  it('debug masks a rejected credential copied into another field (sync and async)', async () => {
    type Entry = { key: string; sensitive: boolean; preview: string | null };
    const env = { SERVICE_CONFIG: 'rejected-cred-777', DISPLAY: 'shown rejected-cred-777' };
    const schema = {
      DISPLAY: string(),
      SERVICE_CONFIG: withMeta(string({ pattern: '^ok-' }), { sensitive: true }),
    };
    const debug = (entries: Entry[]) => ({
      enabled: true,
      valueMode: 'masked' as const,
      onDebugEntry: (e: Entry) => entries.push(e),
    });

    const syncEntries: Entry[] = [];
    expect(() =>
      resolve({ resolvers: [[fromObject(env), schema]], options: { debug: debug(syncEntries) } }),
    ).toThrow(/SERVICE_CONFIG/);
    clearSensitiveValues();
    const asyncEntries: Entry[] = [];
    await expect(
      resolveAsync({ resolvers: [[fromObject(env), schema]], options: { debug: debug(asyncEntries) } }),
    ).rejects.toThrow(/SERVICE_CONFIG/);

    for (const entries of [syncEntries, asyncEntries]) {
      const display = entries.find((e) => e.key === 'DISPLAY')!;
      expect(display.sensitive).toBe(true);
      expect(display.preview).not.toContain('rejected-cred');
    }
  });

  it('runtime redaction covers sensitive numbers and json objects', () => {
    const config = resolve({
      resolvers: [
        [
          fromObject({ PIN: '482913', CREDS: '{"user":"svc","pass":"json-secret-1"}' }),
          { PIN: withMeta(number(), { sensitive: true }), CREDS: withMeta(json(), { sensitive: true }) },
        ],
      ],
    });
    const sensitive = extractSensitiveValues(config);
    expect([...sensitive.values()]).toEqual(expect.arrayContaining(['482913', 'json-secret-1']));
    const redactor = createRedactor(sensitive);
    expect(redactor.redactObject({ pin: config.PIN, note: 'pass=json-secret-1' })).toEqual({
      pin: '[REDACTED]',
      note: 'pass=[REDACTED]',
    });
  });

  it('debug output masks a derived value that precedes its secret in the schema', () => {
    const entries: Array<{ key: string; sensitive: boolean; preview: string | null }> = [];
    resolve({
      resolvers: [
        [
          fromObject({ CONN: 'postgres://u:p4ssw0rd-xyz@db/app', DB_PASS: 'p4ssw0rd-xyz' }),
          { CONN: string(), DB_PASS: secret() },
        ],
      ],
      options: { debug: { enabled: true, valueMode: 'masked', onDebugEntry: (e) => entries.push(e) } },
    });
    const conn = entries.find((e) => e.key === 'CONN')!;
    expect(conn.sensitive).toBe(true);
    expect(conn.preview).not.toContain('p4ssw0rd');
  });

  it('secret() marks values sensitive regardless of key name', () => {
    const config = resolve({
      resolvers: [
        [fromObject({ SERVICE_CONFIG: 'hunter2-value', REGION: 'eu' }), { SERVICE_CONFIG: secret(), REGION: string() }],
      ],
    });
    expect(isSensitiveValue(config.SERVICE_CONFIG)).toBe(true);
    expect(isSensitiveValue(config.REGION)).toBe(false);

    const [entry] = createDebugView(
      { SERVICE_CONFIG: config.SERVICE_CONFIG },
      {},
      { valueMode: 'masked' },
    );
    expect(entry!.sensitive).toBe(true);
    expect(entry!.preview).not.toBe('hunter2-value');

    expect(extractSensitiveValues(config).has('SERVICE_CONFIG')).toBe(true);
    expect(extractSensitiveValues(config).has('REGION')).toBe(false);
  });

  it('values derived from a secret are sensitive', () => {
    const config = resolve({
      resolvers: [[fromObject({ DB_PASS: 'p4ssw0rd-xyz', HOST: 'db' }), { DB_PASS: secret(), HOST: string() }]],
    });
    const withUrl = withComputed(config, {
      CONN: (c) => `postgres://u:${c.DB_PASS}@${c.HOST}/app`,
    });
    expect(isSensitiveValue(withUrl.CONN)).toBe(true);
    expect(extractSensitiveValues(withUrl).has('CONN')).toBe(true);
  });
});

describe('describeSchema', () => {
  it('describes without values and hides sensitive defaults', () => {
    const d = describeSchema({ ...schema, JWT: secret({ default: 'real-fallback' }) });
    const byKey = Object.fromEntries(d.map((x) => [x.key, x]));
    expect(byKey.SERVICE_CONFIG).toMatchObject({ type: 'secret', required: true, sensitive: 'explicit' });
    expect(byKey.API_URL).toMatchObject({ type: 'url', description: 'Upstream API' });
    expect(byKey.PORT).toMatchObject({ required: false, default: '3000' });
    expect(byKey.DATABASE_URL!.sensitive).toBe('explicit');
    expect(byKey.NODE_ENV!.enum).toEqual(['development', 'production']);
    expect(byKey.JWT!.default).toBeUndefined();
    expect(JSON.stringify(d)).not.toContain('real-fallback');
  });

  it('fakeEnv throws when it cannot satisfy constraints, and accepts explicit examples', () => {
    expect(() => fakeEnv({ RETRIES: number({ min: 10 }) })).toThrow(/RETRIES.*withMeta/s);
    expect(fakeEnv({ RETRIES: withMeta(number({ min: 10 }), { example: '12' }) })).toEqual({ RETRIES: '12' });
  });

  it('fakeEnv produces config that passes validation', () => {
    expect(() => resolve({ resolvers: [[fromObject(fakeEnv(schema)), schema]] })).not.toThrow();
    expect(toDotenvExample(schema)).toContain('# Upstream API | url | required\nAPI_URL=https://example.com');
  });
});

describe('checkEnv', () => {
  it('never echoes values from custom validator errors', () => {
    const result = checkEnv(
      { MODE: custom((v) => { throw new Error(`invalid ${v}`); }), LEVEL: oneOf(['a', 'b'] as const) },
      { MODE: 'leaky-value', LEVEL: 'c' },
    );
    expect(JSON.stringify(result)).not.toContain('leaky');
    expect(result.issues[1]!.message).toBe('Value does not pass oneOf validation; expected one of: a, b');
  });

  it('reports missing file() vars unless a secrets dir will supply them', () => {
    expect(checkEnv({ CERT: file() }, {}).issues).toMatchObject([{ key: 'CERT', code: 'missing' }]);
    expect(checkEnv({ CERT: file() }, {}, { secretsDir: '/run/secrets' })).toMatchObject({
      ok: true,
      deferred: [{ key: 'CERT', scheme: 'secrets-dir' }],
    });
  });

  it('reports issues without leaking values and defers references', () => {
    const result = checkEnv(schema, {
      SERVICE_CONFIG: 'aws-sm://prod/config',
      API_URL: 'not a url',
      DATABASE_URL: 'mysql://leaky-secret@host',
      NODE_ENV: 'production',
    });
    expect(result.ok).toBe(false);
    expect(result.deferred).toEqual([{ key: 'SERVICE_CONFIG', scheme: 'aws-sm' }]);
    expect(result.issues).toEqual([
      { key: 'API_URL', code: 'invalid', message: 'Value does not pass url validation', sensitive: false },
      { key: 'DATABASE_URL', code: 'invalid', message: 'Value does not pass postgres validation', sensitive: true },
    ]);
    expect(JSON.stringify(result)).not.toContain('leaky');
  });

  it('flags missing required vars only', () => {
    const result = checkEnv(schema, { ...fakeEnv(schema), DATABASE_URL: undefined, PORT: undefined });
    expect(result.issues).toEqual([
      { key: 'DATABASE_URL', code: 'missing', message: 'Missing required variable', sensitive: true },
    ]);
  });
});
