/**
 * Audit logging for environment variable resolution
 */

export type AuditEventType =
  | 'validation_success'
  | 'validation_failure'
  | 'policy_violation'
  | 'env_loaded'
  | 'provider_error'
  | 'resolver_error';

export interface AuditEvent {
  type: AuditEventType;
  timestamp: number;
  key?: string;
  source?: string;
  error?: string;
  metadata?: Record<string, unknown>;
}

const auditLog: AuditEvent[] = [];
const MAX_AUDIT_EVENTS = 1000; // Prevent memory leaks

export function logAuditEvent(event: AuditEvent): void {
  auditLog.push(event);
  // Keep only last 1000 events to prevent memory leaks
  if (auditLog.length > MAX_AUDIT_EVENTS) {
    auditLog.shift();
  }
}

export function getAuditLog(): readonly AuditEvent[] {
  return [...auditLog];
}

export function clearAuditLog(): void {
  auditLog.length = 0;
}
