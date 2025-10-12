/**
 * Unified validation types for all integrations (Zod, Valibot, etc.)
 * These types compile away at runtime (0 bytes)
 */

/**
 * Represents a single validation issue with field-level details
 */
export interface ValidationIssue {
  /** Path to the field that failed validation, e.g. ['DATABASE_URL'] or ['user', 'email'] */
  path: (string | number)[];
  /** Human-readable error message */
  message: string;
  /** Optional error code for programmatic handling, e.g. 'invalid_url', 'required' */
  code?: string;
}

/**
 * Result type for safe resolve functions
 * Consistent across all validators (Zod, Valibot, built-in)
 */
export type SafeResolveResult<T> =
  | { success: true; data: T }
  | { success: false; error: string; issues: ValidationIssue[] };
