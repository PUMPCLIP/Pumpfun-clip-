/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  output: 'standalone',
  experimental: {
    cpus: 1,
    workerThreads: false,
  },
  webpack: (config) => {
    config.parallelism = 1;
    if (!process.env.NEXT_PUBLIC_PRIVY_APP_ID) {
      // Privy's Farcaster adapter is optional and is never mounted without its App ID.
      config.resolve.alias['@farcaster/mini-app-solana'] = false;
    }
    config.externals['@solana/kit'] = 'commonjs @solana/kit';
    config.externals['@solana-program/memo'] = 'commonjs @solana-program/memo';
    config.externals['@solana-program/system'] = 'commonjs @solana-program/system';
    config.externals['@solana-program/token'] = 'commonjs @solana-program/token';
    return config;
  },
};

module.exports = nextConfig;
