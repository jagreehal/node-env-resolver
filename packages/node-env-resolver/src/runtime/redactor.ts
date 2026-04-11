/**
 * Redaction utilities for protecting secrets in logs and responses
 */

export interface RedactorOptions {
  sensitiveKeys?: string[];
  sensitivePatterns?: RegExp[];
  customPatterns?: RegExp[];
  fallbackValue?: string;
}

const DEFAULT_SENSITIVE_KEY_PATTERNS: RegExp[] = [
  /password/i,
  /secret/i,
  /token/i,
  /key/i,
  /credential/i,
  /auth/i,
  /api[_-]?key/i,
  /access[_-]?token/i,
  /refresh[_-]?token/i,
  /private[_-]?key/i,
  /database[_-]?url/i,
  /db[_-]?url/i,
  /connection[_-]?string/i,
  /conn[_-]?string/i,
  /dsn/i,
  /bearer/i,
];

const DEFAULT_SECRET_PATTERNS: RegExp[] = [
  /sk_live_[a-zA-Z0-9]{24,}/g,
  /sk_test_[a-zA-Z0-9]{24,}/g,
  /pk_live_[a-zA-Z0-9]{24,}/g,
  /pk_test_[a-zA-Z0-9]{24,}/g,
  /xox[baprs]-[a-zA-Z0-9-]+/g,
  /ghp_[a-zA-Z0-9]{36}/g,
  /gho_[a-zA-Z0-9]{36}/g,
  /ghu_[a-zA-Z0-9]{36}/g,
  /ghs_[a-zA-Z0-9]{36}/g,
  /ghr_[a-zA-Z0-9]{36}/g,
  /eyJ[a-zA-Z0-9_-]*\.eyJ[a-zA-Z0-9_-]*\.[a-zA-Z0-9_-]*/g,
  /postgres:\/\/[^@]+:[^@]+@/g,
  /mysql:\/\/[^@]+:[^@]+@/g,
  /mongodb(\+srv)?:\/\/[^@]+:[^@]+@/g,
  /redis:\/\/[^:]+:[^@]+@/g,
  /rediss:\/\/[^:]+:[^@]+@/g,
];

function maskValue(value: string): string {
  const len = value.length;
  if (len <= 4) return '****';
  if (len <= 8) return `${value[0]}****${value[len - 1]}`;
  if (len <= 16) return `${value.slice(0, 2)}****${value.slice(-2)}`;
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

export function createRedactor(
  sensitiveValues: Map<string, string>,
  options: RedactorOptions = {},
) {
  const {
    sensitivePatterns = DEFAULT_SENSITIVE_KEY_PATTERNS,
    customPatterns = [],
    fallbackValue = '[REDACTED]',
  } = options;

  const allPatterns = [...DEFAULT_SECRET_PATTERNS, ...customPatterns];

  function shouldRedactKey(key: string): boolean {
    return sensitivePatterns.some((pattern) => pattern.test(key));
  }

  function redactSecretsInString(str: string): string {
    let result = str;

    for (const [, value] of sensitiveValues) {
      if (typeof value === 'string' && value.length > 0) {
        const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        result = result.replace(new RegExp(escaped, 'g'), fallbackValue);
      }
    }

    for (const pattern of allPatterns) {
      result = result.replace(pattern, fallbackValue);
    }

    return result;
  }

  function redactObject(obj: unknown, depth = 0, seen = new WeakSet()): unknown {
    if (depth > 10) return obj;
    if (obj === null || obj === undefined) return obj;
    if (typeof obj === 'string') return redactSecretsInString(obj);
    if (typeof obj !== 'object') return obj;

    if (seen.has(obj)) return '[Circular]';
    seen.add(obj);

    if (Array.isArray(obj)) {
      return obj.map((item) => redactObject(item, depth + 1, seen));
    }

    if (obj instanceof Error) {
      const redacted = new Error(redactSecretsInString(obj.message));
      redacted.name = obj.name;
      redacted.stack = obj.stack ? redactSecretsInString(obj.stack) : undefined;
      return redacted;
    }

    if (obj instanceof Date) return obj;
    if (obj instanceof RegExp) return obj;

    if (obj instanceof Map) {
      return new Map(
        Array.from(obj.entries()).map(([k, v]) => [
          redactObject(k, depth + 1, seen),
          redactObject(v, depth + 1, seen),
        ]),
      );
    }

    if (obj instanceof Set) {
      return new Set(Array.from(obj.values()).map((v) => redactObject(v, depth + 1, seen)));
    }

    const redacted: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      if (shouldRedactKey(key)) {
        redacted[key] = typeof value === 'string' ? fallbackValue : '[REDACTED]';
      } else if (typeof value === 'string') {
        redacted[key] = redactSecretsInString(value);
      } else {
        redacted[key] = redactObject(value, depth + 1, seen);
      }
    }
    return redacted;
  }

  return {
    redactString: redactSecretsInString,
    redactObject,
    maskValue,
    createFingerprint: (value: string) => {
      let hash = 0;
      for (let i = 0; i < value.length; i++) {
        const char = value.charCodeAt(i);
        hash = (hash << 5) - hash + char;
        hash = hash & hash;
      }
      return `sha256:${Math.abs(hash).toString(16).slice(0, 8)}`;
    },
    shouldRedactKey,
  };
}

export function extractSensitiveValues(
  config: Record<string, unknown>,
  options: { sensitiveKeys?: string[] } = {},
): Map<string, string> {
  const sensitiveValues = new Map<string, string>();
  const patterns =
    options.sensitiveKeys?.map((k) => new RegExp(k, 'i')) ?? DEFAULT_SENSITIVE_KEY_PATTERNS;

  for (const [key, value] of Object.entries(config)) {
    if (typeof value === 'string' && patterns.some((p) => p.test(key))) {
      sensitiveValues.set(key, value);
    }
  }

  return sensitiveValues;
}
