/**
 * Safe Resolve Demo
 * Demonstrates the new safeResolve and safeResolveSync functions
 */
import { describe, it, expect } from 'vitest';
import { safeResolve, safeResolveAsync } from 'node-env-resolver';
import { number, processEnv, string, url } from 'node-env-resolver/resolvers';

describe('Safe Resolve Demo', () => {
  it('should demonstrate safeResolve vs resolve behavior', () => {
    // Set up environment
    process.env.PORT = '3000';
    process.env.NODE_ENV = 'production';

    // ❌ This would throw an error if validation fails
    // const config = resolve({
    //   PORT: 'number',
    //   MISSING_VAR: string(), // This would cause an error
    // });

    // ✅ This returns a result object instead of throwing
    const safeResult = safeResolve({
      PORT: number(),
      MISSING_VAR: string(), // This fails validation
    });

    console.log('Safe resolve result:', safeResult);
    expect(safeResult.success).toBe(false);

    // ✅ This works when validation passes
    const successResult = safeResolve({
      PORT: number(),
      NODE_ENV: ['development', 'production', 'test'] as const,
    });

    console.log('Success result:', successResult);
    expect(successResult.success).toBe(true);
    if (successResult.success) {
      expect(successResult.data.PORT).toBe(3000);
      expect(successResult.data.NODE_ENV).toBe('production');
    }

    // Clean up
    delete process.env.PORT;
    delete process.env.NODE_ENV;
  });

  it('should demonstrate safeResolve', () => {
    process.env.PORT = '8080';

    // ✅ Works with resolvers
    const result = safeResolve({
      PORT: number(),
      DEBUG: false, // boolean with default
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.PORT).toBe(8080);
      expect(result.data.DEBUG).toBe(false);
    }

    // Clean up
    delete process.env.PORT;
  });

  it('should demonstrate saferesolveAsync with multiple resolvers', async () => {
    process.env.NODE_ENV = 'production';
    process.env.PORT = '3000';

    // Mock secrets provider
    const mockSecrets = {
      name: 'mock-secrets',
      async load() {
        return {
          DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
        };
      },
    };

    const result = await safeResolveAsync(
      [processEnv(), {
        NODE_ENV: ['development', 'production', 'test'] as const,
        PORT: 3000,
      }],
      [mockSecrets, {
        DATABASE_URL: url(),
      }]
    );

    console.log('Multi-resolver result:', result);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.NODE_ENV).toBe('production');
      expect(result.data.PORT).toBe(3000);
      expect(result.data.DATABASE_URL).toBe('postgresql://user:pass@localhost:5432/db');
    }

    // Clean up
    delete process.env.NODE_ENV;
    delete process.env.PORT;
  });
});
