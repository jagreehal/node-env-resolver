/**
 * Debug view for environment variable resolution
 *
 * Provides a safe, operator-friendly inspection surface that:
 * - Shows provenance/source without exposing values
 * - Supports masked preview, fingerprint, or length-only modes
 * - Marks sensitive values for special handling
 * - Tracks consumed vs available
 */

import { createHash } from 'crypto';
import type { Provenance } from './types.js';

// Default sensitive key patterns - exported for custom sensitivity detection
export const DEFAULT_SENSITIVE_PATTERNS: readonly RegExp[] = [
  /DATABASE_URL$/i,
  /KEY$/i,
  /TOKEN$/i,
  /SECRET$/i,
  /PASSWORD$/i,
  /CREDENTIAL/i,
  /DSN$/i,
  /PRIVATE/i,
  /_AUTH$/i,
  /API_KEY/i,
  /ACCESS_KEY/i,
  /SESSION/i,
];

/**
 * Value display modes - from most to least safe
 */
export type DebugValueMode =
  | 'none' // Show nothing - only key, source, resolved status
  | 'length' // Show length only
  | 'fingerprint' // Show sha256 hash (useful for checking if rotation worked)
  | 'masked'; // Show partial reveal (least safe)

/**
 * Security snapshot entry - for incident response
 */
export interface SecuritySnapshotEntry {
  key: string;
  resolved: boolean;
  consumed: boolean;
  source: string | null;
  reference?: string | null;
  resolvedVia?: string | null;
  sensitive: boolean;
  length: number;
  fingerprint: string | null;
  preview: string | null;
  timestamp?: number;
}

/**
 * Visibility levels for different use cases
 *
 * - provenance: key, resolved, source, sensitive (safe default for production)
 * - fingerprint: adds fingerprint (best for incident response)
 * - masked: adds preview (only with explicit opt-in)
 */
export type VisibilityLevel = 'provenance' | 'fingerprint' | 'masked';

/**
 * Security snapshot options
 */
export interface SecuritySnapshotOptions {
  /** Visibility level (default: 'provenance') */
  visibility?: VisibilityLevel;
  /** Include source in output (default: true) */
  includeSource?: boolean;
  /** Include consumed vs available (default: true) */
  includeConsumed?: boolean;
  /** Include timestamp (default: false) */
  includeTimestamp?: boolean;
  /** Custom sensitive key patterns */
  sensitiveKeys?: readonly string[];
  /** Custom sensitive key matcher */
  isSensitive?: (key: string, value: string) => boolean;
}

/**
 * Individual debug entry for a single env var
 */
export interface DebugEntry {
  key: string;
  resolved: boolean;
  source: string | null;
  reference: string | null;
  resolvedVia: string | null;
  sensitive: boolean;
  length: number;
  fingerprint: string | null;
  preview: string | null;
}

/**
 * Debug view options
 */
export interface DebugOptions {
  /** Enable debug view generation (default: false) */
  enabled?: boolean;
  /** Value display mode */
  valueMode?: DebugValueMode;
  /** Include source in debug output (default: true) */
  includeSource?: boolean;
  /** Custom sensitive key patterns */
  sensitiveKeys?: readonly string[];
  /** Custom sensitive key matcher */
  isSensitive?: (key: string, value: string) => boolean;
  /** Callback called for each debug entry as it's resolved (default: none) */
  onDebugEntry?: (entry: DebugEntry) => void;
}

/**
 * Mask a value based on its length
 */
function maskValue(value: string, _sensitive: boolean): string {
  const len = value.length;

  if (len === 0) {
    return '';
  }

  if (len <= 4) {
    return '****';
  }

  if (len <= 8) {
    return `${value[0]}****${value[len - 1]}`;
  }

  if (len <= 16) {
    return `${value.slice(0, 2)}****${value.slice(len - 2)}`;
  }

  // Length 17+: first 4 + ... + last 4
  return `${value.slice(0, 4)}…${value.slice(len - 4)}`;
}

/**
 * Generate SHA-256 fingerprint
 */
function fingerprint(value: string): string {
  const hash = createHash('sha256');
  hash.update(value);
  return `sha256:${hash.digest('hex').slice(0, 8)}`;
}

/**
 * Check if a key is sensitive based on heuristics or custom function
 */
function isSensitiveKey(
  key: string,
  _value: string,
  customIsSensitive?: (key: string, value: string) => boolean,
  customSensitiveKeys?: readonly string[],
): boolean {
  if (customIsSensitive) {
    return customIsSensitive(key, _value);
  }

  const upperKey = key.toUpperCase();

  if (customSensitiveKeys) {
    for (const pattern of customSensitiveKeys) {
      if (new RegExp(pattern, 'i').test(upperKey)) {
        return true;
      }
    }
  }

  for (const pattern of DEFAULT_SENSITIVE_PATTERNS) {
    if (pattern.test(upperKey)) {
      return true;
    }
  }

  return false;
}

/**
 * Generate debug entry for a single env var
 */
export function createDebugEntry(
  key: string,
  value: string | undefined,
  provenance: Provenance | undefined,
  options: DebugOptions,
): DebugEntry {
  const resolved = value !== undefined;
  const length = value?.length ?? 0;
  const sensitive =
    resolved &&
    isSensitiveKey(key, value, options.isSensitive, options.sensitiveKeys);

  let preview: string | null = null;
  let fp: string | null = null;

  if (resolved && value) {
    switch (options.valueMode) {
      case 'fingerprint':
        fp = fingerprint(value);
        break;
      case 'masked':
        if (sensitive) {
          preview = maskValue(value, sensitive);
        } else {
          // Non-sensitive values can show full in masked mode
          preview = value;
        }
        break;
      case 'length':
        // Just length - already captured
        break;
      case 'none':
      default:
        // No value info
        break;
    }
  }

  return {
    key,
    resolved,
    source:
      options.includeSource !== false ? (provenance?.source ?? null) : null,
    reference: provenance?.reference ?? null,
    resolvedVia: provenance?.resolvedVia ?? null,
    sensitive,
    length,
    fingerprint: fp,
    preview,
  };
}

/**
 * Generate debug view for resolved config
 */
export function createDebugView(
  resolved: Record<string, unknown>,
  provenance: Record<string, Provenance>,
  options: DebugOptions,
): DebugEntry[] {
  const entries: DebugEntry[] = [];

  for (const key of Object.keys(resolved)) {
    const value =
      resolved[key] !== undefined ? String(resolved[key]) : undefined;
    const prov = provenance[key];

    entries.push(createDebugEntry(key, value, prov, options));
  }

  return entries;
}

/**
 * Default debug options - safe defaults
 */
export const DEFAULT_DEBUG_OPTIONS: DebugOptions = {
  enabled: false,
  valueMode: 'none',
  includeSource: true,
  sensitiveKeys: [],
};

/**
 * Generate security snapshot for incident response
 *
 * @example
 * ```typescript
 * const snapshot = createSecuritySnapshot(
 *   resolvedConfig,
 *   provenanceMap,
 *   consumedMap,
 *   { visibility: 'fingerprint', includeConsumed: true }
 * );
 *
 * // Output:
 * // [
 * //   { key: "PORT", resolved: true, consumed: true, source: "processEnv", sensitive: false, length: 4, preview: "3000" },
 * //   { key: "STRIPE_SECRET_KEY", resolved: true, consumed: true, source: "awsSecrets", sensitive: true, fingerprint: "sha256:ab12cd34", length: 51 }
 * // ]
 * ```
 */
export function createSecuritySnapshot(
  resolved: Record<string, unknown>,
  provenance: Record<string, Provenance>,
  consumed: Record<string, boolean>,
  options: SecuritySnapshotOptions,
): SecuritySnapshotEntry[] {
  const opts = {
    visibility: 'provenance' as VisibilityLevel,
    includeSource: true,
    includeConsumed: true,
    includeTimestamp: false,
    sensitiveKeys: [],
    ...options,
  };

  const debugOptions: DebugOptions = {
    valueMode:
      opts.visibility === 'masked'
        ? 'masked'
        : opts.visibility === 'fingerprint'
          ? 'fingerprint'
          : 'none',
    includeSource: opts.includeSource,
    sensitiveKeys: opts.sensitiveKeys,
    isSensitive: opts.isSensitive,
  };

  const entries: SecuritySnapshotEntry[] = [];

  for (const key of Object.keys(resolved)) {
    const value =
      resolved[key] !== undefined ? String(resolved[key]) : undefined;
    const prov = provenance[key];
    const isConsumed = consumed[key] ?? false;

    const debugEntry = createDebugEntry(key, value, prov, debugOptions);

    const entry: SecuritySnapshotEntry = {
      key: debugEntry.key,
      resolved: debugEntry.resolved,
      consumed: opts.includeConsumed ? isConsumed : false,
      source: debugEntry.source,
      reference: debugEntry.reference,
      resolvedVia: debugEntry.resolvedVia,
      sensitive: debugEntry.sensitive,
      length: debugEntry.length,
      fingerprint: debugEntry.fingerprint,
      preview: debugEntry.preview,
    };

    if (opts.includeTimestamp && prov?.timestamp) {
      entry.timestamp = prov.timestamp;
    }

    entries.push(entry);
  }

  return entries;
}

/**
 * Generate a redacted object for human-readable debugging
 *
 * Non-sensitive values: shown as-is or masked
 * Sensitive values: [sha256:xxxx] or [redacted]
 *
 * @example
 * ```typescript
 * const redacted = createRedactedObject(
 *   resolvedConfig,
 *   provenanceMap,
 *   { valueMode: 'fingerprint' }
 * );
 *
 * // Output:
 * // { PORT: "3000", STRIPE_SECRET_KEY: "[sha256:ab12cd34]", DATABASE_URL: "[sha256:94e1b7aa]" }
 * ```
 */
export function createRedactedObject(
  resolved: Record<string, unknown>,
  provenance: Record<string, Provenance>,
  options: DebugOptions,
): Record<string, string> {
  const opts = {
    valueMode: 'none' as DebugValueMode,
    includeSource: true,
    sensitiveKeys: [],
    ...options,
  };

  const result: Record<string, string> = {};

  for (const key of Object.keys(resolved)) {
    const value =
      resolved[key] !== undefined ? String(resolved[key]) : undefined;
    const prov = provenance[key];

    const debugEntry = createDebugEntry(key, value, prov, opts);

    if (debugEntry.preview) {
      result[key] = debugEntry.preview;
    } else if (debugEntry.fingerprint) {
      result[key] = `[${debugEntry.fingerprint}]`;
    } else if (debugEntry.resolved) {
      result[key] = debugEntry.sensitive
        ? '[redacted]'
        : (value ?? '**undefined**');
    } else {
      result[key] = '**not resolved**';
    }
  }

  return result;
}
