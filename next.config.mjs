/** @type {import('next').NextConfig} */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = path.dirname(fileURLToPath(import.meta.url))

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

/** CLI: `pnpm run test:security` */
export function runSecuritySmokeChecks() {
  const results = []

  const check = (name, ok, detail) => {
    results.push({ name, ok, detail })
  }

  const read = (filePath) => fs.readFileSync(path.join(projectRoot, filePath), 'utf8')

  const walk = (dir, files = []) => {
    if (!fs.existsSync(dir)) return files

    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name === '.next' || entry.name === '.git') continue
        walk(fullPath, files)
        continue
      }
      if (/\.(tsx?|jsx?|mjs)$/.test(entry.name)) files.push(fullPath)
    }

    return files
  }

  const nextConfigSource = read('next.config.mjs')
  const themeProvider = read('components/theme-provider.tsx')
  const serverAuth = read('lib/server-auth.ts')
  const razorpayCheckout = read('lib/razorpay-checkout.ts')

  check('production source maps disabled', /productionBrowserSourceMaps:\s*false/.test(nextConfigSource))
  check('production console stripping enabled', /removeConsole/.test(nextConfigSource))

  for (const header of [
    'X-Frame-Options',
    'X-Content-Type-Options',
    'Referrer-Policy',
    'Permissions-Policy',
    'Content-Security-Policy',
  ]) {
    check(`security header configured: ${header}`, nextConfigSource.includes(header))
  }

  check(
    'production client guards mounted in theme provider',
    themeProvider.includes('useProductionClientGuards')
  )

  check(
    'evidence approver requires platform CA token',
    /const platformCA = getCAFromRequest\(request\)/.test(serverAuth) &&
      /if \(platformCA\) \{[\s\S]*actorType: 'platform_ca'/.test(serverAuth)
  )

  check(
    'razorpay checkout loads from official CDN only',
    razorpayCheckout.includes('https://checkout.razorpay.com/v1/checkout.js')
  )

  const publicSecretLeaks = []
  const appFiles = walk(path.join(projectRoot, 'app'))
    .concat(walk(path.join(projectRoot, 'components')))
    .concat(walk(path.join(projectRoot, 'lib')))

  for (const file of appFiles) {
    const rel = path.relative(projectRoot, file).replace(/\\/g, '/')
    const source = fs.readFileSync(file, 'utf8')
    if (/process\.env\.NEXT_PUBLIC_[A-Z0-9_]*(SECRET|PASSWORD|PRIVATE_KEY)/i.test(source)) {
      publicSecretLeaks.push(rel)
    }
    const isClientBundle =
      (rel.startsWith('components/') || /\/page\.tsx$/.test(rel) || /\/layout\.tsx$/.test(rel)) &&
      !rel.startsWith('app/api/')
    if (isClientBundle && /^['"]use client['"]/m.test(source) && /from ['"]@\/lib\/db['"]/.test(source)) {
      publicSecretLeaks.push(`${rel}: client bundle imports server db`)
    }
  }

  check(
    'no NEXT_PUBLIC secrets in client-facing code',
    publicSecretLeaks.length === 0,
    publicSecretLeaks.slice(0, 8).join('; ') || undefined
  )

  const failed = results.filter((item) => !item.ok)

  console.log('Security smoke checks\n')
  for (const item of results) {
    const status = item.ok ? 'PASS' : 'FAIL'
    console.log(`[${status}] ${item.name}${item.detail ? ` — ${item.detail}` : ''}`)
  }

  if (failed.length > 0) {
    console.error(`\n${failed.length} security check(s) failed.`)
    process.exit(1)
  }

  console.log(`\nAll ${results.length} security checks passed.`)
}

export default nextConfig
