/**
 * Schema inspection that never resolves secrets.
 *
 * - describeSchema(): names, types, requirements, descriptions, safe examples
 * - fakeEnv(): validated fake values for secret-free tests/fixtures
 * - checkEnv(): validates an env record, reporting issues without values
 *
 * Nothing here calls providers or resolves reference URIs.
 */

import { normalizeSchema } from './resolver';
import { isSensitiveKeyName, isSensitiveValidator } from './sensitivity';
import type { EnvDefinition, SimpleEnvSchema } from './types';

export const REFERENCE_URI = /^([a-z][a-z0-9-]+):\/\//;

/** Schemes handled by the official reference handler packages. */
export const KNOWN_REFERENCE_SCHEMES: readonly string[] = [
  'aws-sm',
  'aws-ssm',
  'op',
  'bws',
  'doppler',
  'infisical',
  'vault',
];

export interface VarDescription {
  key: string;
  type: string;
  required: boolean;
  /** 'explicit' = secret()/withMeta/connection-string validator; 'name' = key-name heuristic */
  sensitive: false | 'explicit' | 'name';
  description?: string;
  enum?: string[];
  /** Default value. Omitted for sensitive vars. */
  default?: string;
  /** Safe fake value that passes validation (best effort for custom validators). */
  example: string;
}

const EXAMPLES: Record<string, string> = {
  string: 'example',
  number: '1',
  boolean: 'false',
  port: '3000',
  url: 'https://example.com',
  http: 'https://example.com',
  https: 'https://example.com',
  email: 'dev@example.com',
  json: '{}',
  postgres: 'postgres://user:password@localhost:5432/app',
  mysql: 'mysql://user:password@localhost:3306/app',
  mongodb: 'mongodb://user:password@localhost:27017/app',
  redis: 'redis://localhost:6379',
  stringArray: 'a,b',
  numberArray: '1,2',
  urlArray: 'https://example.com',
  duration: '30s',
  date: '2026-01-01',
  timestamp: '1700000000',
  file: '/run/secrets/example',
};

function meta(def: EnvDefinition): Record<string, unknown> {
  return (def.validator ?? {}) as unknown as Record<string, unknown>;
}

function typeOf(def: EnvDefinition): string {
  if (def.type === 'file') return 'file';
  const tagged = meta(def).__type;
  if (typeof tagged === 'string') return tagged;
  if ((def as { enum?: unknown }).enum) return 'enum';
  return def.type ?? 'custom';
}

function enumOf(def: EnvDefinition): string[] | undefined {
  const values =
    (def as { enum?: unknown[] }).enum ?? (meta(def).__enum as unknown[]);
  return Array.isArray(values) ? values.map(String) : undefined;
}

function describeOne(key: string, def: EnvDefinition): VarDescription {
  const m = meta(def);
  const explicit = isSensitiveValidator(def) || isSensitiveValidator(m);
  const nameBased = m.__sensitive !== false && isSensitiveKeyName(key);
  const sensitive = explicit ? 'explicit' : nameBased ? 'name' : false;
  const type = typeOf(def);
  const values = enumOf(def);
  const hasDefault = def.default !== undefined;

  let example: string;
  if (typeof m.__example === 'string') example = m.__example;
  else if (values?.length) example = values[0]!;
  else if (hasDefault && !sensitive) example = String(def.default);
  else if (sensitive && (type === 'secret' || type === 'string' || type === 'custom'))
    example = `fake-${key.toLowerCase().replace(/_/g, '-')}`;
  else example = EXAMPLES[type] ?? 'example';

  return {
    key,
    type,
    required: !def.optional && !hasDefault,
    sensitive,
    ...(typeof m.__description === 'string' && { description: m.__description }),
    ...(values && { enum: values }),
    ...(hasDefault && !sensitive && { default: String(def.default) }),
    example,
  };
}

/** Describe a schema without resolving anything. Safe to commit/share. */
export function describeSchema(schema: SimpleEnvSchema): VarDescription[] {
  const normalized = normalizeSchema(schema);
  return Object.entries(normalized).map(([key, def]) =>
    describeOne(key, def as EnvDefinition),
  );
}

/** Fake, validated config for tests that should not need real credentials. */
export function fakeEnv(schema: SimpleEnvSchema): Record<string, string> {
  const normalized = normalizeSchema(schema);
  const failed: string[] = [];
  const env: Record<string, string> = {};
  for (const d of describeSchema(schema)) {
    const def = normalized[d.key] as EnvDefinition;
    try {
      def.validator?.(d.example, d.key);
      env[d.key] = d.example;
    } catch {
      failed.push(d.key);
    }
  }
  if (failed.length > 0) {
    throw new Error(
      `fakeEnv: no generated example passes validation for ${failed.join(', ')}.\n` +
        `  Provide a safe one: withMeta(validator, { example: '...' })`,
    );
  }
  return env;
}

/** Render a .env.example from the schema (fake values only). */
export function toDotenvExample(schema: SimpleEnvSchema): string {
  return describeSchema(schema)
    .map((d) => {
      const notes = [
        d.description,
        d.type,
        d.required ? 'required' : 'optional',
        d.sensitive && 'sensitive',
        d.enum && `one of: ${d.enum.join(', ')}`,
      ].filter(Boolean);
      return `# ${notes.join(' | ')}\n${d.key}=${d.example}`;
    })
    .join('\n\n')
    .concat('\n');
}

export interface CheckIssue {
  key: string;
  code: 'missing' | 'invalid';
  /** Never contains the value or any part of it. */
  message: string;
  sensitive: boolean;
}

export interface CheckDeferred {
  key: string;
  /**
   * e.g. aws-sm — needs credentials to resolve, so not checked offline.
   * 'secrets-dir' — a file() var that will be read from a secrets directory.
   */
  scheme: string;
}

export interface CheckResult {
  ok: boolean;
  issues: CheckIssue[];
  deferred: CheckDeferred[];
  checked: number;
}

/**
 * Validate `env` against the schema. Output contains no values, fragments,
 * lengths or fingerprints. Reference URIs are reported as `deferred`
 * (they need credentials); resolve them first for an online check.
 */
export function checkEnv(
  schema: SimpleEnvSchema,
  env: Record<string, string | undefined>,
  options: { referenceSchemes?: readonly string[]; secretsDir?: string } = {},
): CheckResult {
  const schemes = options.referenceSchemes ?? KNOWN_REFERENCE_SCHEMES;
  const normalized = normalizeSchema(schema);
  const issues: CheckIssue[] = [];
  const deferred: CheckDeferred[] = [];

  for (const [key, rawDef] of Object.entries(normalized)) {
    const def = rawDef as EnvDefinition;
    const d = describeOne(key, def);
    const sensitive = d.sensitive !== false;
    const value = env[key];

    if (value === undefined) {
      if (def.type === 'file' && (def.secretsDir ?? options.secretsDir)) {
        deferred.push({ key, scheme: 'secrets-dir' });
      } else if (d.required) {
        issues.push({ key, code: 'missing', message: 'Missing required variable', sensitive });
      }
      continue;
    }

    const scheme = value.match(REFERENCE_URI)?.[1];
    if (scheme && schemes.includes(scheme)) {
      deferred.push({ key, scheme });
      continue;
    }

    if (!def.validator) continue;
    try {
      def.validator(value, key);
    } catch {
      // Validator messages can echo their input (custom validators often do),
      // so never use them. Only schema-derived detail is added.
      const expected = d.enum ? `; expected one of: ${d.enum.join(', ')}` : '';
      const msg = `Value does not pass ${d.type} validation${expected}`;
      issues.push({ key, code: 'invalid', message: msg, sensitive });
    }
  }

  return { ok: issues.length === 0, issues, deferred, checked: Object.keys(normalized).length };
}
