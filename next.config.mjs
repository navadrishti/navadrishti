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
  // Optimize for production - disable experimental features that cause build issues
  experimental: {
    // optimizeCss: true, // Disabled due to critters module error
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
    CLOUDINARY_CLOUD_NAME: process.env.CLOUDINARY_CLOUD_NAME,
    CLOUDINARY_API_KEY: process.env.CLOUDINARY_API_KEY,
  },
  // Add API configuration for file uploads
  api: {
    bodyParser: {
      sizeLimit: '10mb', // Increase file upload limit
    },
  },
  // Disable source maps in production
  productionBrowserSourceMaps: false,
  // Fix process and other Node.js polyfills
  webpack: (config, { dev, isServer }) => {
    // Disable performance hints
    config.performance = {
      hints: false,
    };
    
    if (!dev && !isServer) {
      // Disable source maps in client production build
      config.devtool = false;
    }
    
    // Fix process is not defined error
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
        process: false,
      };
    }
    
    return config;
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
