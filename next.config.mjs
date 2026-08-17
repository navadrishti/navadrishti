/** @type {import('next').NextConfig} */
const nextConfig = {
  devIndicators: false,
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: false, // Changed to false for Vercel
    qualities: [75, 85, 90],
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'res.cloudinary.com',
        port: '',
        pathname: '/**',
      },
    ],
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
  // Disable source maps in production
  productionBrowserSourceMaps: false,
  // Set Turbopack root to current directory
  turbopack: {
    root: process.cwd(),
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'Link',
            value:
              '</llm.txt>; rel="alternate"; type="text/plain"; title="LLM context", </ai.txt>; rel="alternate"; type="text/plain"; title="AI discovery", <https://www.navadrishti.in/llms.txt>; rel="alternate"; type="text/plain"; title="Navadrishti LLP LLM context", <https://www.navadrishti.in/llms-full.txt>; rel="alternate"; type="text/plain"; title="Navadrishti LLP LLM full context"',
          },
          {
            key: 'X-AI-Discovery',
            value: 'https://www.navadrishti.in/llms.txt',
          },
        ],
      },
    ]
  },
  async redirects() {
    return [
      {
        source: '/companies/ca',
        destination: '/evidence-verification',
        permanent: true,
      },
      {
        source: '/companies/ca/:path*',
        destination: '/evidence-verification/:path*',
        permanent: true,
      },
      {
        source: '/api/companies/ca/:path*',
        destination: '/api/evidence-verification/:path*',
        permanent: true,
      },
      {
        source: '/home',
        destination: '/',
        permanent: false,
      },
      {
        source: '/posts/:path*',
        destination: '/',
        permanent: false,
      },
    ]
  },
}

export default nextConfig
