import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  sassOptions: {},
  devIndicators: false,
  allowedDevOrigins: ['192.168.0.2', '100.121.115.89', 'jackal'],
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: 'http://localhost:8002/api/:path*',
      },
    ];
  },
};

export default nextConfig;
