import { describe, it, expect } from 'vitest';
import { resolve, safeResolve, EnvValidationError } from './index';
import { fromObject } from './resolvers';
import { port, enumOf, string } from './validators';

const schema = {
  PORT: port({ default: 8400 }),
  DD_SITE: enumOf(['datadoghq.com', 'datadoghq.eu'] as const),
  TOKEN: string(),
};
const env = { PORT: 'abc', DD_SITE: 'nope-secret', UNSET: undefined };

describe('validation errors', () => {
  it('prefixes every line with the key and never echoes the value', () => {
    let thrown: unknown;
    try {
      resolve({ resolvers: [[fromObject(env), schema]] });
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(EnvValidationError);
    const message = (thrown as Error).message;
    expect(message).toBe(
      'Environment validation failed:\n' +
        '  - PORT: Invalid port\n' +
        '  - DD_SITE: Invalid value. Allowed values: datadoghq.com, datadoghq.eu\n' +
        '  - TOKEN: Missing required environment variable',
    );
    expect(message).not.toContain('abc');
    expect(message).not.toContain('nope-secret');
  });

  it('exposes structured issues from safeResolve', () => {
    const result = safeResolve({ resolvers: [[fromObject(env), schema]] });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.issues).toEqual([
      { key: 'PORT', reason: 'invalid', message: 'Invalid port' },
      {
        key: 'DD_SITE',
        reason: 'invalid',
        message: 'Invalid value. Allowed values: datadoghq.com, datadoghq.eu',
      },
      {
        key: 'TOKEN',
        reason: 'missing',
        message: 'Missing required environment variable',
      },
    ]);
  });
});

describe('fromObject', () => {
  it('resolves from a plain object and skips undefined', () => {
    const config = resolve({
      resolvers: [[fromObject({ TOKEN: 't', UNSET: undefined }), { TOKEN: string(), UNSET: string({ optional: true }) }]],
    });
    expect(config).toEqual({ TOKEN: 't', UNSET: undefined });
  });
});
