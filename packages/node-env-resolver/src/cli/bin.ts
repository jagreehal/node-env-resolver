#!/usr/bin/env node
/**
 * node-env-resolver CLI (ner)
 *
 * Commands:
 *   scan      - Scan files for hardcoded secrets
 *   run       - Run a command with .env vars injected
 *   describe  - Describe the env schema (no values, no provider calls)
 *   check     - Validate env against the schema without printing values
 */

import { parseArgs } from 'util';
import { existsSync, readFileSync } from 'fs';
import { resolve as resolvePath } from 'path';
import { pathToFileURL } from 'url';
import { spawn } from 'child_process';
import { scanFile, scanPaths, scanStaged, type Finding } from './scan';
import { checkEnv, describeSchema, toDotenvExample, KNOWN_REFERENCE_SCHEMES } from '../inspect';
import type { SimpleEnvSchema } from '../types';

function fmt(finding: Finding, showContext: boolean): string {
  let out = `\x1b[31m${finding.file}:${finding.line}:${finding.column}\x1b[0m \x1b[33m[${finding.type}]\x1b[0m`;
  if (showContext && finding.context) out += `\n  \x1b[90m${finding.context}\x1b[0m`;
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

const REFERENCE_URI = /^([a-z][a-z0-9-]+):\/\//;

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
  // Plain URLs (https://, postgres://) are values, not references.
  const refs = Object.entries(vars).filter(([, v]) =>
    KNOWN_REFERENCE_SCHEMES.includes(v.match(REFERENCE_URI)?.[1] ?? ''),
  );
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
        default: ['node_modules', '\\.git(/|$)', 'dist', 'build', '\\.map$'],
      },
      format: { type: 'string', default: 'text' },
      verbose: { type: 'boolean', short: 'v', default: false },
      context: { type: 'boolean', short: 'c', default: false },
      help: { type: 'boolean', short: 'h', default: false },
    },
  });

  if (values.help) {
    console.log(`
\x1b[1mner scan\x1b[0m [options] [paths...]

Scan files (including dotfiles like .env.local) for hardcoded secrets.
Findings never include the secret value or any fragment of it.

Options:
  --staged           Scan staged content (what will be committed)
  --ignore <pattern> Regex patterns to exclude (repeatable)
  --format <fmt>     text (default) or json
  -c, --context      Show the matching line with secrets replaced by [REDACTED]
  -v, --verbose      Verbose output
  -h, --help         Show this help

Exit codes: 0 no findings, 1 findings, 2 usage error

Examples:
  ner scan src/
  ner scan --staged
  ner scan --format json .

Pre-commit hook setup:
  echo 'ner scan --staged' >> .git/hooks/pre-commit
  chmod +x .git/hooks/pre-commit
`);
    process.exit(0);
  }

  const json = values.format === 'json';
  const options = {
    ignorePatterns: ((values.ignore as string[]) ?? []).map((p) => new RegExp(p)),
    showContext: Boolean(values.context),
  };

  let findings: Finding[];
  if (values.staged) {
    try {
      findings = scanStaged(options);
    } catch {
      console.error('\x1b[31mError:\x1b[0m could not read staged files. Is this a git repo?');
      process.exit(2);
    }
  } else {
    if (positionals.length === 0) {
      console.error('Provide at least one path to scan, or use --staged.\nRun: ner scan --help');
      process.exit(2);
    }
    if (!json) console.log('\x1b[1mScanning for secrets…\x1b[0m\n');
    findings = scanPaths(positionals, options);
  }

  if (json) {
    console.log(JSON.stringify({ count: findings.length, findings }, null, 2));
    process.exit(findings.length === 0 ? 0 : 1);
  }

  if (findings.length === 0) {
    console.log('\x1b[32m✓ No secrets found.\x1b[0m');
    process.exit(0);
  }

  console.log(`\x1b[31m✗ Found ${findings.length} potential secret(s):\x1b[0m\n`);
  for (const f of findings) console.log(fmt(f, options.showContext));

  const byType: Record<string, number> = {};
  for (const f of findings) byType[f.type] = (byType[f.type] ?? 0) + 1;
  console.log('\nSummary:');
  for (const [type, count] of Object.entries(byType)) console.log(`  ${type}: ${count}`);

  console.log('\nRecommendations:');
  console.log('  • Move secrets to environment variables or a secret manager');
  console.log('  • Use reference handlers:  DATABASE_URL=aws-sm://prod/db-url');
  console.log('  • Add this check to CI:    ner scan src/');
  console.log('  • Pre-commit hook:         echo "ner scan --staged" >> .git/hooks/pre-commit\n');

  process.exit(1);
}

// ─── Schema loading (describe / check) ───────────────────────────────────────

const SCHEMA_CANDIDATES = ['env.schema.ts', 'env.schema.mts', 'env.schema.js', 'env.schema.mjs'];

/**
 * Import the schema module. It must export `schema` (or a default export).
 * .ts files need Node >= 22.18 (native type stripping) or a loader such as tsx.
 */
async function loadSchema(file: string | undefined): Promise<SimpleEnvSchema> {
  const path = file ?? SCHEMA_CANDIDATES.find((c) => existsSync(c));
  if (!path) {
    throw new Error(
      `No schema file found. Pass --schema <file> or create one of: ${SCHEMA_CANDIDATES.join(', ')}\n` +
        '  The module must export `schema` (or a default export).',
    );
  }
  const mod = (await import(pathToFileURL(resolvePath(path)).href)) as Record<string, unknown>;
  const schema = (mod.schema ?? mod.default) as SimpleEnvSchema | undefined;
  if (!schema || typeof schema !== 'object') {
    throw new Error(`${path} must export \`schema\` (or a default export)`);
  }
  return schema;
}

async function runDescribe(args: string[]) {
  const { values } = parseArgs({
    args: args.slice(1),
    options: {
      schema: { type: 'string' },
      format: { type: 'string', default: 'text' },
      help: { type: 'boolean', short: 'h', default: false },
    },
  });

  if (values.help) {
    console.log(`
\x1b[1mner describe\x1b[0m [options]

Describe the env schema: names, types, requirements, descriptions and safe
fake examples. Never resolves references, calls providers or reads values,
so the output is safe to commit and to give to coding agents.

Options:
  --schema <file>   Schema module (default: env.schema.{ts,mts,js,mjs})
  --format <fmt>    text (default), json (manifest) or dotenv (.env.example)

Examples:
  ner describe --format json > env.manifest.json
  ner describe --format dotenv > .env.example
`);
    process.exit(0);
  }

  let schema: SimpleEnvSchema;
  try {
    schema = await loadSchema(values.schema);
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(2);
  }

  if (values.format === 'json') {
    console.log(JSON.stringify({ version: 1, variables: describeSchema(schema) }, null, 2));
  } else if (values.format === 'dotenv') {
    process.stdout.write(toDotenvExample(schema));
  } else {
    for (const d of describeSchema(schema)) {
      const flags = [d.type, d.required ? 'required' : 'optional', d.sensitive && 'sensitive']
        .filter(Boolean)
        .join(', ');
      console.log(`${d.key}  (${flags})${d.description ? `  ${d.description}` : ''}`);
    }
  }
  process.exit(0);
}

async function runCheck(args: string[]) {
  const { values } = parseArgs({
    args: args.slice(1),
    options: {
      schema: { type: 'string' },
      env: { type: 'string', default: '.env' },
      resolve: { type: 'boolean', default: false },
      agent: { type: 'boolean', default: false },
      format: { type: 'string', default: 'text' },
      help: { type: 'boolean', short: 'h', default: false },
    },
  });

  if (values.help) {
    console.log(`
\x1b[1mner check\x1b[0m [options]

Validate the environment (process env + .env file) against the schema.
Output never contains values, fragments, lengths or fingerprints.

By default the check is offline: reference URIs (aws-sm://, op://, ...) are
reported as "deferred" because resolving them needs credentials. Use
--resolve for a full check where credentials are available.

Options:
  --schema <file>   Schema module (default: env.schema.{ts,mts,js,mjs})
  --env <file>      .env file to read (default: .env, optional)
  --resolve         Resolve reference URIs first (needs credentials)
  --agent           Machine-readable JSON output (same as --format json)
  --format <fmt>    text (default) or json

Exit codes: 0 valid, 1 missing/invalid variables, 2 usage or schema error
`);
    process.exit(0);
  }

  let schema: SimpleEnvSchema;
  try {
    schema = await loadSchema(values.schema);
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(2);
  }

  let env: Record<string, string | undefined> = {
    ...loadDotenv(values.env as string),
    ...process.env,
  };
  if (values.resolve) {
    // Resolve only the schema's own keys
    const schemaVars = Object.fromEntries(
      Object.keys(schema).flatMap((k) => (env[k] === undefined ? [] : [[k, env[k]!]])),
    );
    env = { ...env, ...(await resolveEnvReferences(schemaVars)) };
  }

  const result = checkEnv(schema, env);
  const json = values.agent || values.format === 'json';

  if (json) {
    console.log(JSON.stringify({ mode: values.resolve ? 'online' : 'offline', ...result }, null, 2));
  } else {
    for (const i of result.issues) {
      console.log(`\x1b[31m✗\x1b[0m ${i.key}: ${i.message}`);
    }
    for (const d of result.deferred) {
      console.log(`\x1b[33m…\x1b[0m ${d.key}: ${d.scheme}:// reference not resolved (run with --resolve where credentials are available)`);
    }
    if (result.ok) console.log(`\x1b[32m✓ ${result.checked} variable(s) valid\x1b[0m`);
  }
  process.exit(result.ok ? 0 : 1);
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

The child receives the resolved values and the parent environment. Use it to
start your app. For coding agents, see "Coding agents" in the README.

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
    const findings = scanFile(envFile, { ignorePatterns: [], showContext: false });
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
  scan      Scan files for hardcoded secrets
  run       Run a command with .env vars injected
  describe  Describe the env schema (safe for agents; no values)
  check     Validate env against the schema (no values in output)

Run \x1b[1mner <command> --help\x1b[0m for command-specific options.
`);
    process.exit(0);
  }

  if (command === 'scan') {
    await runScan(args);
  } else if (command === 'run') {
    await runRun(args);
  } else if (command === 'describe') {
    await runDescribe(args);
  } else if (command === 'check') {
    await runCheck(args);
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
