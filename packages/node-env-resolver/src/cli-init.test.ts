import { describe, it, expect } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { runInitCommand } from './cli-init';

describe('cli init command', () => {
  it('creates a default env.config.mjs when none exists', async () => {
    const tmp = mkdtempSync(join(tmpdir(), 'ner-cli-init-'));
    const prevCwd = process.cwd();
    process.chdir(tmp);

    try {
      const code = await runInitCommand([]);
      expect(code).toBe(0);

      const configPath = join(tmp, 'env.config.mjs');
      const contents = readFileSync(configPath, 'utf8');
      expect(contents).toContain('schema: {');
      expect(contents).toContain('NODE_ENV');
      expect(contents).toContain('PORT: number({ default: 3000 })');
    } finally {
      process.chdir(prevCwd);
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});

