/**
 * Express.js server with type-safe environment configuration
 * Demonstrates production-ready patterns with node-env-resolver
 */
import express from 'express';
import { config, isDevelopment, isProduction } from './config';const app = express();
// Middleware
app.use(express.json());
if (config.ENABLE_CORS) {
    console.log('✅ CORS enabled');
    // Would typically import cors middleware here
}
// Health check endpoint
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        environment: config.NODE_ENV,
        timestamp: new Date().toISOString(),
        version: process.env.npm_package_version || '1.0.0',
    });
});
// Environment info endpoint (development only)
if (isDevelopment) {
    app.get('/debug/env', (req, res) => {
        res.json({
            environment: config.NODE_ENV,
            port: config.PORT,
            hasDatabase: !!config.DATABASE_URL,
            hasRedis: !!config.REDIS_URL,
            hasStripe: !!config.STRIPE_SECRET_KEY,
            features: {
                cors: config.ENABLE_CORS,
                metrics: config.ENABLE_METRICS,
            },
            database: {
                host: config.DATABASE_URL.hostname,
                port: config.DATABASE_URL.port,
                poolMin: config.DATABASE_POOL_MIN,
                poolMax: config.DATABASE_POOL_MAX,
            },
            redis: config.REDIS_URL ? {
                host: config.REDIS_URL.hostname,
                port: config.REDIS_URL.port,
            } : null,
            rateLimiting: {
                max: config.API_RATE_LIMIT_MAX,
                windowMs: config.API_RATE_LIMIT_WINDOW,
            },
        });
    });
}
// API routes
app.get('/api/config', (req, res) => {
    res.json({
        environment: config.NODE_ENV,
        features: {
            cors: config.ENABLE_CORS,
            metrics: config.ENABLE_METRICS,
        },
        // Never expose secrets in API responses
        hasStripe: !!config.STRIPE_PUBLIC_KEY,
        rateLimit: {
            max: config.API_RATE_LIMIT_MAX,
            windowMs: config.API_RATE_LIMIT_WINDOW,
        },
    });
});
// Example protected route that uses configuration
app.post('/api/payment', async (req, res) => {
    if (!config.STRIPE_SECRET_KEY) {
        return res.status(503).json({
            error: 'Payment processing not configured',
        });
    }
    // TypeScript knows STRIPE_SECRET_KEY is a string here
    console.log(`🔒 Processing payment with Stripe (key: ${config.STRIPE_SECRET_KEY.slice(0, 8)}...)`);
    res.json({
        message: 'Payment would be processed here',
        environment: config.NODE_ENV,
    });
});
// Error handling
app.use((err, req, res, _next) => {
    console.error('❌ Unhandled error:', err);
    res.status(500).json({
        error: isProduction ? 'Internal server error' : err.message,
        timestamp: new Date().toISOString(),
    });
});
// Start server
const server = app.listen(config.PORT, () => {
    console.log(`🚀 Server started successfully!`);
    console.log(`   Environment: ${config.NODE_ENV}`);
    console.log(`   Port: ${config.PORT}`);
    console.log(`   Database: ${config.DATABASE_URL.hostname}:${config.DATABASE_URL.port}`);
    if (config.REDIS_URL) {
        console.log(`   Redis: ${config.REDIS_URL.hostname}:${config.REDIS_URL.port}`);
    }
    if (config.SENTRY_DSN) {
        console.log(`   Monitoring: Sentry enabled`);
    }
    console.log(`   Log Level: ${config.LOG_LEVEL}`);
    console.log(`   Features: ${Object.entries({
        CORS: config.ENABLE_CORS,
        Metrics: config.ENABLE_METRICS,
        Stripe: !!config.STRIPE_SECRET_KEY,
    }).filter(([, enabled]) => enabled).map(([name]) => name).join(', ') || 'None'}`);
    if (isDevelopment) {
        console.log(`\n🔧 Development endpoints:`);
        console.log(`   Health: http://localhost:${config.PORT}/health`);
        console.log(`   Debug: http://localhost:${config.PORT}/debug/env`);
        console.log(`   Config: http://localhost:${config.PORT}/api/config`);
    }
});
// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\n🛑 Received SIGINT, shutting down gracefully...');
    server.close(() => {
        console.log('✅ Server closed');
        process.exit(0);
    });
});
export default app;
