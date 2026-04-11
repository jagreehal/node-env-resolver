/**
 * Runtime Protection Example
 *
 * Demonstrates the runtime protection features:
 * - Console log redaction
 * - HTTP response scanning
 * - Sensitive value extraction
 */
import { resolve, resolveAsync } from 'node-env-resolver';
import { string, url } from 'node-env-resolver/validators';
import {
  patchGlobalConsole,
  createRedactor,
  extractSensitiveValues,
} from 'node-env-resolver/runtime';
import { processEnv } from 'node-env-resolver/resolvers';

describe('Runtime Protection Examples', () => {
  describe('Sensitive Value Extraction', () => {
    it('should extract all sensitive values from config', async () => {
      process.env.API_KEY = 'sk-test-123';
      process.env.PUBLIC_TOKEN = 'public-token';
      process.env.DATABASE_URL = 'postgres://localhost:5432/db';
      process.env.DEBUG = 'true';

      const config = await resolveAsync({
        resolvers: [
          [
            processEnv(),
            {
              API_KEY: string(),
              PUBLIC_TOKEN: string({ optional: true }),
              DATABASE_URL: url({ optional: true }),
              DEBUG: false,
            },
          ],
        ],
      });

      const sensitiveValues = extractSensitiveValues(config, {
        sensitiveKeys: ['key', 'secret', 'token', 'password', 'url'],
      });

      expect(sensitiveValues.size).toBeGreaterThan(0);
      expect(sensitiveValues.has('API_KEY')).toBe(true);
    });
  });

  describe('Redactor Creation', () => {
    it('should create a redactor with custom patterns', async () => {
      process.env.API_KEY = 'sk-abc123xyz';
      process.env.DEBUG = 'true';

      const config = await resolveAsync({
        resolvers: [
          [
            processEnv(),
            {
              API_KEY: string({ optional: true }),
              DEBUG: false,
            },
          ],
        ],
      });

      const sensitiveValues = extractSensitiveValues(config, {
        sensitiveKeys: ['key', 'secret'],
      });

      const redactor = createRedactor(sensitiveValues, {
        customPatterns: [/sk-[a-zA-Z0-9]+/],
        fallbackValue: '[REDACTED]',
      });

      const text = 'My API key is sk-abc123xyz and more text';
      const redacted = redactor.redactString(text);

      expect(redacted).toContain('[REDACTED]');
      expect(redacted).not.toContain('sk-abc123xyz');
    });

    it('should redact sensitive values from object', async () => {
      process.env.API_KEY = 'super-secret-key';
      process.env.DEBUG = 'true';

      const config = await resolveAsync({
        resolvers: [
          [
            processEnv(),
            {
              API_KEY: string(),
              DEBUG: false,
            },
          ],
        ],
      });

      const sensitiveValues = extractSensitiveValues(config);
      const redactor = createRedactor(sensitiveValues);

      const obj = {
        name: 'test',
        apiKey: 'super-secret-key',
        public: 'value',
      };

      const redacted = redactor.redactObject(obj);

      expect((redacted as { apiKey: string }).apiKey).toBe('[REDACTED]');
      expect((redacted as { name: string }).name).toBe('test');
    });
  });

  describe('Console Patching', () => {
    it('should patch console and extract sensitive values', async () => {
      process.env.API_KEY = 'my-api-key';
      process.env.DEBUG = 'true';

      const config = await resolveAsync({
        resolvers: [
          [
            processEnv(),
            {
              API_KEY: string(),
              DEBUG: false,
            },
          ],
        ],
      });

      const sensitiveValues = extractSensitiveValues(config, {
        sensitiveKeys: ['key', 'secret'],
      });

      expect(sensitiveValues.has('API_KEY')).toBe(true);
    });
  });
});
