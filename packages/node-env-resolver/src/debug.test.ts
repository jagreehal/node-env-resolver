import { describe, expect, it } from 'vitest';
import {
  createDebugView,
  createRedactedObject,
  type DebugOptions,
} from './debug';
import type { Provenance } from './types';

describe('debug helpers', () => {
  it('redacts sensitive values in createRedactedObject when valueMode is none', () => {
    const resolved = {
      API_KEY: 'super-secret-key',
      PORT: '3000',
    };
    const provenance: Record<string, Provenance> = {
      API_KEY: { source: 'process.env', timestamp: 1 },
      PORT: { source: 'process.env', timestamp: 1 },
    };

    const redacted = createRedactedObject(resolved, provenance, {
      valueMode: 'none',
    });

    expect(redacted.API_KEY).toBe('[redacted]');
    expect(redacted.PORT).toBe('3000');
  });

  it('does not include raw sensitive values in debug entries for fingerprint mode', () => {
    const resolved = {
      API_KEY: 'super-secret-key',
    };
    const provenance: Record<string, Provenance> = {
      API_KEY: { source: 'awsSecrets', timestamp: 1 },
    };
    const options: DebugOptions = {
      valueMode: 'fingerprint',
      includeSource: true,
    };

    const [entry] = createDebugView(resolved, provenance, options);

    expect(entry.sensitive).toBe(true);
    expect(entry.fingerprint).toMatch(/^sha256:/);
    expect(entry).not.toHaveProperty('value');
  });

  it('treats database urls as sensitive by default', () => {
    const resolved = {
      DATABASE_URL: 'postgres://user:pass@host/db',
    };
    const provenance: Record<string, Provenance> = {
      DATABASE_URL: { source: 'awsSecrets', timestamp: 1 },
    };

    const [entry] = createDebugView(resolved, provenance, {
      valueMode: 'fingerprint',
      includeSource: true,
    });

    expect(entry.sensitive).toBe(true);
    expect(entry.fingerprint).toMatch(/^sha256:/);
    expect(entry).not.toHaveProperty('value');
  });

  it('does not treat generic public urls as sensitive by default', () => {
    const resolved = {
      PUBLIC_URL: 'https://example.com',
    };
    const provenance: Record<string, Provenance> = {
      PUBLIC_URL: { source: 'process.env', timestamp: 1 },
    };

    const [entry] = createDebugView(resolved, provenance, {
      valueMode: 'fingerprint',
      includeSource: true,
    });

    expect(entry.sensitive).toBe(false);
    expect(entry.fingerprint).toMatch(/^sha256:/);
    expect(entry).not.toHaveProperty('value');
  });
});
