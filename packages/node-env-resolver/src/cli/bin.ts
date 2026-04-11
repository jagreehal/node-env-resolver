#!/usr/bin/env node
/**
 * node-env-resolver CLI (ner)
 *
 * Commands:
 *   scan  - Scan files for hardcoded secrets
 *   run   - Run a command with .env vars injected
 */

import { parseArgs } from 'util';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, extname } from 'path';
import { execSync, spawn } from 'child_process';

// ─── Secret patterns ──────────────────────────────────────────────────────────

const SECRET_PATTERNS: Array<{ pattern: RegExp; type: string }> = [
  { pattern: /sk_(live|test)_[a-zA-Z0-9]{24,}/g, type: 'stripe-key' },
  { pattern: /pk_(live|test)_[a-zA-Z0-9]{24,}/g, type: 'stripe-key' },
  { pattern: /xox[baprs]-[a-zA-Z0-9-]+/g, type: 'slack-token' },
  { pattern: /ghp_[a-zA-Z0-9]{36}/g, type: 'github-token' },
  { pattern: /gho_[a-zA-Z0-9]{36}/g, type: 'github-token' },
  { pattern: /ghu_[a-zA-Z0-9]{36}/g, type: 'github-token' },
  { pattern: /ghs_[a-zA-Z0-9]{36}/g, type: 'github-token' },
  { pattern: /ghr_[a-zA-Z0-9]{36}/g, type: 'github-token' },
  {
    pattern: /eyJ[a-zA-Z0-9_-]*\.eyJ[a-zA-Z0-9_-]*\.[a-zA-Z0-9_-]*/g,
    type: 'jwt-token',
  },
  {
    pattern: /(postgres|mysql|mongodb|redis):\/\/[^:]+:[^@]+@/g,
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

const SCAN_EXTENSIONS = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.json',
  '.yaml',
  '.yml',
  '.toml',
  '.txt',
  '.env',
  '.md',
]);

const SKIP_DIRS = new Set([
  'node_modules',
  'dist',
  'build',
  '.git',
  '.next',
  '.turbo',
]);

// ─── Types ────────────────────────────────────────────────────────────────────

interface Finding {
  file: string;
  line: number;
  column: number;
  type: string;
  match: string;
  context: string;
}

interface ScanOptions {
  paths: string[];
  ignorePatterns: RegExp[];
  verbose: boolean;
  showContext: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function matchesIgnore(path: string, patterns: RegExp[]): boolean {
  return patterns.some((p) => p.test(path));
}

function scanLine(
  line: string,
  lineIndex: number,
  file: string,
  showContext: boolean,
): Finding[] {
  const findings: Finding[] = [];

  for (const { pattern, type } of SECRET_PATTERNS) {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(line)) !== null) {
      const ctx = showContext
        ? line
            .slice(
              Math.max(0, match.index - 20),
              match.index + match[0].length + 20,
            )
            .trim()
        : '';
      findings.push({
        file,
        line: lineIndex + 1,
        column: match.index + 1,
        type,
        match: match[0].length > 30 ? `${match[0].slice(0, 30)}…` : match[0],
        context: ctx,
      });
    }
  }

  // Key=value heuristic
  const kv = line.match(
    /(password|secret|token|api[_-]?key)\s*[:=]\s*["']?([^"'\s,}]{9,})/i,
  );
  if (
    kv &&
    kv[2] &&
    !kv[2].includes('${') &&
    !kv[2].startsWith('process.env')
  ) {
    findings.push({
      file,
      line: lineIndex + 1,
      column: (kv.index ?? 0) + 1,
      type: 'potential-secret',
      match: `${kv[1]}=${kv[2].slice(0, 20)}…`,
      context: showContext ? line.trim() : '',
    });
  }

  return findings;
}

function scanFile(filePath: string, options: ScanOptions): Finding[] {
  if (matchesIgnore(filePath, options.ignorePatterns)) return [];

  let content: string;
  try {
    content = readFileSync(filePath, 'utf-8');
  } catch {
    return [];
  }

  const lines = content.split('\n');
  return lines.flatMap((line, i) =>
    scanLine(line, i, filePath, options.showContext),
  );
}

function scanDirectory(dirPath: string, options: ScanOptions): Finding[] {
  if (matchesIgnore(dirPath, options.ignorePatterns)) return [];

  let entries: string[];
  try {
    entries = readdirSync(dirPath);
  } catch {
    return [];
  }

  return entries.flatMap((entry) => {
    if (entry.startsWith('.') && entry !== '.env') return [];
    const full = join(dirPath, entry);

    try {
      const stat = statSync(full);
      if (stat.isDirectory()) {
        return SKIP_DIRS.has(entry) ? [] : scanDirectory(full, options);
      }
      if (stat.isFile()) {
        const ext = extname(full);
        if (SCAN_EXTENSIONS.has(ext) || entry.startsWith('.env')) {
          return scanFile(full, options);
        }
      }
    } catch {
      // skip inaccessible entries
    }
    return [];
  });
}

function fmt(finding: Finding, showContext: boolean): string {
  let out = `\x1b[31m${finding.file}:${finding.line}:${finding.column}\x1b[0m \x1b[33m[${finding.type}]\x1b[0m ${finding.match}`;
  if (showContext && finding.context)
    out += `\n  \x1b[90m${finding.context}\x1b[0m`;
  return out;
}

// ─── Simple .env loader (no deps) ────────────────────────────────────────────

function loadDotenv(envPath = '.env'): Record<string, string> {
  try {
    const content = readFileSync(envPath, 'utf-8');
    const vars: Record<string, string> = {};
    for (const raw of content.split('\n')) {
      const line = raw.trim();
      if (!line || line.startsWith('#')) continue;
      const eq = line.indexOf('=');
      if (eq === -1) continue;
      const key = line.slice(0, eq).trim();
      let value = line.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      // expand simple ${VAR} references
      value = value.replace(
        /\$\{([^}]+)\}/g,
        (_, k) => process.env[k] ?? vars[k] ?? '',
      );
      vars[key] = value;
    }
    return vars;
  } catch {
    return {};
  }
}

// ─── Reference resolution ────────────────────────────────────────────────────

interface RefHandler {
  name: string;
  resolve: (
    reference: string,
    ctx: { key: string; source: string | null; reference: string },
  ) => Promise<{ value: string }>;
}

const REFERENCE_URI = /^[a-z][a-z0-9-]+:\/\//;

async function loadHandlers(): Promise<RefHandler[]> {
  const handlers: RefHandler[] = [];
  try {
    // Use a variable so TS doesn't try to resolve the module at compile time
    // (node-env-resolver-aws is an optional sibling package)
    const pkg = 'node-env-resolver-aws';
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const aws = (await import(pkg)) as any;
    if (aws.awsSecretHandler) handlers.push(aws.awsSecretHandler as RefHandler);
    if (aws.awsSsmHandler) handlers.push(aws.awsSsmHandler as RefHandler);
  } catch {
    // package not installed — AWS handlers unavailable
  }
  return handlers;
}

async function resolveEnvReferences(
  vars: Record<string, string>,
): Promise<Record<string, string>> {
  const refs = Object.entries(vars).filter(([, v]) => REFERENCE_URI.test(v));
  if (refs.length === 0) return vars;

  const handlers = await loadHandlers();

  // Fail fast on unknown schemes
  const unknownSchemes = new Set<string>();
  for (const [, v] of refs) {
    const scheme = v.match(/^([a-z][a-z0-9-]+):\/\//)?.[1];
    if (scheme && !handlers.some((h) => h.name === scheme)) {
      unknownSchemes.add(scheme);
    }
  }
  if (unknownSchemes.size > 0) {
    const list = [...unknownSchemes].join(', ');
    console.error(
      `\x1b[31mError:\x1b[0m No handler installed for scheme(s): ${list}://\n` +
        `  For aws-sm:// and aws-ssm://, install: node-env-resolver-aws`,
    );
    process.exit(1);
  }

  process.stderr.write(`Resolving ${refs.length} reference(s)…\n`);

  const resolved = { ...vars };
  for (const [key, value] of refs) {
    const handler = handlers.find((h) => value.startsWith(`${h.name}://`));
    if (!handler) continue;
    try {
      const result = await handler.resolve(value, {
        key,
        source: '.env',
        reference: value,
      });
      resolved[key] = result.value;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(
        `\x1b[31mFailed to resolve ${key} (${value}):\x1b[0m\n  ${msg}`,
      );
      process.exit(1);
    }
  }

  return resolved;
}

// ─── Commands ─────────────────────────────────────────────────────────────────

async function runScan(args: string[]) {
  const { values, positionals } = parseArgs({
    args: args.slice(1),
    allowPositionals: true,
    options: {
      staged: { type: 'boolean', default: false },
      ignore: {
        type: 'string',
        multiple: true,
        default: ['node_modules', '\\.git', 'dist', 'build', '\\.map$'],
      },
      verbose: { type: 'boolean', short: 'v', default: false },
      context: { type: 'boolean', short: 'c', default: false },
      help: { type: 'boolean', short: 'h', default: false },
    },
  });

  if (values.help) {
    console.log(`
\x1b[1mner scan\x1b[0m [options] [paths...]

Scan files for hardcoded secrets.

Options:
  --staged           Scan only git-staged files (ideal for pre-commit hooks)
  --ignore <pattern> Regex patterns to exclude (repeatable)
  -c, --context      Show surrounding line context
  -v, --verbose      Verbose output
  -h, --help         Show this help

Examples:
  ner scan src/
  ner scan --staged
  ner scan --context --ignore "fixtures" src/

Pre-commit hook setup:
  echo 'ner scan --staged' >> .git/hooks/pre-commit
  chmod +x .git/hooks/pre-commit
`);
    process.exit(0);
  }

  const ignorePatterns = ((values.ignore as string[]) ?? []).map(
    (p) => new RegExp(p),
  );
  const showContext = Boolean(values.context);

  let paths: string[] = positionals;

  if (values.staged) {
    try {
      const output = execSync('git diff --cached --name-only', {
        encoding: 'utf-8',
      });
      paths = output.trim().split('\n').filter(Boolean);
      if (paths.length === 0) {
        console.log('\x1b[32m✓ No staged files to scan.\x1b[0m');
        process.exit(0);
      }
      if (values.verbose) {
        console.log(`Scanning ${paths.length} staged file(s)…\n`);
      }
    } catch {
      console.error(
        '\x1b[31mError:\x1b[0m could not get staged files — is this a git repo?',
      );
      process.exit(1);
    }
  }

  if (paths.length === 0) {
    console.error(
      'Provide at least one path to scan, or use --staged.\nRun: ner scan --help',
    );
    process.exit(1);
  }

  const options: ScanOptions = {
    paths,
    ignorePatterns,
    verbose: Boolean(values.verbose),
    showContext,
  };

  if (!values.staged) console.log('\x1b[1mScanning for secrets…\x1b[0m\n');

  const findings: Finding[] = paths.flatMap((p) => {
    try {
      return statSync(p).isDirectory()
        ? scanDirectory(p, options)
        : scanFile(p, options);
    } catch {
      return [];
    }
  });

  if (findings.length === 0) {
    console.log('\x1b[32m✓ No secrets found.\x1b[0m');
    process.exit(0);
  }

  console.log(
    `\x1b[31m✗ Found ${findings.length} potential secret(s):\x1b[0m\n`,
  );
  for (const f of findings) console.log(fmt(f, showContext));

  // Summary
  const byType: Record<string, number> = {};
  for (const f of findings) byType[f.type] = (byType[f.type] ?? 0) + 1;

  console.log('\nSummary:');
  for (const [type, count] of Object.entries(byType)) {
    console.log(`  ${type}: ${count}`);
  }

  console.log('\nRecommendations:');
  console.log('  • Move secrets to environment variables or a secret manager');
  console.log('  • Use reference handlers:  DATABASE_URL=aws-sm://prod/db-url');
  console.log('  • Add this check to CI:    ner scan src/');
  console.log(
    '  • Pre-commit hook:         echo "ner scan --staged" >> .git/hooks/pre-commit\n',
  );

  process.exit(1);
}

async function runRun(args: string[]) {
  const sepIdx = args.indexOf('--');

  if (sepIdx === -1 || sepIdx >= args.length - 1) {
    console.error(`\x1b[31mError:\x1b[0m missing command after '--'

Usage: ner run [options] -- <command> [args...]

Examples:
  ner run -- node server.js
  ner run --env .env.local -- npx ts-node src/index.ts
  ner run --no-resolve -- node server.js
`);
    process.exit(1);
  }

  const { values } = parseArgs({
    args: args.slice(1, sepIdx),
    allowPositionals: false,
    options: {
      env: { type: 'string', default: '.env' },
      resolve: { type: 'boolean', default: true },
      scan: { type: 'boolean', default: false },
      help: { type: 'boolean', short: 'h', default: false },
    },
  });

  if (values.help) {
    console.log(`
\x1b[1mner run\x1b[0m [options] -- <command> [args...]

Run a command with .env vars injected. Reference URIs are resolved before the
process starts — no code changes needed in your app.

Options:
  --env <file>     .env file to load (default: .env)
  --no-resolve     Skip reference URI resolution, inject values as-is
  --scan           Warn if .env contains hardcoded secrets
  -h, --help       Show this help

Examples:
  ner run -- node server.js
  ner run --env .env.staging -- node deploy.js
  ner run --no-resolve -- node server.js

Reference resolution (install node-env-resolver-aws for AWS support):
  DATABASE_URL=aws-sm://prod/database    resolved before process start
  API_KEY=aws-ssm://prod/api-key         resolved before process start
`);
    process.exit(0);
  }

  const envFile = (values.env as string) ?? '.env';
  let envVars = loadDotenv(envFile);

  if (values.scan) {
    const findings = scanFile(envFile, {
      paths: [envFile],
      ignorePatterns: [],
      verbose: false,
      showContext: false,
    });
    if (findings.length > 0) {
      console.error(
        `\x1b[33m⚠ ${findings.length} potential hardcoded secret(s) in ${envFile}:\x1b[0m`,
      );
      for (const f of findings) console.error(fmt(f, false));
      console.error(
        `  Tip: use reference URIs instead — DATABASE_URL=aws-sm://prod/db\n`,
      );
    }
  }

  if (values.resolve !== false) {
    envVars = await resolveEnvReferences(envVars);
  }

  const [cmd, ...cmdArgs] = args.slice(sepIdx + 1);

  if (!cmd) {
    console.error('No command specified after --');
    process.exit(1);
  }

  const child = spawn(cmd, cmdArgs, {
    stdio: 'inherit',
    env: {
      ...envVars,     // .env values (lower precedence)
      ...process.env, // existing env wins
    },
  });

  child.on('error', (err) => {
    console.error(`\x1b[31mFailed to run "${cmd}":\x1b[0m ${err.message}`);
    process.exit(1);
  });

  child.on('close', (code) => {
    process.exit(code ?? 0);
  });
}

// ─── Entry point ──────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command || command === '--help' || command === '-h') {
    console.log(`
\x1b[1mner\x1b[0m — node-env-resolver CLI

Commands:
  scan    Scan files for hardcoded secrets
  run     Run a command with .env vars injected

Run \x1b[1mner <command> --help\x1b[0m for command-specific options.
`);
    process.exit(0);
  }

  if (command === 'scan') {
    await runScan(args);
  } else if (command === 'run') {
    await runRun(args);
  } else {
    console.error(
      `\x1b[31mUnknown command:\x1b[0m ${command}\nRun: ner --help`,
    );
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
