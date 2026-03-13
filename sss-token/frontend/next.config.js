/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    serverComponentsExternalPackages: ['@stbr/sss-token'],
  },
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
      };
    }
    
    // Mark SDK as external to prevent bundling on server
    if (isServer) {
      config.externals = config.externals || [];
      if (Array.isArray(config.externals)) {
        config.externals.push(function({ request }, callback) {
          // Exclude SDK from bundling
          if (request && request.includes('sdk/dist')) {
            return callback(null, 'commonjs ' + request);
          }
          callback();
        });
      }
    }
    
    return config;
  },
}

module.exports = nextConfig