/** @type {import('next').NextConfig} */
const nextConfig = {
  // Your Next.js config here
  experimental: {},

  // Note: We avoid importing env config here to prevent Node.js modules
  // from being bundled for the browser. Environment variables are handled
  // at runtime in the application code instead.

  webpack: (config, { isServer }) => {
    if (!isServer) {
      // Don't bundle Node.js modules for the client
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: false,
      };
    }
    return config;
  },

  // Example configuration without importing env
  async rewrites() {
    return [
      // Example rewrite without env dependency
      {
        source: '/api/health',
        destination: '/api/health',
      },
    ];
  },
};

export default nextConfig;