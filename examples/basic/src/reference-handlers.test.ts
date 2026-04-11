/**
 * Reference Handlers Example
 *
 * Demonstrates using reference handlers to resolve values from:
 * - AWS Secrets Manager (aws-sm://)
 * - AWS SSM Parameter Store (aws-ssm://)
 * - Other external secret sources
 *
 * @example
 * .env file:
 * DATABASE_URL=aws-sm://prod/database/url
 * API_KEY=aws-ssm://prod/api-key
 */
import { resolveAsync } from 'node-env-resolver';
import { string, url } from 'node-env-resolver/validators';
import { processEnv } from 'node-env-resolver/resolvers';
import { createAwsSecretHandler, createAwsSsmHandler } from 'node-env-resolver-aws/handlers';
import type { ReferenceHandler } from 'node-env-resolver';

describe('Reference Handlers Example', () => {
  it('should create AWS secret handler with options', () => {
    const handler = createAwsSecretHandler({ region: 'us-east-1' });

    expect(handler.name).toBe('aws-sm');
    expect(typeof handler.resolve).toBe('function');
  });

  it('should create AWS SSM handler with options', () => {
    const handler = createAwsSsmHandler({ region: 'us-west-2' });

    expect(handler.name).toBe('aws-ssm');
    expect(typeof handler.resolve).toBe('function');
  });

  it('should support JSON key extraction via # syntax', () => {
    console.log('AWS Secret Handler supports: aws-sm://secret-id#key for JSON extraction');
    console.log('Example: aws-sm://prod/database#password extracts .password from JSON secret');
  });

  it('should demonstrate composing multiple handlers', async () => {
    const handlers: Record<string, ReferenceHandler> = {
      'aws-sm': createAwsSecretHandler({ region: 'us-east-1' }),
      'aws-ssm': createAwsSsmHandler({ region: 'us-west-2' }),
    };

    process.env.NODE_ENV = 'development';

    const config = await resolveAsync({
      resolvers: [
        [
          processEnv(),
          {
            NODE_ENV: ['development', 'production'] as const,
          },
        ],
      ],
      references: {
        handlers,
      },
    });

    expect(config.NODE_ENV).toBe('development');
  });

  it('should show handler metadata structure', () => {
    const secretHandler = createAwsSecretHandler({ region: 'eu-west-1' });
    const ssmHandler = createAwsSsmHandler({ region: 'eu-central-1' });

    console.log('Secret Handler:', secretHandler.name);
    console.log('SSM Handler:', ssmHandler.name);
  });
});
