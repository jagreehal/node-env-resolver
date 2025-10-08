/**
 * Tests for environment variable name validation
 */
import { describe, it, expect } from 'vitest';
import { resolve, safeResolve } from './index';

describe('Environment Variable Name Validation', () => {
  it('should validate environment variable names in resolve', () => {
    // Test invalid variable name (should throw)
    expect(() => resolve({
      'PORxxxT': 3000, // Invalid variable name
    })).toThrow('Invalid environment variable name: "PORxxxT"');

    // Test valid variable name (should work) - use default value to avoid "missing required" error
    const result = resolve({
      'VALID_VAR': { type: 'string', default: 'default-value' },
    });
    expect(result.VALID_VAR).toBe('default-value'); // Should get default value for valid name
  });

  it('should validate environment variable names in safeResolve', () => {
    // Test invalid variable name (should return error result)
    const safeResult = safeResolve({
      'PORxxxT': 3000, // Invalid variable name
    });

    expect(safeResult.success).toBe(false);
    if (!safeResult.success) {
      expect(safeResult.error).toContain('Invalid environment variable name: "PORxxxT"');
    }

    // Test valid variable name (should work) - use default value to avoid "missing required" error
    const validResult = safeResolve({
      'VALID_VAR': { type: 'string', default: 'default-value' },
    });

    expect(validResult.success).toBe(true);
    if (validResult.success) {
      expect(validResult.data.VALID_VAR).toBe('default-value');
    }
  });

  it('should accept valid environment variable names', async () => {
    // Test various valid patterns - use unique names that don't conflict with env
    const validNames = [
      'TEST_PORT',
      'TEST_DATABASE_URL',
      'TEST_API_KEY',
      'MY_VAR_123',
      'VAR_WITH_UNDERSCORES',
    ];

    for (const name of validNames) {
      const result = await safeResolve({
        [name]: { type: 'string', default: 'default-value' },
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data[name]).toBe('default-value');
      }
    }
  });

  it('should reject invalid environment variable names', async () => {
    // Test various invalid patterns
    const invalidNames = [
      'PORxxxT', // Contains lowercase and 'xxx'
      '123PORT', // Starts with number
      'port', // All lowercase
      'PORT-NAME', // Contains dash
      'PORT.NAME', // Contains dot
      'PORT NAME', // Contains space
      'PORT@NAME', // Contains special char
    ];

    for (const name of invalidNames) {
      const result = await safeResolve({
        [name]: 3000, // Use number to avoid "missing required" errors for invalid names
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain(`Invalid environment variable name: "${name}"`);
      }
    }
  });
});
