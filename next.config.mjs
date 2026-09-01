/** @type {import('next').NextConfig} */
const nextConfig = {
  devIndicators: false,
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: false,
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
  reactStrictMode: true,
  experimental: {},
  compiler: {
    removeConsole: process.env.NODE_ENV === 'production' ? {
      exclude: ['error', 'warn']
    } : false,
  },
  productionBrowserSourceMaps: false,
  poweredByHeader: false,
  turbopack: {
    root: process.cwd(),
  },
  async headers() {
    const securityHeaders = [
      {
        key: 'X-Frame-Options',
        value: 'DENY',
      },
      {
        key: 'X-Content-Type-Options',
        value: 'nosniff',
      },
      {
        key: 'Referrer-Policy',
        value: 'strict-origin-when-cross-origin',
      },
      {
        key: 'Permissions-Policy',
        value: 'camera=(), microphone=(), geolocation=(), payment=(self)',
      },
      {
        key: 'X-DNS-Prefetch-Control',
        value: 'off',
      },
      {
        key: 'Content-Security-Policy',
        value: [
          "default-src 'self'",
          "base-uri 'self'",
          "form-action 'self'",
          "frame-ancestors 'none'",
          "object-src 'none'",
          "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://checkout.razorpay.com https://va.vercel-scripts.com",
          "style-src 'self' 'unsafe-inline'",
          "img-src 'self' data: blob: https://res.cloudinary.com https://images.unsplash.com",
          "font-src 'self' data:",
          "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.razorpay.com https://checkout.razorpay.com https://vitals.vercel-insights.com https://*.cloudinary.com",
          "frame-src 'self' https://api.razorpay.com https://checkout.razorpay.com",
        ].join('; '),
      },
      ...(process.env.NODE_ENV === 'production'
        ? [
            {
              key: 'Strict-Transport-Security',
              value: 'max-age=63072000; includeSubDomains; preload',
            },
          ]
        : []),
      {
        key: 'Link',
        value:
          '</llm.txt>; rel="alternate"; type="text/plain"; title="LLM context", </ai.txt>; rel="alternate"; type="text/plain"; title="AI discovery", <https://www.navadrishti.in/llms.txt>; rel="alternate"; type="text/plain"; title="Navadrishti LLP LLM context", <https://www.navadrishti.in/llms-full.txt>; rel="alternate"; type="text/plain"; title="Navadrishti LLP LLM full context"',
      },
      {
        key: 'X-AI-Discovery',
        value: 'https://www.navadrishti.in/llms.txt',
      },
    ]

    return [
      {
        source: '/(.*)',
        headers: securityHeaders,
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
