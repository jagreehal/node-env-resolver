/**
 * Redaction utilities for sensitive environment variables.
 *
 * Core primitives for detecting and masking sensitive values in logs, objects,
 * and strings. Console patching is a best-effort convenience layer on top.
 *
 * @example
 * ```ts
 * import { resolve } from 'node-env-resolver';
 * import { sensitive, string } from 'node-env-resolver/validators';
 * import { createRedactor, patchGlobalConsole } from 'node-env-resolver/redaction';
 *
 * const config = resolve({ API_KEY: sensitive(string()) });
 * const unpatch = patchGlobalConsole(config);
 * console.log(config.API_KEY); // "sk***" (redacted)
 * unpatch();
 * ```
 */

import { SENSITIVE_KEYS_SYMBOL } from './types';

/**
 * Symbol used to mark a value as intentionally revealed, so the redactor skips it.
 */
export const REVEAL_SYMBOL = Symbol.for('node-env-resolver:revealed');

/**
 * A value wrapped with REVEAL_SYMBOL so the redactor skips redaction.
 */
export type Revealed<T> = { readonly [REVEAL_SYMBOL]: true; readonly value: T };

/**
 * Wrap a value so the redactor intentionally skips it.
 * Use this when you need to log a sensitive value for debugging.
 */
export function reveal<T>(value: T): Revealed<T> {
  return { [REVEAL_SYMBOL]: true, value };
}

/**
 * Check if a value has been wrapped with reveal().
 */
function isRevealed(value: unknown): value is Revealed<unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    REVEAL_SYMBOL in value &&
    (value as Revealed<unknown>)[REVEAL_SYMBOL] === true
  );
}

// ── Core Primitives ──────────────────────────────────────────────────

/**
 * Extract the set of keys marked as sensitive from a resolved config object.
 */
export function getSensitiveKeys(config: object): Set<string> {
  const keys = (config as Record<symbol, unknown>)[SENSITIVE_KEYS_SYMBOL];
  if (keys instanceof Set) return keys as Set<string>;
  return new Set<string>();
}

/**
 * Extract a map of sensitive key → resolved string value from a resolved config.
 * Only includes keys whose resolved values are non-empty strings.
 */
export function getSensitiveValues(config: object): Map<string, string> {
  const sensitiveKeys = getSensitiveKeys(config);
  const values = new Map<string, string>();
  const record = config as Record<string, unknown>;

  for (const key of sensitiveKeys) {
    const val = record[key];
    if (typeof val === 'string' && val.length > 0) {
      values.set(key, val);
    }
  }

  return values;
}

/**
 * Mask a string value for display. Shows the first `showChars` characters
 * followed by asterisks.
 *
 * @param value - The string to mask
 * @param showChars - Number of leading characters to show (default: 2)
 */
export function redactString(value: string, showChars = 2): string {
  if (value.length <= showChars) return '*'.repeat(value.length);
  return value.slice(0, showChars) + '*'.repeat(Math.min(value.length - showChars, 5));
}

// WeakMap cache for redactor regex per config object
const redactorCache = new WeakMap<object, { regex: RegExp; valueToKey: Map<string, string> }>();

function getOrBuildRedactorData(config: object) {
  let cached = redactorCache.get(config);
  if (cached) return cached;

  const sensitiveValues = getSensitiveValues(config);

  // Sort by length descending for maximal munch
  const entries = Array.from(sensitiveValues.entries()).sort(
    (a, b) => b[1].length - a[1].length,
  );

  const valueToKey = new Map<string, string>();
  const patterns: string[] = [];

  for (const [key, value] of entries) {
    if (value.length === 0) continue;
    valueToKey.set(value, key);
    // Escape regex special characters
    patterns.push(value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  }

  const regex = patterns.length > 0 ? new RegExp(patterns.join('|'), 'g') : null;
  cached = { regex: regex!, valueToKey };
  redactorCache.set(config, cached);
  return cached;
}

/**
 * Create a bound redaction function for a specific resolved config.
 * The regex is built once and cached via WeakMap.
 *
 * @param config - A resolved config object (from resolve/resolveAsync)
 * @returns A function that redacts sensitive values from any input
 */
export function createRedactor(config: object): (value: unknown) => unknown {
  const data = getOrBuildRedactorData(config);

  function redact(value: unknown): unknown {
    if (isRevealed(value)) return value.value;
    if (typeof value === 'string') return redactStringValue(value, data);
    if (Array.isArray(value)) return value.map(redact);
    if (typeof value === 'object' && value !== null) {
      try {
        const json = JSON.stringify(value);
        const redacted = redactStringValue(json, data);
        return JSON.parse(redacted);
      } catch {
        return value;
      }
    }
    return value;
  }

  return redact;
}

function redactStringValue(
  str: string,
  data: { regex: RegExp | null; valueToKey: Map<string, string> },
): string {
  if (!data.regex || data.valueToKey.size === 0) return str;
  // Reset lastIndex for global regex
  data.regex.lastIndex = 0;
  return str.replace(data.regex, (match) => {
    return redactString(match);
  });
}

/**
 * Convenience wrapper: recursively redact sensitive values in a value.
 *
 * @param value - The value to redact (string, array, object)
 * @param config - A resolved config object
 */
export function redactSensitiveConfig(value: unknown, config: object): unknown {
  return createRedactor(config)(value);
}

// ── Console Patching (best-effort convenience layer) ─────────────────
//
// Known limitations:
// - Third-party loggers that bypass console are not covered
// - Object inspection depth may not catch deeply nested secrets
// - Secrets split across multiple console arguments may not be caught
// - Node.js only

const PATCHED_SYMBOL = Symbol.for('node-env-resolver:consolePatchedBy');

/**
 * Patch global console methods to redact sensitive values.
 * Returns an unpatch function to restore original behavior.
 *
 * Best-effort, Node-only. Not guaranteed for all logging pipelines.
 *
 * @param config - A resolved config object with sensitive keys attached
 * @returns A function to unpatch (restore original console methods)
 */
export function patchGlobalConsole(config: object): () => void {
  // Guard against double-patching
  if ((globalThis as Record<symbol, unknown>)[PATCHED_SYMBOL]) {
    return () => {};
  }

  const redact = createRedactor(config);
  const methods = ['log', 'warn', 'error', 'info', 'debug', 'trace'] as const;
  const originals = new Map<string, (...args: unknown[]) => void>();

  for (const method of methods) {
    const original = console[method].bind(console);
    originals.set(method, original);

    console[method] = (...args: unknown[]) => {
      original(...args.map(redact));
    };
  }

  (globalThis as Record<symbol, unknown>)[PATCHED_SYMBOL] = true;

  return () => {
    for (const method of methods) {
      const original = originals.get(method);
      if (original) {
        console[method] = original as typeof console.log;
      }
    }
    delete (globalThis as Record<symbol, unknown>)[PATCHED_SYMBOL];
  };
}
