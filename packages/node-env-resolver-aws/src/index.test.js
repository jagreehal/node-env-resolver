import { describe, it, expect, vi, beforeEach } from 'vitest';
import { awsSecrets, awsSsm } from './index';
const mockSecretsManagerSend = vi.fn();
const mockSsmSend = vi.fn();
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
describe('node-env-resolver/aws', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockSecretsManagerSend.mockReset();
        mockSsmSend.mockReset();
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
});
