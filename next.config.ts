import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone',
  experimental: {
    serverActions: {
      bodySizeLimit: '150mb',
      allowedOrigins: [
        'e-co.store',
        'e-co.store:4000',
        'www.e-co.store',
        'localhost:4000',
        'localhost:3000',
        '10.8.0.2:4000',
        '10.8.0.2',
        '127.0.0.1:4000',
        '127.0.0.1'
      ],
    },
  },
};

export default nextConfig;
// trigger-restart
