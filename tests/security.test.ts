import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = path.resolve(import.meta.dirname, '..')

function read(file: string) {
  return fs.readFileSync(path.join(root, file), 'utf8')
}

function sourceFiles(dir: string, files: string[] = []): string[] {
  for (const entry of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
    const rel = `${dir}/${entry.name}`
    if (entry.isDirectory()) sourceFiles(rel, files)
    else if (/\.(tsx?|jsx?|mjs)$/.test(entry.name)) files.push(rel)
  }
  return files
}

describe('next.config.mjs', () => {
  const config = read('next.config.mjs')

  it('does not ship browser source maps', () => {
    expect(config).toMatch(/productionBrowserSourceMaps:\s*false/)
  })

  it('strips console output in production', () => {
    expect(config).toContain('removeConsole')
  })

  it.each([
    'X-Frame-Options',
    'X-Content-Type-Options',
    'Referrer-Policy',
    'Permissions-Policy',
    'Content-Security-Policy',
  ])('sets the %s header', (header) => {
    expect(config).toContain(header)
  })
})

describe('client and server boundaries', () => {
  it('mounts the production client guards in the theme provider', () => {
    expect(read('components/theme-provider.tsx')).toContain('useProductionClientGuards')
  })

  it('requires a platform CA token for evidence approvals', () => {
    const serverAuth = read('lib/server-auth.ts')
    expect(serverAuth).toMatch(/const platformCA = getCAFromRequest\(request\)/)
    expect(serverAuth).toMatch(/if \(platformCA\) \{[\s\S]*actorType: 'platform_ca'/)
  })

  it('loads Razorpay checkout from the official CDN', () => {
    expect(read('lib/razorpay-checkout.ts')).toContain('https://checkout.razorpay.com/v1/checkout.js')
  })

  it('keeps secrets out of NEXT_PUBLIC variables and the db client out of client components', () => {
    const problems: string[] = []
    for (const file of [...sourceFiles('app'), ...sourceFiles('components'), ...sourceFiles('lib')]) {
      const source = read(file)
      if (/process\.env\.NEXT_PUBLIC_[A-Z0-9_]*(SECRET|PASSWORD|PRIVATE_KEY)/i.test(source)) {
        problems.push(`${file}: secret in NEXT_PUBLIC variable`)
      }
      if (/^['"]use client['"]/m.test(source) && /from ['"]@\/lib\/db['"]/.test(source)) {
        problems.push(`${file}: client component imports @/lib/db`)
      }
    }
    expect(problems).toEqual([])
  })
})
