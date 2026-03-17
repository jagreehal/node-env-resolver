import { describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { runRunCommand } from './cli-run';

describe('cli run command', () => {
  it('injects flat env keys instead of stringifying nested objects', async () => {
    const tmp = mkdtempSync(join(tmpdir(), 'ner-cli-run-'));
    const prevCwd = process.cwd();
    process.chdir(tmp);

    writeFileSync(
      join(tmp, 'env.config.mjs'),
      [
        'export default {',
        '  schema: {',
        "    APP__HOST: 'fallback',",
        '  },',
        '  resolvers: [',
        '    [{',
        "      name: 'inline',",
        "      async load() { return { APP__HOST: 'localhost' }; },",
        "      loadSync() { return { APP__HOST: 'localhost' }; }",
        '    }, {}]',
        '  ],',
        "  options: { nestedDelimiter: '__' }",
        '};',
        '',
      ].join('\n'),
      'utf8',
    );

    try {
      const code = await runRunCommand([
        '--',
        'node',
        '-e',
        "process.exit(process.env.APP__HOST === 'localhost' && process.env.APP === undefined ? 0 : 1)",
      ]);

      expect(code).toBe(0);
    } finally {
      process.chdir(prevCwd);
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('keeps direct json-valued schema keys intact when nestedDelimiter is enabled', async () => {
    const tmp = mkdtempSync(join(tmpdir(), 'ner-cli-run-json-'));
    const prevCwd = process.cwd();
    process.chdir(tmp);

    writeFileSync(
      join(tmp, 'env.config.mjs'),
      [
        'const jsonValidator = Object.assign((value) => JSON.parse(value), { __meta: { type: "json" } });',
        'export default {',
        '  schema: {',
        "    APP__HOST: 'fallback',",
        '    FEATURE_FLAGS: jsonValidator,',
        '  },',
        '  resolvers: [',
        '    [{',
        "      name: 'inline',",
        '      async load() {',
        `        return { APP__HOST: 'localhost', FEATURE_FLAGS: '${JSON.stringify({ beta: true })}' };`,
        '      },',
        '      loadSync() {',
        `        return { APP__HOST: 'localhost', FEATURE_FLAGS: '${JSON.stringify({ beta: true })}' };`,
        '      }',
        '    }, {}]',
        '  ],',
        "  options: { nestedDelimiter: '__' }",
        '};',
        '',
      ].join('\n'),
      'utf8',
    );

    try {
      const code = await runRunCommand([
        '--',
        'node',
        '-e',
        `process.exit(process.env.APP__HOST === 'localhost' && process.env.FEATURE_FLAGS === '${JSON.stringify({ beta: true })}' && process.env.FEATURE_FLAGS__BETA === undefined ? 0 : 1)`,
      ]);

      expect(code).toBe(0);
    } finally {
      process.chdir(prevCwd);
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});
