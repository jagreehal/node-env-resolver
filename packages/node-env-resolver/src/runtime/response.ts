/**
 * Response protection utilities for preventing secret leakage in HTTP responses
 *
 * Provides middleware for Node.js (Express/Connect/Hono) and a utility for
 * Edge runtimes (Cloudflare Workers, Vercel Edge, etc.).
 *
 * @example Node.js / Express
 * ```ts
 * import express from 'express';
 * import { createResponseMiddleware } from 'node-env-resolver/runtime';
 *
 * const app = express();
 * app.use(createResponseMiddleware(config, { mode: 'throw' }));
 * ```
 *
 * @example Edge runtime
 * ```ts
 * import { wrapFetchResponse } from 'node-env-resolver/runtime';
 *
 * export default {
 *   async fetch(req, env) {
 *     const response = await handler(req);
 *     return wrapFetchResponse(response, config, { mode: 'redact' });
 *   }
 * }
 * ```
 */

import {
  createRedactor,
  extractSensitiveValues,
  type RedactorOptions,
} from './redactor.js';

export interface ResponsePatchOptions extends RedactorOptions {
  mode?: 'throw' | 'redact' | 'warn';
  ignoreContentTypes?: string[];
  maxBodySize?: number;
}

const DEFAULT_IGNORE_CONTENT_TYPES = [
  'image/',
  'video/',
  'audio/',
  'application/octet-stream',
  'application/pdf',
];

function shouldScanContentType(contentType: string, ignoreList: string[]): boolean {
  const lower = contentType.toLowerCase();
  return !ignoreList.some((ignored) => lower.includes(ignored.toLowerCase()));
}

function applyMode(
  original: string,
  redacted: string,
  mode: 'throw' | 'redact' | 'warn',
): string {
  if (redacted === original) return original;

  if (mode === 'throw') {
    throw new Error(
      'Secret leak detected in HTTP response body. ' +
        'A sensitive value was found before it could be sent. ' +
        'Use mode: "redact" to automatically scrub, or mode: "warn" to log and continue.',
    );
  }

  if (mode === 'warn') {
    console.warn(
      '[node-env-resolver] Potential secret leak detected in HTTP response. ' +
        'Set mode: "redact" to scrub automatically.',
    );
    return original;
  }

  return redacted;
}

/**
 * Express / Connect / Hono middleware that scans outgoing response bodies
 * for sensitive values and redacts, warns, or throws depending on `mode`.
 *
 * Default mode: 'warn' in production, 'throw' in development.
 */
export function createResponseMiddleware(
  config: Record<string, unknown>,
  options: ResponsePatchOptions = {},
) {
  const {
    mode = process.env.NODE_ENV === 'production' ? 'warn' : 'throw',
    ignoreContentTypes = DEFAULT_IGNORE_CONTENT_TYPES,
    maxBodySize = 1024 * 1024,
    ...redactorOptions
  } = options;

  const sensitiveValues = extractSensitiveValues(config);
  const redactor = createRedactor(sensitiveValues, redactorOptions);

  return function responseProtectionMiddleware(
    _req: unknown,
    res: {
      end: (...args: unknown[]) => unknown;
      write?: (...args: unknown[]) => unknown;
      getHeader?: (name: string) => string | number | string[] | undefined;
    },
    next: () => void,
  ): void {
    const originalEnd = res.end.bind(res);

    res.end = function (...args: unknown[]) {
      const chunk = args[0];

      if (chunk != null && (typeof chunk === 'string' || Buffer.isBuffer(chunk))) {
        const contentType = String(res.getHeader?.('content-type') ?? '');

        if (shouldScanContentType(contentType, ignoreContentTypes)) {
          const content = typeof chunk === 'string' ? chunk : chunk.toString('utf8');

          if (Buffer.byteLength(content) <= maxBodySize) {
            try {
              const redacted = redactor.redactString(content);
              args[0] = applyMode(content, redacted, mode);
            } catch (err) {
              if (mode === 'throw') throw err;
              console.error('[node-env-resolver] Response scan error:', err);
            }
          }
        }
      }

      return originalEnd(...args);
    };

    next();
  };
}

/**
 * Scan and optionally redact an Edge runtime `Response` object.
 * Returns a new Response (original is consumed). Safe to use in
 * Cloudflare Workers, Vercel Edge Functions, and Deno Deploy.
 */
export async function wrapFetchResponse(
  response: Response,
  config: Record<string, unknown>,
  options: ResponsePatchOptions = {},
): Promise<Response> {
  const {
    mode = 'warn',
    ignoreContentTypes = DEFAULT_IGNORE_CONTENT_TYPES,
    maxBodySize = 1024 * 1024,
    ...redactorOptions
  } = options;

  const contentType = response.headers.get('content-type') ?? '';

  if (!shouldScanContentType(contentType, ignoreContentTypes)) {
    return response;
  }

  const cloned = response.clone();
  const buffer = await cloned.arrayBuffer();

  if (buffer.byteLength > maxBodySize) {
    return response;
  }

  const content = new TextDecoder().decode(buffer);
  const sensitiveValues = extractSensitiveValues(config);
  const redactor = createRedactor(sensitiveValues, redactorOptions);
  const redacted = redactor.redactString(content);

  if (redacted === content) return response;

  if (mode === 'throw') {
    throw new Error(
      'Secret leak detected in HTTP response. ' +
        'Use mode: "redact" to scrub automatically.',
    );
  }

  if (mode === 'warn') {
    console.warn('[node-env-resolver] Potential secret leak detected in HTTP response.');
    return response;
  }

  return new Response(redacted, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}

/**
 * Utility to imperatively scan a response body for secrets.
 * Useful when you need to check manually rather than via middleware.
 */
export function scanBodyForSecrets(
  body: string | Buffer | unknown,
  config: Record<string, unknown>,
  options: ResponsePatchOptions = {},
): { safe: boolean; redacted?: string } {
  if (typeof body !== 'string' && !Buffer.isBuffer(body)) {
    return { safe: true };
  }

  const sensitiveValues = extractSensitiveValues(config);
  const redactor = createRedactor(sensitiveValues, options);
  const content = typeof body === 'string' ? body : body.toString('utf8');
  const redacted = redactor.redactString(content);

  if (redacted !== content) {
    return { safe: false, redacted };
  }

  return { safe: true };
}
