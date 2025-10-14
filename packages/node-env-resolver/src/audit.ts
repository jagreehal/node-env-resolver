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
  sessionId?: string; // For tracking per-config audit logs
}

const auditLog: AuditEvent[] = [];
const MAX_AUDIT_EVENTS = 1000; // Prevent memory leaks

// WeakMap to track config objects to their audit session IDs
// WeakMap allows garbage collection when config objects are no longer referenced
const configToSessionId = new WeakMap<object, string>();

/**
 * Attach an audit session ID to a config object
 * Returns the session ID for use in audit events
 */
export function attachAuditSession(config: object): string {
  // Generate a unique session ID (timestamp + random)
  const sessionId = Date.now().toString(36) + Math.random().toString(36).substring(2, 9);
  configToSessionId.set(config, sessionId);
  return sessionId;
}

export function logAuditEvent(event: AuditEvent): void {
  auditLog.push(event);
  // Keep only last 1000 events to prevent memory leaks
  if (auditLog.length > MAX_AUDIT_EVENTS) {
    auditLog.shift();
  }
}

/**
 * Get audit log, optionally filtered by config object
 * 
 * @param config - Optional config object to filter audit events for
 * @returns Audit events (all events if no config provided, or filtered by config's session)
 */
export function getAuditLog(config?: object): readonly AuditEvent[] {
  if (!config) {
    // No config provided - return all events (backward compatible)
    return [...auditLog];
  }
  
  // Get session ID for this config
  const sessionId = configToSessionId.get(config);
  if (!sessionId) {
    // Config has no session - return empty array
    return [];
  }
  
  // Filter events by session ID
  return auditLog.filter(event => event.sessionId === sessionId);
}

export function clearAuditLog(): void {
  auditLog.length = 0;
}
