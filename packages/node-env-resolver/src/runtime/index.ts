/**
 * Runtime protection utilities for preventing secret leaks
 *
 * Quick start — protect everything with one call:
 * ```typescript
 * import { protect } from 'node-env-resolver/runtime';
 *
 * const unprotect = protect(config);
 * // console methods now redact secrets automatically
 *
 * // Optional: add response scanning in your server/edge handler
 * app.use(createResponseMiddleware(config));          // Express / Hono
 * return wrapFetchResponse(response, config);         // Edge runtime
 * ```
 *
 * Or compose individual primitives for fine-grained control:
 * ```typescript
 * import {
 *   patchGlobalConsole,
 *   createResponseMiddleware,
 *   wrapFetchResponse,
 * } from 'node-env-resolver/runtime';
 *
 * const unpatch = patchGlobalConsole(config, { methods: ['error', 'warn'] });
 * app.use(createResponseMiddleware(config, { mode: 'redact' }));
 * ```
 */

import { patchGlobalConsole, type ConsolePatchOptions } from './patch-console.js';
import type { ResponsePatchOptions } from './response.js';

export {
  patchGlobalConsole,
  createConsoleRedactor,
  type ConsolePatchOptions,
} from './patch-console.js';

export {
  createResponseMiddleware,
  wrapFetchResponse,
  scanBodyForSecrets,
  type ResponsePatchOptions,
} from './response.js';

export {
  createRedactor,
  extractSensitiveValues,
  type RedactorOptions,
} from './redactor.js';

export interface ProtectOptions {
  /** Options forwarded to patchGlobalConsole. Pass false to disable console patching. */
  console?: ConsolePatchOptions | false;
  /** Options forwarded to createResponseMiddleware. Response protection must still be
   *  wired up separately — this just pre-configures the options. */
  responses?: ResponsePatchOptions;
}

/**
 * Enable runtime secret protection in one call.
 *
 * Patches global console methods to redact sensitive values.
 * Returns an `unpatch` function that restores the originals.
 *
 * Response protection is intentionally explicit — use `createResponseMiddleware`
 * or `wrapFetchResponse` to add it to your server/edge handler.
 *
 * @example
 * ```ts
 * import { protect } from 'node-env-resolver/runtime';
 *
 * const unprotect = protect(config);
 * // console.log('key:', config.API_KEY) → console.log('key:', '[REDACTED]')
 *
 * // Restore originals when done (e.g. in tests)
 * unprotect();
 * ```
 */
export function protect(
  config: Record<string, unknown>,
  options: ProtectOptions = {},
): () => void {
  if (options.console === false) {
    return () => {};
  }
  return patchGlobalConsole(config, options.console);
}
