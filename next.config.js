const TARGET_SERVER_BASE_URL = process.env.NEXT_PUBLIC_SERVER_BASE_URL || 'http://localhost:8001';

/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    return [
      {
        source: '/api/wiki_cache/:path*',
        destination: `${TARGET_SERVER_BASE_URL}/api/wiki_cache/:path*`,
      },
      {
        source: '/export/wiki/:path*',
        destination: `${TARGET_SERVER_BASE_URL}/export/wiki/:path*`,
      },
    ];
  },
};

module.exports = nextConfig; 