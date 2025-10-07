import { beforeEach, afterEach } from 'vitest';

// Store original environment variables
const originalEnv = { ...process.env };

beforeEach(() => {
  // Clean up common environment variables that might interfere with tests
  // Keep NODE_ENV as it's required by many tests
  delete process.env.PORT;
  delete process.env.DEBUG;
  delete process.env.API_URL;
  delete process.env.APP_NAME;
  delete process.env.API_KEY;
  delete process.env.DATABASE_PASSWORD;
  delete process.env.JWT_SECRET;
  delete process.env.ENCRYPTION_KEY;
  delete process.env.STRIPE_SECRET_KEY;
  delete process.env.EMAIL;
  delete process.env.MAX_UPLOAD_SIZE;
});

afterEach(() => {
  // Restore original environment
  process.env = { ...originalEnv };
});
