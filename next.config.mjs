let userConfig = undefined
try {
  userConfig = await import('./v0-user-next.config')
} catch (e) {
  // ignore error
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  devIndicators: false,
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: false, // Changed to false for Vercel
    domains: ['images.unsplash.com'], // Add domains for external images
  },
  // Enable React strict mode for better compatibility
  reactStrictMode: true,
  // Optimize for production
  experimental: {
    optimizeCss: true,
  },
  // Remove console logs only in production
  compiler: {
    removeConsole: process.env.NODE_ENV === 'production' ? {
      exclude: ['error', 'warn']
    } : false,
  },
  // Ensure environment variables are available
  env: {
    JWT_SECRET: process.env.JWT_SECRET,
  },
  // Disable source maps in production
  productionBrowserSourceMaps: false,
  // Required to disable webpack performance hints
  webpack: (config, { dev, isServer }) => {
    // Disable performance hints
    config.performance = {
      hints: false,
    };
    
    if (!dev && !isServer) {
      // Disable source maps in client production build
      config.devtool = false;
    }
    
    return config;
  },
  // Disabling experimental features that may cause build issues
  experimental: {
    // webpackBuildWorker: true,
    // parallelServerBuildTraces: true,
    // parallelServerCompiles: true,
  },
}

if (userConfig) {
  // ESM imports will have a "default" property
  const config = userConfig.default || userConfig

  for (const key in config) {
    if (
      typeof nextConfig[key] === 'object' &&
      !Array.isArray(nextConfig[key])
    ) {
      nextConfig[key] = {
        ...nextConfig[key],
        ...config[key],
      }
    } else {
      nextConfig[key] = config[key]
    }
  }
}

export default nextConfig
