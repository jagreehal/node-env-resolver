import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockSecretsManagerSend = vi.hoisted(() => vi.fn());
const mockSsmSend = vi.hoisted(() => vi.fn());

const MockSecretsManagerClient = vi.hoisted(() => {
  return class {
    send = mockSecretsManagerSend;
  };
});

const MockSSMClient = vi.hoisted(() => {
  return class {
    send = mockSsmSend;
  };
});

vi.mock('@aws-sdk/client-secrets-manager', () => ({
  SecretsManagerClient: MockSecretsManagerClient,
  GetSecretValueCommand: class GetSecretValueCommand {
    constructor(public input: unknown) {}
  },
}));

vi.mock('@aws-sdk/client-ssm', () => ({
  SSMClient: MockSSMClient,
  GetParameterCommand: class GetParameterCommand {
    constructor(public input: unknown) {}
  },
}));

import {
  createAwsSecretHandler,
  createAwsSsmHandler,
  awsSecretHandler,
  awsSsmHandler,
} from './handlers';

describe('AWS Secret Reference Handlers', () => {
  beforeEach(() => {
    mockSecretsManagerSend.mockReset();
    mockSsmSend.mockReset();
  });

  describe('createAwsSecretHandler', () => {
    it('should create handler with correct name', () => {
      const handler = createAwsSecretHandler();
      expect(handler.name).toBe('aws-sm');
    });

    it('should resolve simple secret reference', async () => {
      mockSecretsManagerSend.mockResolvedValueOnce({
        SecretString: 'my-secret-value',
      });

      const handler = createAwsSecretHandler();
      const result = await handler.resolve('aws-sm://myapp/database', {
        key: 'DATABASE_URL',
        source: 'dotenv(.env)',
        reference: 'aws-sm://myapp/database',
      });

      expect(result).toEqual({
        value: 'my-secret-value',
        resolvedVia: 'aws-secrets',
        metadata: {
          secretId: 'myapp/database',
          key: undefined,
          region: undefined,
        },
      });

      expect(mockSecretsManagerSend).toHaveBeenCalledTimes(1);
    });

    it('should resolve secret with JSON key extraction', async () => {
      mockSecretsManagerSend.mockResolvedValueOnce({
        SecretString: JSON.stringify({
          password: 'db-password-123',
          username: 'admin',
          host: 'db.example.com',
        }),
      });

      const handler = createAwsSecretHandler();
      const result = await handler.resolve('aws-sm://myapp/database#password', {
        key: 'DATABASE_PASSWORD',
        source: 'dotenv(.env)',
        reference: 'aws-sm://myapp/database#password',
      });

      expect(result).toEqual({
        value: 'db-password-123',
        resolvedVia: 'aws-secrets',
        metadata: {
          secretId: 'myapp/database',
          key: 'password',
          region: undefined,
        },
      });
    });

    it('should throw actionable error for invalid reference format', async () => {
      const handler = createAwsSecretHandler();
      await expect(
        handler.resolve('invalid-format', {
          key: 'TEST',
          source: null,
          reference: 'invalid-format',
        })
      ).rejects.toThrow('Invalid aws-sm reference');
    });

    it('error message lists available keys when key not found', async () => {
      mockSecretsManagerSend.mockResolvedValueOnce({
        SecretString: JSON.stringify({ host: 'db.example.com', port: '5432' }),
      });

      const handler = createAwsSecretHandler();
      await expect(
        handler.resolve('aws-sm://myapp/database#missingKey', {
          key: 'TEST',
          source: null,
          reference: 'aws-sm://myapp/database#missingKey',
        })
      ).rejects.toThrow(/does not contain key.*Available keys/);
    });

    it('should throw with fragment hint when secret is not JSON but key requested', async () => {
      mockSecretsManagerSend.mockResolvedValueOnce({
        SecretString: 'plain-text-secret',
      });

      const handler = createAwsSecretHandler();
      await expect(
        handler.resolve('aws-sm://myapp/database#key', {
          key: 'TEST',
          source: null,
          reference: 'aws-sm://myapp/database#key',
        })
      ).rejects.toThrow('is not valid JSON');
    });

    it('should include AWS auth hint on fetch failure', async () => {
      mockSecretsManagerSend.mockRejectedValueOnce(new Error('AccessDenied'));

      const handler = createAwsSecretHandler({ region: 'us-east-1' });
      await expect(
        handler.resolve('aws-sm://test', {
          key: 'TEST',
          source: null,
          reference: 'aws-sm://test',
        })
      ).rejects.toThrow(/Tip: ensure your AWS credentials/);
    });

    it('each factory instance has its own client — multi-region works correctly', async () => {
      mockSecretsManagerSend.mockResolvedValue({ SecretString: 'value' });

      // Two handlers with different regions should not interfere
      const handler1 = createAwsSecretHandler({ region: 'us-east-1' });
      const handler2 = createAwsSecretHandler({ region: 'eu-west-1' });

      await handler1.resolve('aws-sm://test1', { key: 'T1', source: null, reference: 'aws-sm://test1' });
      await handler2.resolve('aws-sm://test2', { key: 'T2', source: null, reference: 'aws-sm://test2' });

      expect(mockSecretsManagerSend).toHaveBeenCalledTimes(2);
    });
  });

  describe('createAwsSsmHandler', () => {
    it('should create handler with correct name', () => {
      const handler = createAwsSsmHandler();
      expect(handler.name).toBe('aws-ssm');
    });

    it('should resolve parameter reference', async () => {
      mockSsmSend.mockResolvedValueOnce({
        Parameter: { Name: '/myapp/database', Value: 'postgres://localhost:5432/mydb' },
      });

      const handler = createAwsSsmHandler();
      const result = await handler.resolve('aws-ssm://myapp/database', {
        key: 'DATABASE_URL',
        source: 'dotenv(.env)',
        reference: 'aws-ssm://myapp/database',
      });

      expect(result).toEqual({
        value: 'postgres://localhost:5432/mydb',
        resolvedVia: 'aws-ssm',
        metadata: {
          parameterPath: 'myapp/database',
          region: undefined,
        },
      });
    });

    it('should resolve parameter with leading slash', async () => {
      mockSsmSend.mockResolvedValueOnce({
        Parameter: { Name: '/myapp/database', Value: 'secret-value' },
      });

      const handler = createAwsSsmHandler();
      const result = await handler.resolve('aws-ssm:///myapp/database', {
        key: 'DATABASE_URL',
        source: null,
        reference: 'aws-ssm:///myapp/database',
      });

      expect(result).toMatchObject({ value: 'secret-value' });
    });

    it('should throw actionable error for invalid reference format', async () => {
      const handler = createAwsSsmHandler();
      await expect(
        handler.resolve('invalid-format', { key: 'TEST', source: null, reference: 'invalid-format' })
      ).rejects.toThrow('Invalid aws-ssm reference');
    });

    it('should include IAM permission hint on fetch failure', async () => {
      mockSsmSend.mockRejectedValueOnce(new Error('AccessDenied'));
      const handler = createAwsSsmHandler();
      await expect(
        handler.resolve('aws-ssm://missing/param', {
          key: 'TEST',
          source: null,
          reference: 'aws-ssm://missing/param',
        })
      ).rejects.toThrow(/ssm:GetParameter/);
    });

    it('should use WithDecryption=true by default', async () => {
      mockSsmSend.mockResolvedValueOnce({
        Parameter: { Name: '/myapp/secret', Value: 'decrypted-value' },
      });

      const handler = createAwsSsmHandler();
      await handler.resolve('aws-ssm://myapp/secret', {
        key: 'TEST',
        source: null,
        reference: 'aws-ssm://myapp/secret',
      });

      expect(mockSsmSend.mock.calls[0][0].input).toMatchObject({
        Name: 'myapp/secret',
        WithDecryption: true,
      });
    });

    it('should respect withDecryption: false', async () => {
      mockSsmSend.mockResolvedValueOnce({
        Parameter: { Name: '/myapp/secret', Value: 'value' },
      });

      const handler = createAwsSsmHandler({ withDecryption: false });
      await handler.resolve('aws-ssm://myapp/secret', {
        key: 'TEST',
        source: null,
        reference: 'aws-ssm://myapp/secret',
      });

      expect(mockSsmSend.mock.calls[0][0].input).toMatchObject({
        Name: 'myapp/secret',
        WithDecryption: false,
      });
    });
  });

  describe('default handlers', () => {
    it('should export pre-configured awsSecretHandler', () => {
      expect(awsSecretHandler.name).toBe('aws-sm');
      expect(typeof awsSecretHandler.resolve).toBe('function');
    });

    it('should export pre-configured awsSsmHandler', () => {
      expect(awsSsmHandler.name).toBe('aws-ssm');
      expect(typeof awsSsmHandler.resolve).toBe('function');
    });
  });
});
