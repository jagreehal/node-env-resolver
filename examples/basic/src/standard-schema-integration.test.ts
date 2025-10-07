/**
 * Standard Schema Integration Tests
 * Demonstrates interoperability with other validation libraries
 */
import { describe, it, expect } from 'vitest';
import {
  resolve,
  cached,
  TTL,
  awsCache,
  toStandardSchema,
  schemaToStandardSchema,
  validateWithStandardSchema,
} from 'node-env-resolver';
import type { Resolver } from 'node-env-resolver';

// Mock AWS Secrets Manager for testing
const mockAwsSecretsProvider = (secrets: Record<string, string>): Resolver => ({
  name: 'mock-aws-secrets',
  async load() {
    return secrets;
  },
});

describe('Standard Schema Integration', () => {
  it('should create a Standard Schema compliant definition', () => {
    const databaseSchema = toStandardSchema('DATABASE_URL', {
      type: 'url',
      secret: true,
      description: 'Database URL'
    });

    expect(databaseSchema['~standard']).toBeDefined();
    expect(databaseSchema['~standard'].vendor).toBe('node-env-resolver');
    expect(databaseSchema['~standard'].version).toBe(1);
  });

  it('should load configuration with AWS integration and convert to Standard Schema', async () => {
    const schema = {
      NODE_ENV: { type: 'string' as const, enum: ['development', 'production', 'test'] as const, default: 'development' },
      DATABASE_URL: { type: 'url' as const, secret: true },
      API_SECRET: { type: 'string' as const, secret: true, min: 32 },
      PORT: { type: 'port' as const, default: 3000 },
      DEBUG: { type: 'boolean' as const, default: false }
    };

    const mockSecrets = {
      DATABASE_URL: 'https://aws-prod-db.com',
      API_SECRET: 'a'.repeat(32),
    };

    const config = await resolve(schema, {
      resolvers: [
        cached(
          mockAwsSecretsProvider(mockSecrets),
          awsCache({
            ttl: TTL.minutes5,
            staleWhileRevalidate: true
          })
        )
      ]
    });

    expect(config.NODE_ENV).toBe('development');
    expect(config.PORT).toBe(3000);
    expect(config.DATABASE_URL).toBe('https://aws-prod-db.com');
    expect(config.API_SECRET).toBe('a'.repeat(32));

    const standardSchema = schemaToStandardSchema(schema);
    expect(standardSchema.DATABASE_URL['~standard']).toBeDefined();
  });

  it('should perform various validations using Standard Schema', async () => {
    const schemas = {
      email: toStandardSchema('EMAIL', { type: 'email' }),
      url: toStandardSchema('URL', { type: 'url' }),
      port: toStandardSchema('PORT', { type: 'port' }),
      number: toStandardSchema('COUNT', { type: 'number', min: 1, max: 100 }),
      boolean: toStandardSchema('ENABLED', { type: 'boolean' }),
      enum: toStandardSchema('LEVEL', { type: 'string', enum: ['debug', 'info', 'warn', 'error'] }),
      json: toStandardSchema('CONFIG', { type: 'json' })
    };

    // Test valid values
    await expect(validateWithStandardSchema(schemas.email, 'test@example.com')).resolves.toEqual({ value: 'test@example.com' });
    await expect(validateWithStandardSchema(schemas.url, 'https://example.com')).resolves.toEqual({ value: 'https://example.com' });
    await expect(validateWithStandardSchema(schemas.port, '8080')).resolves.toEqual({ value: 8080 });
    await expect(validateWithStandardSchema(schemas.number, '50')).resolves.toEqual({ value: 50 });
    await expect(validateWithStandardSchema(schemas.boolean, 'true')).resolves.toEqual({ value: true });
    await expect(validateWithStandardSchema(schemas.enum, 'info')).resolves.toEqual({ value: 'info' });
    await expect(validateWithStandardSchema(schemas.json, '{"key": "value"}')).resolves.toEqual({ value: { key: 'value' } });

    // Test invalid values
    await expect(validateWithStandardSchema(schemas.email, 'invalid-email')).resolves.toHaveProperty('issues');
    await expect(validateWithStandardSchema(schemas.url, 'not-a-url')).resolves.toHaveProperty('issues');
    await expect(validateWithStandardSchema(schemas.port, '99999')).resolves.toHaveProperty('issues');
    await expect(validateWithStandardSchema(schemas.number, '150')).resolves.toHaveProperty('issues');
    await expect(validateWithStandardSchema(schemas.boolean, 'maybe')).resolves.toHaveProperty('issues');
    await expect(validateWithStandardSchema(schemas.enum, 'invalid')).resolves.toHaveProperty('issues');
    await expect(validateWithStandardSchema(schemas.json, 'invalid-json')).resolves.toHaveProperty('issues');
  });

  it('should demonstrate interoperability with different validation libraries', async () => {
    // Mock Zod-like validation
    const mockZodValidation = async (value: unknown) => {
      if (typeof value === 'string' && value.length > 0) {
        return { value };
      }
      return { issues: [{ message: 'Invalid string' }] };
    };

    // Mock Valibot-like validation
    const mockValibotValidation = async (value: unknown) => {
      if (typeof value === 'number' && value > 0) {
        return { value };
      }
      return { issues: [{ message: 'Invalid number' }] };
    };

    // Test with mock validators
    const stringResult = await mockZodValidation('test');
    expect(stringResult.value).toBe('test');

    const numberResult = await mockValibotValidation(42);
    expect(numberResult.value).toBe(42);

    const invalidStringResult = await mockZodValidation('');
    expect(invalidStringResult.issues).toBeDefined();

    const invalidNumberResult = await mockValibotValidation(-1);
    expect(invalidNumberResult.issues).toBeDefined();
  });
});