// Test setup for vite-resolver
// Disable browser detection in tests by default
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).__NODE_ENV_RESOLVER_VITE_IS_BROWSER = () => false;
