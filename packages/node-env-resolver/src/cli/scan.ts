/**
 * Secret scanner used by `ner scan` and `ner run --scan`.
 * Findings never contain secret values or fragments of them.
 */

import { readFileSync, readdirSync, statSync } from 'fs';
import { join, extname } from 'path';
import { execFileSync } from 'child_process';

const SECRET_PATTERNS: Array<{ pattern: RegExp; type: string }> = [
  { pattern: /sk_(live|test)_[a-zA-Z0-9]{24,}/g, type: 'stripe-key' },
  { pattern: /pk_(live|test)_[a-zA-Z0-9]{24,}/g, type: 'stripe-key' },
  { pattern: /xox[baprs]-[a-zA-Z0-9-]+/g, type: 'slack-token' },
  { pattern: /gh[pousr]_[a-zA-Z0-9]{36}/g, type: 'github-token' },
  {
    pattern: /eyJ[a-zA-Z0-9_-]*\.eyJ[a-zA-Z0-9_-]*\.[a-zA-Z0-9_-]*/g,
    type: 'jwt-token',
  },
  {
    pattern: /(postgres(ql)?|mysql|mongodb(\+srv)?|rediss?|amqps?):\/\/[^:\s/]+:[^@\s]+@/g,
    type: 'connection-string',
  },
  { pattern: /AKIA[0-9A-Z]{16}/g, type: 'aws-access-key' },
  {
    pattern: /aws_secret_access_key["']?\s*[:=]\s*["']?[A-Za-z0-9/+=]{40}/gi,
    type: 'aws-secret-key',
  },
  {
    pattern: /-----BEGIN (RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/g,
    type: 'private-key',
  },
];

const KV_PATTERN =
  /(password|secret|token|api[_-]?key)["']?\s*[:=]\s*["']?([^"'\s,}]{9,})/gi;

const SCAN_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.json', '.yaml', '.yml',
  '.toml', '.txt', '.env', '.md', '.ini', '.conf', '.properties', '.sh', '.tf',
]);

const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', '.git', '.next', '.turbo']);

export const REDACTED = '[REDACTED]';

export interface Finding {
  file: string;
  line: number;
  column: number;
  type: string;
  /** The line with every match replaced by [REDACTED]; only with showContext. */
  context?: string;
}

export interface ScanOptions {
  ignorePatterns: RegExp[];
  showContext: boolean;
}

export function scanContent(content: string, file: string, showContext: boolean): Finding[] {
  if (content.includes('\0')) return []; // binary
  const findings: Finding[] = [];

  content.split('\n').forEach((line, i) => {
    const spans: Array<[number, number]> = [];
    const hits: Array<{ column: number; type: string }> = [];

    for (const { pattern, type } of SECRET_PATTERNS) {
      for (const m of line.matchAll(pattern)) {
        spans.push([m.index, m.index + m[0].length]);
        hits.push({ column: m.index + 1, type });
      }
    }
    for (const m of line.matchAll(KV_PATTERN)) {
      const value = m[2]!;
      if (value.includes('${') || value.startsWith('process.env')) continue;
      const start = m.index + m[0].lastIndexOf(value);
      if (spans.some(([s, e]) => start >= s && start < e)) continue;
      spans.push([start, start + value.length]);
      hits.push({ column: m.index + 1, type: 'potential-secret' });
    }
    if (hits.length === 0) return;

    let context: string | undefined;
    if (showContext) {
      context = line;
      for (const [s, e] of spans.sort((a, b) => b[0] - a[0])) {
        context = context.slice(0, s) + REDACTED + context.slice(e);
      }
      context = context.trim();
    }
    for (const h of hits) {
      findings.push({ file, line: i + 1, ...h, ...(context !== undefined && { context }) });
    }
  });

  return findings;
}

export function scanFile(filePath: string, options: ScanOptions): Finding[] {
  if (options.ignorePatterns.some((p) => p.test(filePath))) return [];
  try {
    return scanContent(readFileSync(filePath, 'utf-8'), filePath, options.showContext);
  } catch {
    return [];
  }
}

function isScannable(name: string): boolean {
  // Dotfiles (.env.local, .npmrc, ...) are scanned: .gitignore doesn't stop leaks.
  return name.startsWith('.') || SCAN_EXTENSIONS.has(extname(name));
}

export function scanDirectory(dirPath: string, options: ScanOptions): Finding[] {
  if (options.ignorePatterns.some((p) => p.test(dirPath))) return [];
  let entries: string[];
  try {
    entries = readdirSync(dirPath);
  } catch {
    return [];
  }
  return entries.flatMap((entry) => {
    const full = join(dirPath, entry);
    try {
      const stat = statSync(full);
      if (stat.isDirectory()) return SKIP_DIRS.has(entry) ? [] : scanDirectory(full, options);
      if (stat.isFile() && isScannable(entry)) return scanFile(full, options);
    } catch {
      // skip inaccessible entries
    }
    return [];
  });
}

export function scanPaths(paths: string[], options: ScanOptions): Finding[] {
  return paths.flatMap((p) => {
    try {
      return statSync(p).isDirectory() ? scanDirectory(p, options) : scanFile(p, options);
    } catch {
      return [];
    }
  });
}

/** Scan the staged blobs (what will be committed), not the working tree. */
export function scanStaged(options: ScanOptions, cwd?: string): Finding[] {
  const names = execFileSync(
    'git',
    ['diff', '--cached', '--name-only', '--diff-filter=ACMR', '-z'],
    { encoding: 'utf-8', cwd },
  )
    .split('\0')
    .filter(Boolean);

  return names.flatMap((file) => {
    if (options.ignorePatterns.some((p) => p.test(file))) return [];
    const blob = execFileSync('git', ['show', `:${file}`], {
      encoding: 'utf-8',
      cwd,
      maxBuffer: 64 * 1024 * 1024,
    });
    return scanContent(blob, file, options.showContext);
  });
}
