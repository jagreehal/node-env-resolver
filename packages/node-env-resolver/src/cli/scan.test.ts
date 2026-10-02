import { describe, expect, it } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { execFileSync } from 'child_process';
import { scanContent, scanDirectory, scanStaged } from './scan';

const GH = `ghp_${'a'.repeat(36)}`;
const opts = { ignorePatterns: [], showContext: true };

describe('scanner', () => {
  it('never includes secret fragments, even with context', () => {
    const findings = scanContent(`const t = "${GH}"; password = "hunter2hunter2"`, 'x.ts', true);
    expect(findings.map((f) => f.type).sort()).toEqual(['github-token', 'potential-secret']);
    const out = JSON.stringify(findings);
    expect(out).not.toContain('aaaa');
    expect(out).not.toContain('hunter2');
    expect(findings[0]!.context).toBe('const t = "[REDACTED]"; password = "[REDACTED]"');
  });

  it('scans dotfiles like .env.local but skips .git', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ner-scan-'));
    writeFileSync(join(dir, '.env.local'), `TOKEN=${GH}\n`);
    mkdirSync(join(dir, '.git'));
    writeFileSync(join(dir, '.git', 'config'), `TOKEN=${GH}\n`);
    expect(scanDirectory(dir, opts).map((f) => f.file)).toEqual([join(dir, '.env.local')]);
  });

  it('--staged scans the staged blob, not the working tree', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ner-staged-'));
    const git = (...a: string[]) => execFileSync('git', a, { cwd: dir });
    git('init', '-q');
    writeFileSync(join(dir, 'a.ts'), `const t = "${GH}";\n`);
    git('add', 'a.ts');
    writeFileSync(join(dir, 'a.ts'), 'const t = process.env.T;\n'); // cleaned, but not staged
    expect(scanStaged(opts, dir)).toMatchObject([{ file: 'a.ts', type: 'github-token' }]);
  });
});
