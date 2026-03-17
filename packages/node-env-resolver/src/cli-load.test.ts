import { describe, it, expect, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { runLoadCommand } from './cli-load';

describe('cli load command', () => {
  it('emits flat env keys for nested configs in env format', async () => {
    const tmp = mkdtempSync(join(tmpdir(), 'ner-cli-load-'));
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

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    try {
      const code = await runLoadCommand(['--format=env']);
      expect(code).toBe(0);
      expect(logSpy).toHaveBeenCalledWith('APP__HOST=localhost');
      expect(logSpy).not.toHaveBeenCalledWith('APP=[object Object]');
    } finally {
      logSpy.mockRestore();
      process.chdir(prevCwd);
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('preserves structured values for direct schema keys when flattening nested configs', async () => {
    const tmp = mkdtempSync(join(tmpdir(), 'ner-cli-load-json-'));
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

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    try {
      const code = await runLoadCommand(['--format=env']);
      expect(code).toBe(0);
      expect(logSpy).toHaveBeenCalledWith('APP__HOST=localhost');
      expect(logSpy).toHaveBeenCalledWith(
        `FEATURE_FLAGS=${JSON.stringify({ beta: true })}`,
      );
      expect(logSpy).not.toHaveBeenCalledWith('FEATURE_FLAGS__BETA=true');
    } finally {
      logSpy.mockRestore();
      process.chdir(prevCwd);
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});
