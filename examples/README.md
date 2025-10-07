# Examples

Comprehensive examples showing how to use `node-env-resolver` in real applications, featuring the new Standard Schema implementation and TTL caching. All examples are now implemented as vitest tests for better reliability and documentation.

## Quick Start

```bash
# Install dependencies
pnpm install

# Run all tests
pnpm --filter basic test

# Run specific example tests
pnpm --filter basic test:run
pnpm --filter basic resolvers
pnpm --filter basic aws-simple
pnpm --filter basic ttl-example
```

## Examples

### [`basic/`](./basic/) - Core Package Examples
Zero dependencies, perfect for simple applications.

**Features:**
- **Basic usage**: Type-safe environment variables with elegant syntax
- **Custom validators**: Infinite flexibility with your own validation functions
- **Advanced resolvers**: Async resolvers with .env files and caching
- **TTL caching**: Advanced caching with stale-while-revalidate
- **AWS integration**: Secrets Manager and SSM without Zod
- **Standard Schema**: Ecosystem interoperability examples
- **Feature demonstrations**: Comprehensive usage examples

**Scripts:**
```bash
pnpm test                  # Run all tests
pnpm test:run             # Run tests once
pnpm test:coverage        # Run with coverage
pnpm test:watch           # Watch mode
pnpm test:ui              # UI mode
pnpm resolvers            # Advanced resolvers tests
pnpm ttl-example          # TTL caching tests
pnpm aws-simple           # AWS without Zod tests
pnpm standard-demo        # Standard Schema tests
pnpm compare-t3           # comparison tests
pnpm custom-validators    # Custom validator functions tests
```

### [`lambda/`](./lambda/) - AWS Lambda with Secrets
Optimized for AWS Lambda cold starts.

**Features:**
- **AWS Secrets Manager**: Secure secret loading
- **TTL caching**: Aggressive caching for Lambda performance
- **Tree-shaking**: Only bundles what you import
- **Standard Schema**: Lambda-compatible validation

### [`express/`](./express/) - Production Express.js
Full-featured Express application with multiple environments.

**Features:**
- **AWS Parameter Store**: Production secrets from SSM
- **Multi-environment**: .env files for development, AWS for production
- **Docker**: Production-ready container setup
- **TTL caching**: Production-grade caching strategies

### [`express-server/`](./express-server/) - Simple Express Server
Minimal Express server example.

**Features:**
- **Simple setup**: Basic Express server with environment variables
- **Type safety**: Full TypeScript support
- **Zero config**: Works out of the box

### [`nextjs-app/`](./nextjs-app/) - Next.js Application
Full Next.js application with automatic client/server splitting.

**Features:**
- **Client/Server split**: Automatic environment variable separation
- **App Router**: Built for Next.js 13+ App Router
- **Runtime protection**: Prevents server variables on client
- **Standard Schema**: Next.js compatible validation

## New Simplified API

### Basic Usage
```typescript
import { resolve } from 'node-env-resolver';

// Maximum elegance - one function does everything
const config = await resolve({
  PORT: 3000,                    // number with default
  DATABASE_URL: 'url',          // required secret URL
  NODE_ENV: ['dev', 'prod'],     // enum
  DEBUG: false,                  // boolean with default
  API_KEY: 'string?',            // optional string
});
```

### With Cloud Resolvers
```typescript
import { resolve } from 'node-env-resolver';
import { awsSecrets } from 'node-env-resolver-aws';
import { cached, TTL } from 'node-env-resolver';

const config = await resolve({
  DATABASE_URL: 'url',         // Required secret
  STRIPE_KEY: 'string',        // Required secret
  CACHE_TTL: 3600,              // Number with default
}, {
  extend: [
    cached(
      awsSecrets({ secretId: 'prod/app/secrets' }),
      { ttl: TTL.minute5, staleWhileRevalidate: true }
    )
  ]
});
```

### Standard Schema Integration
```typescript
import { toStandardSchema, schemaToStandardSchema } from 'node-env-resolver';

// Convert to Standard Schema for ecosystem interoperability
const schema = {
  DATABASE_URL: { type: 'url', secret: true },
  PORT: { type: 'port', default: 3000 }
};

const standardSchema = schemaToStandardSchema(schema);

// Now works with Zod, Valibot, ArkType, etc.
```

## TTL Caching Examples

### Basic TTL
```typescript
import { cached, TTL } from 'node-env-resolver';

cached(provider, TTL.minute5)  // 5 minutes
cached(provider, TTL.hour)     // 1 hour
cached(provider, 300)          // Custom seconds
```

### Advanced Caching
```typescript
import { cached } from 'node-env-resolver';

cached(provider, {
  ttl: 300,                    // 5 minutes fresh
  maxAge: 1800,                // 30 minutes max
  staleWhileRevalidate: true,  // Background refresh
  key: 'custom-cache-key'      // Custom cache key
});
```

### AWS-Optimized Caching
```typescript
import { cached, awsCache } from 'node-env-resolver';
import { awsSecrets } from 'node-env-resolver-aws';

cached(awsSecrets({ secretId: 'myapp/secrets' }), awsCache({
  ttl: TTL.minute5,
  staleWhileRevalidate: true
}));
```

## Key Features

| Feature | Description |
|---------|-------------|
| **Bundle Size** | ~8.8KB gzipped (zero dependencies) |
| **AWS Integration** | Built-in Secrets Manager and SSM support |
| **TTL Caching** | Advanced stale-while-revalidate caching |
| **Framework Support** | Universal - works with any Node.js framework |
| **Standard Schema** | v1 compliant - works with Zod, Valibot, etc. (optional) |
| **Zero Config** | Smart defaults that work out of the box |
| **Type Safety** | Perfect TypeScript inference with runtime validation |

## Why the New API?

- ✅ **Maximum elegance** - One function, zero configuration
- ✅ **Intuitive syntax** - `PORT: 3000` instead of verbose objects
- ✅ **Smart defaults** - Automatically loads .env and process.env
- ✅ **Perfect TypeScript** - Full inference with zero boilerplate
- ✅ **Production ready** - Built-in secret protection and validation
- ✅ **Standard Schema** - Ecosystem interoperability
- ✅ **TTL caching** - Production-grade performance
- ✅ **Backward compatible** - Works alongside existing resolvers

## Running Examples

### Basic Examples (Test-based)
```bash
cd examples/basic
pnpm install
pnpm test                  # Run all tests
pnpm test:watch           # Watch mode for development
pnpm test:coverage        # Run with coverage report
```

### AWS Lambda
```bash
cd examples/lambda
pnpm install
pnpm build
# Deploy to AWS Lambda
```

### Express Application
```bash
cd examples/express
pnpm install
pnpm dev
# Visit http://localhost:3000
```

### Next.js Application
```bash
cd examples/nextjs-app
pnpm install
pnpm dev
# Visit http://localhost:3000
```

## Test-Based Examples

The basic examples are now implemented as vitest tests, providing several benefits:

- **Reliability**: Tests ensure examples work correctly
- **Documentation**: Tests serve as living documentation
- **CI/CD**: Examples can be run in continuous integration
- **Coverage**: Test coverage shows which features are demonstrated
- **Interactive**: Use `pnpm test:ui` for a visual test interface

### Available Test Commands

```bash
# Run all tests
pnpm test

# Run tests once (CI mode)
pnpm test:run

# Run with coverage report
pnpm test:coverage

# Watch mode for development
pnpm test:watch

# Visual UI mode
pnpm test:ui

# Run specific test files
pnpm test src/basic.test.ts
pnpm test src/aws-without-zod-simple.test.ts
```

## Environment Setup

Each example includes:
- **`.env.example`** - Template for required variables
- **`.env.local`** - Local development overrides (gitignored)
- **Docker support** - Production containerization
- **TypeScript** - Full type safety
- **Vitest** - Test framework for examples

## Contributing

Found an issue with an example? Feel free to:
1. Open an issue
2. Submit a PR with improvements
3. Add new examples for other frameworks

## License

MIT © [Jagvinder Singh Reehal](https://jagreehal.com)