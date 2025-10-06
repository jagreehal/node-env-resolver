/**
 * Standard Schema Integration Demo Tests
 * Shows how to use Standard Schema for interoperability
 */
import { describe, it, expect } from 'vitest';
import {
  schemaToStandardSchema,
  validateWithStandardSchema,
} from 'node-env-resolver';

describe('Standard Schema Integration Demo', () => {
  it('should convert a node-env-resolver schema to Standard Schema format', async () => {
    const schema = {
      DATABASE_URL: { type: 'url' as const, secret: true, description: 'Database connection URL' },
      PORT: { type: 'port' as const, default: 3000, description: 'Server port' },
      DEBUG: { type: 'boolean' as const, default: false, description: 'Enable debug mode' }
    };

    const standardSchema = schemaToStandardSchema(schema);

    expect(standardSchema.DATABASE_URL['~standard']).toBeDefined();
    expect(standardSchema.DATABASE_URL['~standard'].vendor).toBe('node-env-resolver');
    expect(standardSchema.PORT['~standard'].version).toBe(1);
    expect(standardSchema.DEBUG['~standard'].types).toBeDefined();
  });

  it('should validate individual values using Standard Schema', async () => {
    const schema = {
      DATABASE_URL: { type: 'url' as const, secret: true, description: 'Database connection URL' },
      PORT: { type: 'port' as const, default: 3000, description: 'Server port' },
      DEBUG: { type: 'boolean' as const, default: false, description: 'Enable debug mode' }
    };
    const standardSchema = schemaToStandardSchema(schema);

    const urlValidation = await validateWithStandardSchema(standardSchema.DATABASE_URL, 'https://example.com');
    expect(urlValidation.value).toBe('https://example.com');
    expect(urlValidation.issues).toBeUndefined();

    const portValidation = await validateWithStandardSchema(standardSchema.PORT, '8080');
    expect(portValidation.value).toBe(8080);
    expect(portValidation.issues).toBeUndefined();

    const debugValidation = await validateWithStandardSchema(standardSchema.DEBUG, 'true');
    expect(debugValidation.value).toBe(true);
    expect(debugValidation.issues).toBeUndefined();

    const invalidPortValidation = await validateWithStandardSchema(standardSchema.PORT, 'invalid');
    expect(invalidPortValidation.issues).toBeDefined();
    expect(invalidPortValidation.issues?.[0].message).toContain('Invalid port');
  });

  it('should handle complex validation scenarios', async () => {
    const schema = {
      EMAIL: { type: 'email' as const, description: 'Email address' },
      JSON_CONFIG: { type: 'json' as const, description: 'JSON configuration' },
      ENUM_VALUE: { type: 'string' as const, enum: ['option1', 'option2', 'option3'] as const, description: 'Enum value' }
    };
    const standardSchema = schemaToStandardSchema(schema);

    // Valid email
    const emailValidation = await validateWithStandardSchema(standardSchema.EMAIL, 'test@example.com');
    expect(emailValidation.value).toBe('test@example.com');
    expect(emailValidation.issues).toBeUndefined();

    // Valid JSON
    const jsonValidation = await validateWithStandardSchema(standardSchema.JSON_CONFIG, '{"key": "value"}');
    expect(jsonValidation.value).toEqual({ key: 'value' });
    expect(jsonValidation.issues).toBeUndefined();

    // Valid enum
    const enumValidation = await validateWithStandardSchema(standardSchema.ENUM_VALUE, 'option2');
    expect(enumValidation.value).toBe('option2');
    expect(enumValidation.issues).toBeUndefined();

    // Invalid email
    const invalidEmailValidation = await validateWithStandardSchema(standardSchema.EMAIL, 'not-an-email');
    expect(invalidEmailValidation.issues).toBeDefined();

    // Invalid JSON
    const invalidJsonValidation = await validateWithStandardSchema(standardSchema.JSON_CONFIG, 'invalid-json');
    expect(invalidJsonValidation.issues).toBeDefined();

    // Invalid enum
    const invalidEnumValidation = await validateWithStandardSchema(standardSchema.ENUM_VALUE, 'invalid-option');
    expect(invalidEnumValidation.issues).toBeDefined();
  });
});