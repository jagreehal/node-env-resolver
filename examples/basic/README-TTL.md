# TTL (Time To Live) Caching with node-env-resolver

The `node-env-resolver` package includes powerful TTL caching capabilities that allow you to cache environment variables with configurable expiration times. This is especially useful for AWS secrets and other external configuration sources that might change while your application is running.

## Key Features

- **Configurable TTL**: Set cache expiration times from seconds to days
- **Stale-While-Revalidate**: Serve stale data while refreshing in the background for better performance
- **Max Age Protection**: Force refresh after a maximum age to prevent extremely stale data
- **AWS Optimized**: Pre-configured settings optimized for AWS services
- **Backward Compatible**: Existing code using simple number TTL continues to work

## Basic Usage

### Simple TTL (Backward Compatible)

```typescript
import { resolve, cached } from 'node-env-resolver';
import { awsSecrets } from '@node-env-resolver/aws';

const config = await resolve({
  DATABASE_PASSWORD: 'string',
}, {
  resolvers: [
    // Cache AWS secrets for 5 minutes
    cached(
      awsSecrets({ secretId: 'myapp/database' }),
      5 * 60 * 1000 // 5 minutes
    ),
  ],
});
```

### Advanced TTL Configuration

```typescript
import { resolve, cached, TTL } from 'node-env-resolver';
import { awsSecrets } from '@node-env-resolver/aws';

const config = await resolve({
  API_KEY: 'string',
  DATABASE_URL: 'url',
}, {
  resolvers: [
    cached(
      awsSecrets({ secretId: 'myapp/secrets' }),
      {
        ttl: TTL.minutes5,           // Cache for 5 minutes
        maxAge: TTL.hour,            // Force refresh after 1 hour
        staleWhileRevalidate: true,  // Serve stale while refreshing
        key: 'production-secrets'    // Custom cache key
      }
    ),
  ],
});
```

## TTL Constants

Pre-defined time constants for convenience:

```typescript
import { TTL } from 'node-env-resolver';

TTL.short     // 30 seconds
TTL.minute    // 1 minute
TTL.minutes5  // 5 minutes
TTL.minutes15 // 15 minutes
TTL.hour      // 1 hour
TTL.hours6    // 6 hours
TTL.day       // 24 hours
```

## AWS-Optimized Configuration

For AWS services, use the `awsCache` helper for optimal settings:

```typescript
import { resolve, cached, awsCache } from 'node-env-resolver';
import { awsSecrets, awsSsm } from '@node-env-resolver/aws';

const config = await resolve({
  DATABASE_PASSWORD: 'string',
  REDIS_PASSWORD: 'string',
}, {
  resolvers: [
    // AWS Secrets Manager with optimized caching
    cached(
      awsSecrets({ secretId: 'myapp/production/database' }),
      awsCache({
        ttl: TTL.minutes15,  // 15 minutes cache
        maxAge: TTL.hours6,  // 6 hours max age
      })
    ),
    
    // AWS SSM Parameter Store with optimized caching
    cached(
      awsSsm({ 
        path: '/myapp/production',
        recursive: true 
      }),
      awsCache() // Uses defaults: 5min TTL, 1hr max age, stale-while-revalidate
    ),
  ],
});
```

## Production-Ready Tiered Caching

Different types of secrets can have different cache strategies:

```typescript
import { resolve, cached, TTL } from 'node-env-resolver';
import { awsSecrets } from '@node-env-resolver/aws';

const config = await resolve({
  // Fast-changing data (user tokens, temporary keys)
  USER_SESSION_TOKEN: 'string',
  
  // Medium-changing data (API keys, database passwords)
  DATABASE_PASSWORD: 'string',
  
  // Slow-changing data (app configuration)
  APP_VERSION: 'string',
}, {
  resolvers: [
    // Fast-changing: 30 seconds cache
    cached(
      awsSecrets({ secretId: 'myapp/sessions' }),
      { ttl: TTL.short, staleWhileRevalidate: true }
    ),
    
    // Medium-changing: 5 minutes cache
    cached(
      awsSecrets({ secretId: 'myapp/credentials' }),
      { ttl: TTL.minutes5, staleWhileRevalidate: true }
    ),
    
    // Slow-changing: 1 hour cache
    cached(
      awsSecrets({ secretId: 'myapp/config' }),
      { ttl: TTL.hour, staleWhileRevalidate: false }
    ),
  ],
});
```

## Cache Options Reference

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `ttl` | `number` | `300000` (5 min) | Time to live in milliseconds |
| `maxAge` | `number` | `3600000` (1 hour) | Maximum age before forcing refresh |
| `staleWhileRevalidate` | `boolean` | `false` | Serve stale data while refreshing in background |
| `key` | `string` | `provider.name` | Custom cache key for debugging |

## Benefits

### 1. **Reduced AWS API Calls**
- Caching reduces the number of calls to AWS Secrets Manager and SSM Parameter Store
- Significant cost savings for high-traffic applications
- Improved performance with faster response times

### 2. **Automatic Secret Rotation Support**
- Secrets are automatically refreshed when cache expires
- No application restart required for secret updates
- Configurable refresh intervals based on your security requirements

### 3. **Graceful Degradation**
- `staleWhileRevalidate` ensures your app continues serving requests even if AWS is temporarily unavailable
- Background refresh keeps your cache warm without blocking requests

### 4. **Configurable Per Data Type**
- Different cache strategies for different types of secrets
- Fast-changing data (user tokens) vs slow-changing data (app config)
- Fine-tuned control over cache behavior

## Best Practices

### 1. **Use Appropriate TTL Values**
```typescript
// ❌ Too short - excessive API calls
cached(provider, { ttl: TTL.short }) // 30 seconds

// ✅ Good for frequently changing secrets
cached(provider, { ttl: TTL.minutes5 }) // 5 minutes

// ✅ Good for stable secrets
cached(provider, { ttl: TTL.hour }) // 1 hour
```

### 2. **Enable Stale-While-Revalidate for Production**
```typescript
// ✅ Recommended for production
cached(provider, {
  ttl: TTL.minutes5,
  staleWhileRevalidate: true, // Better performance
  maxAge: TTL.hour           // Safety net
})
```

### 3. **Use AWS-Optimized Settings**
```typescript
// ✅ Use the awsCache helper
cached(awsSecrets({ secretId: 'myapp/secrets' }), awsCache())

// ❌ Manual configuration (more verbose)
cached(awsSecrets({ secretId: 'myapp/secrets' }), {
  ttl: TTL.minutes5,
  maxAge: TTL.hour,
  staleWhileRevalidate: true,
  key: 'aws-secrets'
})
```

### 4. **Monitor Cache Performance**
```typescript
// Add custom cache keys for monitoring
cached(provider, {
  ttl: TTL.minutes5,
  key: 'database-secrets' // Makes it easier to track in logs
})
```

## Migration from Simple TTL

Existing code using simple number TTL continues to work without changes:

```typescript
// ✅ This still works (backward compatible)
cached(provider, 60000) // 1 minute

// ✅ This is the new recommended approach
cached(provider, { ttl: TTL.minute })
```

The enhanced TTL system provides better control, performance, and reliability for production applications while maintaining full backward compatibility.
