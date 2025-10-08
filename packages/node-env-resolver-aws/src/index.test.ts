import { describe, it, expect, vi, beforeEach } from 'vitest';
import { awsSecrets, awsSsm, resolveSsm, safeResolveSsm, resolveSecrets, safeResolveSecrets } from './index';
const mockSecretsManagerSend = vi.fn();
const mockSsmSend = vi.fn();
const mockResolve = vi.fn();

// Mock AWS SDK clients
vi.mock('@aws-sdk/client-secrets-manager', () => ({
  SecretsManagerClient: vi.fn().mockImplementation(() => ({
    send: mockSecretsManagerSend,
  })),
  GetSecretValueCommand: vi.fn().mockImplementation((input) => ({ input })),
}));

vi.mock('@aws-sdk/client-ssm', () => ({
  SSMClient: vi.fn().mockImplementation(() => ({
    send: mockSsmSend,
  })),
  GetParametersByPathCommand: vi.fn().mockImplementation((input) => ({ input })),
  GetParameterCommand: vi.fn().mockImplementation((input) => ({ input })),
}));

// Mock node-env-resolver
vi.mock('node-env-resolver', () => ({
  resolve: mockResolve,
}));

describe('node-env-resolver/aws', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSecretsManagerSend.mockReset();
    mockSsmSend.mockReset();
    mockResolve.mockReset();
  });

  describe('awsSecrets', () => {
    it('should create provider with correct name', () => {
      const provider = awsSecrets({ secretId: 'test-secret' });
      expect(provider.name).toBe('aws-secrets(test-secret)');
    });

    it('should parse JSON secret values', async () => {
      mockSecretsManagerSend.mockResolvedValueOnce({
        SecretString: JSON.stringify({
          DATABASE_URL: 'postgres://localhost:5432/test',
          API_KEY: 'secret-key-123',
        }),
      });

      const provider = awsSecrets({ secretId: 'test-secret' });
      const result = await provider.load();

      expect(result).toEqual({
        DATABASE_URL: 'postgres://localhost:5432/test',
        API_KEY: 'secret-key-123',
      });
    });

    it('should handle string secret values', async () => {
      mockSecretsManagerSend.mockResolvedValueOnce({
        SecretString: 'simple-secret-value',
      });

      const provider = awsSecrets({ 
        secretId: 'simple-secret',
        parseJson: false
      });
      const result = await provider.load();

      expect(result).toEqual({
        'simple-secret': 'simple-secret-value',
      });
    });

    it('should handle errors gracefully', async () => {
      mockSecretsManagerSend.mockRejectedValueOnce(new Error('Secret not found'));

      const provider = awsSecrets({ secretId: 'missing-secret' });
      
      await expect(provider.load()).rejects.toThrow('Secret not found');
    });
  });

  describe('awsSsm', () => {
    it('should create provider with correct name', () => {
      const provider = awsSsm({ path: '/app/config' });
      expect(provider.name).toBe('aws-ssm(/app/config)');
    });

    it('should load parameters by path', async () => {
      mockSsmSend.mockResolvedValueOnce({
        Parameters: [
          { Name: '/app/config/DATABASE_URL', Value: 'postgres://localhost:5432/app' },
          { Name: '/app/config/API_KEY', Value: 'api-key-123' },
        ],
      });

      const provider = awsSsm({ path: '/app/config', recursive: true });
      const result = await provider.load();

      expect(result).toEqual({
        DATABASE_URL: 'postgres://localhost:5432/app',
        API_KEY: 'api-key-123',
      });
    });

    it('should load individual parameters', async () => {
      mockSsmSend.mockResolvedValueOnce({
        Parameter: {
          Name: '/app/DATABASE_URL',
          Value: 'postgres://localhost:5432/app',
        },
      });

      const provider = awsSsm({ 
        path: '/app/DATABASE_URL'
      });
      const result = await provider.load();

      expect(result).toEqual({
        DATABASE_URL: 'postgres://localhost:5432/app',
      });
    });

    it('should handle missing parameters', async () => {
      mockSsmSend.mockRejectedValueOnce(new Error('Parameter not found'));

      const provider = awsSsm({
        path: '/app/MISSING_PARAM'
      });

      await expect(provider.load()).rejects.toThrow('Parameter not found');
    });
  });

  describe('resolveSsm', () => {
    it('should resolve SSM parameters directly', async () => {
      const expectedConfig = {
        API_ENDPOINT: 'https://api.example.com',
        TIMEOUT: 30
      };

      mockResolve.mockResolvedValueOnce(expectedConfig);

      const result = await resolveSsm({
        path: '/myapp/config'
      }, {
        API_ENDPOINT: 'url',
        TIMEOUT: 30
      });

      expect(result).toEqual(expectedConfig);
      expect(mockResolve).toHaveBeenCalledWith(
        { API_ENDPOINT: 'url', TIMEOUT: 30 },
        expect.objectContaining({
          resolvers: expect.arrayContaining([
            expect.objectContaining({ name: 'aws-ssm(/myapp/config)' })
          ])
        })
      );
    });

    it('should pass additional resolve options', async () => {
      mockResolve.mockResolvedValueOnce({ API_ENDPOINT: 'https://api.example.com' });

      await resolveSsm({
        path: '/myapp/config',
        region: 'us-west-2'
      }, {
        API_ENDPOINT: 'url'
      }, {
        strict: false
      });

      expect(mockResolve).toHaveBeenCalledWith(
        { API_ENDPOINT: 'url' },
        expect.objectContaining({
          strict: false,
          resolvers: expect.any(Array)
        })
      );
    });
  });

  describe('safeResolveSsm', () => {
    it('should return success result on successful resolution', async () => {
      const expectedConfig = {
        API_ENDPOINT: 'https://api.example.com',
        TIMEOUT: 30
      };

      mockResolve.mockResolvedValueOnce(expectedConfig);

      const result = await safeResolveSsm({
        path: '/myapp/config'
      }, {
        API_ENDPOINT: 'url',
        TIMEOUT: 30
      });

      expect(result).toEqual({
        success: true,
        data: expectedConfig
      });
    });

    it('should return error result on failure', async () => {
      mockResolve.mockRejectedValueOnce(new Error('AWS SSM: Access denied'));

      const result = await safeResolveSsm({
        path: '/myapp/config'
      }, {
        API_ENDPOINT: 'url'
      });

      expect(result).toEqual({
        success: false,
        error: 'AWS SSM: Access denied'
      });
    });
  });

  describe('resolveSecrets', () => {
    it('should resolve secrets directly', async () => {
      const expectedConfig = {
        DATABASE_URL: 'postgres://localhost:5432/app',
        API_KEY: 'secret-key-123'
      };

      mockResolve.mockResolvedValueOnce(expectedConfig);

      const result = await resolveSecrets({
        secretId: 'myapp/secrets'
      }, {
        DATABASE_URL: 'url',
        API_KEY: 'string'
      });

      expect(result).toEqual(expectedConfig);
      expect(mockResolve).toHaveBeenCalledWith(
        { DATABASE_URL: 'url', API_KEY: 'string' },
        expect.objectContaining({
          resolvers: expect.arrayContaining([
            expect.objectContaining({ name: 'aws-secrets(myapp/secrets)' })
          ])
        })
      );
    });

    it('should pass additional resolve options', async () => {
      mockResolve.mockResolvedValueOnce({ DATABASE_URL: 'postgres://localhost:5432/app' });

      await resolveSecrets({
        secretId: 'myapp/secrets',
        region: 'eu-west-1'
      }, {
        DATABASE_URL: 'url'
      }, {
        strict: false
      });

      expect(mockResolve).toHaveBeenCalledWith(
        { DATABASE_URL: 'url' },
        expect.objectContaining({
          strict: false,
          resolvers: expect.any(Array)
        })
      );
    });
  });

  describe('safeResolveSecrets', () => {
    it('should return success result on successful resolution', async () => {
      const expectedConfig = {
        DATABASE_URL: 'postgres://localhost:5432/app',
        API_KEY: 'secret-key-123'
      };

      mockResolve.mockResolvedValueOnce(expectedConfig);

      const result = await safeResolveSecrets({
        secretId: 'myapp/secrets'
      }, {
        DATABASE_URL: 'url',
        API_KEY: 'string'
      });

      expect(result).toEqual({
        success: true,
        data: expectedConfig
      });
    });

    it('should return error result on failure', async () => {
      mockResolve.mockRejectedValueOnce(new Error('AWS Secrets Manager: Secret not found'));

      const result = await safeResolveSecrets({
        secretId: 'myapp/secrets'
      }, {
        DATABASE_URL: 'url'
      });

      expect(result).toEqual({
        success: false,
        error: 'AWS Secrets Manager: Secret not found'
      });
    });
  });
});