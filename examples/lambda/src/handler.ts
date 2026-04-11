/**
 * AWS Lambda handler example with environment resolution
 * Optimized for cold start performance with tree-shaking
 *
 * Features demonstrated:
 * - Async resolution with processEnv and AWS Secrets
 * - Reference handlers for aws-sm:// and aws-ssm:// URIs
 * - Runtime protection with console redaction
 */
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { resolveAsync } from 'node-env-resolver';
import { processEnv } from 'node-env-resolver/resolvers';
import { url, string } from 'node-env-resolver/validators';
import { patchGlobalConsole } from 'node-env-resolver/runtime';
import { createAwsSecretHandler, createAwsSsmHandler } from 'node-env-resolver-aws/handlers';

// Create reference handlers for AWS secrets
const awsSecretHandler = createAwsSecretHandler({
  region: process.env.AWS_REGION || 'us-east-1',
});
const awsSsmHandler = createAwsSsmHandler({
  region: process.env.AWS_REGION || 'us-east-1',
});

// Define environment once at module level for reuse across invocations
const envPromise = resolveAsync({
  resolvers: [
    [
      processEnv(),
      {
        // Runtime environment
        NODE_ENV: ['development', 'production'] as const,

        // API configuration
        API_TIMEOUT: 30000, // Number with default

        // Feature flags
        ENABLE_ANALYTICS: false, // Boolean with default

        // These would be resolved via reference handlers:
        // DATABASE_URL=aws-sm://prod/database/url
        // API_KEY=aws-ssm://prod/api-key
        DATABASE_URL: url({ optional: true }),
        STRIPE_SECRET_KEY: string({ optional: true }),
        REDIS_URL: url({ optional: true }),
      },
    ],
  ],
  references: {
    handlers: {
      'aws-sm': awsSecretHandler,
      'aws-ssm': awsSsmHandler,
    },
  },
});

// Apply runtime protection for console output
patchGlobalConsole(
  {}, // Empty config - would use full config in real usage
  {
    enabled: true,
    customPatterns: [/sk_[a-zA-Z0-9]+/, /ghp_[a-zA-Z0-9]+/, /password/i, /secret/i],
  }
);

export const handler = async (_event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    // Environment is resolved once and cached
    const env = await envPromise;

    console.log(`🚀 Lambda invocation - Environment: ${env.NODE_ENV}`);

    // Example business logic with type-safe environment
    const response = {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: 'Environment resolved successfully',
        environment: env.NODE_ENV,
        hasDatabase: !!env.DATABASE_URL,
        hasRedis: !!env.REDIS_URL,
        analyticsEnabled: env.ENABLE_ANALYTICS,
        apiTimeout: env.API_TIMEOUT,
        // Never log secrets!
        hasStripeKey: !!env.STRIPE_SECRET_KEY,
      }),
    };

    // Simulate some work with the resolved environment
    if (env.REDIS_URL) {
      console.log(`📦 Redis available at: ${env.REDIS_URL}`);
    }

    if (env.ENABLE_ANALYTICS) {
      console.log('📊 Analytics tracking enabled');
    }

    return response;
  } catch (error) {
    console.error('❌ Environment resolution failed:', error);

    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      }),
    };
  }
};

// For local testing
if (import.meta.url === `file://${process.argv[1]}`) {
  const testEvent: APIGatewayProxyEvent = {
    httpMethod: 'GET',
    path: '/test',
    headers: {},
    queryStringParameters: null,
    body: null,
    isBase64Encoded: false,
  } as APIGatewayProxyEvent;

  handler(testEvent)
    .then((result) => {
      console.log('Test result:', JSON.stringify(result, null, 2));
    })
    .catch(console.error);
}
