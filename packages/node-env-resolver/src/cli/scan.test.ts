import { describe, expect, it } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { execFileSync } from 'child_process';
import { scanContent, scanDirectory, scanStaged } from './scan.js';

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

  it('ignores code expressions, flags string literals and unquoted .env values', () => {
    const code = [
      'password: z.string().min(12),',
      'secret: options.secretValue,',
      'tokenUrl: "https://example.com/oauth/token",',
      'apiKey: "abcdefghijkl",',
    ].join('\n');
    expect(scanContent(code, 'config.ts', false).map((f) => f.line)).toEqual([4]);
    expect(scanContent('API_KEY=abcdefghijkl', '.env', false)).toHaveLength(1);
  });

  it('skips reference URIs in .env and code', () => {
    const env = [
      'JWT_SECRET=aws-sm://api-v2/jwt-secret',
      'API_TOKEN=process-env://OTHER_TOKEN',
      'DB_PASSWORD=op://vault/db/password',
      'SECRET=unknownscheme://abcdefghi',
    ].join('\n');
    expect(scanContent(env, '.env', false).map((f) => f.line)).toEqual([4]);
    expect(scanContent("jwtSecret: 'aws-ssm:///api/jwt',", 'config.ts', false)).toEqual([]);
  });

  it('skips placeholders and code shown in docs', () => {
    const doc = [
      'DATABASE_URL=postgres://user:password@localhost:5432/app',
      '`postgres://${c.DB_USER}:${c.DB_PASSWORD}@${c.DB_HOST}/app`',
      'AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE',
      'API_KEY: string({optional:true})',
      'API_KEY: undefined',
      'DATABASE_URL=postgres://admin:s3cretpass@db.internal:5432/app',
    ].join('\n');
    expect(scanContent(doc, 'README.md', false).map((f) => f.line)).toEqual([6]);
  });

  it('matches AWS example keys exactly', () => {
    const lines = ['AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE', "password: 'EXAMPLEbutreal12345'"].join('\n');
    expect(scanContent(lines, 'config.ts', false).map((f) => f.line)).toEqual([2]);
  });

  it('skips prose in .env comments but still finds tokens there', () => {
    const env = ['# no DD_API_KEY: autotel-devtools sends traces', `# OLD=${GH}`].join('\n');
    expect(scanContent(env, '/app/.env.example', false)).toMatchObject([{ line: 2, type: 'github-token' }]);
  });

  it('passes the .env.example that ner describe writes', () => {
    const env = [
      '# no DD_API_KEY: autotel-devtools sends traces locally',
      '# custom | optional | sensitive',
      'DD_API_KEY=fake-dd-api-key',
      'DATABASE_URL=postgres://user:password@localhost:5432/app',
    ].join('\n');
    expect(scanContent(env, '.env.example', false)).toEqual([]);
  });

  it('skips lines marked ner-scan-ignore', () => {
    const findings = scanContent(`apiKey: "abcdefghijkl", // ner-scan-ignore\nt = "${GH}"`, 'x.ts', false);
    expect(findings).toMatchObject([{ line: 2, type: 'github-token' }]);
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
