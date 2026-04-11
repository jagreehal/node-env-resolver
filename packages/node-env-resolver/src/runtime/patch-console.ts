/**
 * Patch global console methods to redact sensitive values
 *
 * Prevents accidental logging of secrets by intercepting console methods
 * and redacting values matching sensitive patterns.
 */

import {
  createRedactor,
  extractSensitiveValues,
  type RedactorOptions,
} from './redactor.js';

export interface ConsolePatchOptions extends RedactorOptions {
  enabled?: boolean;
  methods?: ('log' | 'debug' | 'info' | 'warn' | 'error' | 'trace')[];
  redactStrings?: boolean;
  redactObjects?: boolean;
}

const PATCHED_KEY = '__nodeEnvResolverPatched';

interface ConsoleWithPatched {
  __nodeEnvResolverPatched?: boolean;
}

export function patchGlobalConsole(
  config: Record<string, unknown>,
  options: ConsolePatchOptions = {},
): () => void {
  const {
    enabled = true,
    methods = ['log', 'debug', 'info', 'warn', 'error', 'trace'],
    redactStrings = true,
    redactObjects = true,
    ...redactorOptions
  } = options;

  if (!enabled) {
    return () => {};
  }

  const consoleWithPatched = console as ConsoleWithPatched;

  if (consoleWithPatched[PATCHED_KEY]) {
    return () => {
      // Already patched - return a no-op unpatch
    };
  }

  const sensitiveValues = extractSensitiveValues(config);
  const redactor = createRedactor(sensitiveValues, redactorOptions);

  const originalMethods: Record<string, (...args: unknown[]) => void> = {};

  for (const method of methods) {
    if (typeof console[method] === 'function') {
      originalMethods[method] = console[method].bind(console);

      const original = originalMethods[method];

      (console as unknown as Record<string, unknown>)[method] = (
        ...args: unknown[]
      ) => {
        const redactedArgs = args.map((arg) => {
          if (typeof arg === 'string' && redactStrings) {
            return redactor.redactString(arg);
          }
          if (typeof arg === 'object' && redactObjects && arg !== null) {
            return redactor.redactObject(arg);
          }
          return arg;
        });

        original(...redactedArgs);
      };
    }
  }

  // Use Object.defineProperty to ensure the property is properly set
  Object.defineProperty(consoleWithPatched, PATCHED_KEY, {
    value: true,
    writable: true,
    enumerable: false,
    configurable: true,
  });

  return () => {
    for (const method of methods) {
      if (originalMethods[method]) {
        // Bind the original method back to console to ensure 'this' context is correct
        const originalFn = originalMethods[method];
        const boundOriginal = originalFn.bind(console);
        (console as unknown as Record<string, unknown>)[method] = boundOriginal;
      }
    }
    // Try to delete the property to ensure it's properly cleared
    try {
      delete (consoleWithPatched as Record<string, unknown>)[PATCHED_KEY];
    } catch {
      // Ignore if delete fails
    }
    // Also set it to false as fallback
    consoleWithPatched[PATCHED_KEY] = false;
  };
}

export function createConsoleRedactor(
  config: Record<string, unknown>,
  options: ConsolePatchOptions = {},
) {
  const sensitiveValues = extractSensitiveValues(config);
  const redactor = createRedactor(sensitiveValues, options);

  return {
    redact: (...args: unknown[]) => {
      return args.map((arg) => {
        if (typeof arg === 'string') {
          return redactor.redactString(arg);
        }
        if (typeof arg === 'object' && arg !== null) {
          return redactor.redactObject(arg);
        }
        return arg;
      });
    },
    ...redactor,
  };
}
