/**
 * Single source of truth for "is this value sensitive?".
 *
 * Explicit metadata wins: values produced by validators marked sensitive
 * (secret(), file(), connection-string validators) are registered here when
 * resolved. Key-name heuristics are only a fallback.
 */

/** Key-name heuristics used when no explicit metadata exists. */
export const DEFAULT_SENSITIVE_PATTERNS: readonly RegExp[] = [
  /password/i,
  /secret/i,
  /token/i,
  /key/i,
  /credential/i,
  /auth/i,
  /private/i,
  /session/i,
  /bearer/i,
  /database[_-]?url/i,
  /db[_-]?url/i,
  /conn(ection)?[_-]?string/i,
  /dsn/i,
];

export function isSensitiveKeyName(
  key: string,
  patterns: readonly RegExp[] = DEFAULT_SENSITIVE_PATTERNS,
): boolean {
  return patterns.some((p) => p.test(key));
}

/** True when a validator/definition is explicitly marked sensitive. */
export function isSensitiveValidator(v: unknown): boolean {
  if (v === null || (typeof v !== 'function' && typeof v !== 'object')) {
    return false;
  }
  const rec = v as Record<string, unknown>;
  return rec.__sensitive === true || rec.sensitive === true;
}

// Shared across ESM/CJS copies of this module.
const REGISTRY = Symbol.for('node-env-resolver.sensitive-values');
function registry(): Set<string> {
  const g = globalThis as unknown as Record<symbol, Set<string> | undefined>;
  return (g[REGISTRY] ??= new Set<string>());
}

// Shorter registered values only match exactly, so a 3-char secret
// doesn't flag every string containing those characters.
const MIN_DERIVED_MATCH = 6;

/**
 * String forms of a value that must be treated as secret: the value itself
 * (numbers stringified, objects as JSON) plus every primitive leaf
 * of an object/array, so `json()` secrets are covered field by field.
 */
export function sensitiveForms(value: unknown, depth = 0): string[] {
  if (value === undefined || value === null || depth > 10) return [];
  if (typeof value === 'string') return value.length > 0 ? [value] : [];
  // Booleans carry no secret and would match every true/false.
  if (typeof value === 'number' || typeof value === 'bigint') return [String(value)];
  if (typeof value === 'object') {
    const leaves = Object.values(value as object).flatMap((v) => sensitiveForms(v, depth + 1));
    try {
      return [JSON.stringify(value), ...leaves];
    } catch {
      return leaves;
    }
  }
  return [];
}

/** Register a resolved value (any type) as sensitive. */
export function markSensitiveValue(value: unknown): void {
  const reg = registry();
  for (const form of sensitiveForms(value)) reg.add(form);
}

/**
 * True when `value` is a registered sensitive value, or is derived from one
 * (contains it, e.g. a URL built by interpolation or withComputed()).
 * Non-strings are compared by their string/JSON form.
 */
export function isSensitiveValue(value: unknown): boolean {
  const str = typeof value === 'string' ? value : sensitiveForms(value)[0];
  if (str === undefined || str.length === 0) return false;
  const reg = registry();
  if (reg.has(str)) return true;
  for (const secret of reg) {
    if (secret.length >= MIN_DERIVED_MATCH && str.includes(secret)) {
      return true;
    }
  }
  return false;
}

/**
 * Keys whose values are secrets or derived from one (explicit metadata only).
 * Used by framework adapters to keep secrets out of client bundles.
 */
export function findSensitiveKeys(values: Record<string, unknown>): string[] {
  return Object.entries(values)
    .filter(([, v]) => isSensitiveValue(v))
    .map(([k]) => k);
}

/** Test helper: forget registered values. */
export function clearSensitiveValues(): void {
  registry().clear();
}
