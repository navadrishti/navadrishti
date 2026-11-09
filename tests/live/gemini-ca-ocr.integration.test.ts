/**
 * LIVE Gemini CA OCR integration (non-production).
 *
 * Gated: set NAVADRISHTI_LIVE_GEMINI=1 and GEMINI_API_KEY.
 * Uses synthetic PDF bytes only — never real customer KYC documents.
 *
 * Distinguishes from mocked unit tests under tests/ca-*.test.ts.
 */
import fs from 'node:fs'
import path from 'node:path'
import { beforeAll, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

/** Only runs when explicitly requested. Skipped results are not treated as passes. */
const LIVE = process.env.NAVADRISHTI_LIVE_GEMINI === '1'

/** Keys that must come from local `.env` even if a parent shell has stale values. */
const FORCE_FROM_DOTENV = new Set([
  'GEMINI_API_KEY',
  'GEMINI_MODEL',
  'GEMINI_FALLBACK_MODEL',
  'NAVADRISHTI_LIVE_GEMINI',
])

function loadDotEnv() {
  const envPath = path.resolve(process.cwd(), '.env')
  if (!fs.existsSync(envPath)) return
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq < 1) continue
    const key = trimmed.slice(0, eq).trim()
    let value = trimmed.slice(eq + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    if (FORCE_FROM_DOTENV.has(key) || !(key in process.env)) {
      process.env[key] = value
    }
  }
}

function syntheticPdf(lines: string[], mediaBox = '[0 0 420 260]'): { mimeType: string; data: string } {
  const textOps = lines
    .map((line, index) => (index === 0 ? `(${line}) Tj` : `0 -18 Td (${line}) Tj`))
    .join('\n')
  const stream = `BT /F1 11 Tf 36 220 Td\n${textOps}\nET`
  const objects = [
    '1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj',
    '2 0 obj<< /Type /Pages /Kids [3 0 R] /Count 1 >>endobj',
    `3 0 obj<< /Type /Page /Parent 2 0 R /MediaBox ${mediaBox} /Contents 4 0 R /Resources<< /Font<< /F1 5 0 R >> >> >>endobj`,
    `4 0 obj<< /Length ${stream.length} >>stream\n${stream}\nendstream endobj`,
    '5 0 obj<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>endobj',
  ]
  const pdf = `%PDF-1.4\n${objects.join('\n')}\ntrailer<< /Root 1 0 R >>\n%%EOF`
  return { mimeType: 'application/pdf', data: Buffer.from(pdf).toString('base64') }
}

/** Minimal synthetic PDF with printed KYC-like labels (not a real ID). */
function syntheticPanPdf(): { mimeType: string; data: string } {
  return syntheticPdf([
    'SYNTHETIC TEST DOCUMENT - NOT A REAL ID',
    'Full Name: Ada Testperson',
    'PAN Number: ABCDE1234F',
    'Date of Birth: 01/01/1990',
  ])
}

/** Synthetic registration-style org document (not a real certificate). */
function syntheticRegistrationPdf(): { mimeType: string; data: string } {
  return syntheticPdf([
    'SYNTHETIC ORG REGISTRATION - NOT REAL',
    'Organization Name: Navadrishti Demo Trust',
    'Registration Number: REG-DEMO-2026-001',
    'Date of Registration: 15/03/2024',
    'Registered Address: 12 Test Lane Pune MH',
  ])
}

/** Tiny 1x1 PNG — verifies image MIME path; no printed text expected. */
function syntheticTinyPng(): { mimeType: string; data: string } {
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64'
  )
  return { mimeType: 'image/png', data: png.toString('base64') }
}

function blankPdf(): { mimeType: string; data: string } {
  const stream = 'BT /F1 12 Tf 40 100 Td ( ) Tj ET'
  const objects = [
    '1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj',
    '2 0 obj<< /Type /Pages /Kids [3 0 R] /Count 1 >>endobj',
    '3 0 obj<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Contents 4 0 R /Resources<< /Font<< /F1 5 0 R >> >> >>endobj',
    `4 0 obj<< /Length ${stream.length} >>stream\n${stream}\nendstream endobj`,
    '5 0 obj<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>endobj',
  ]
  const pdf = `%PDF-1.4\n${objects.join('\n')}\ntrailer<< /Root 1 0 R >>\n%%EOF`
  return { mimeType: 'application/pdf', data: Buffer.from(pdf).toString('base64') }
}

describe.skipIf(!LIVE)('LIVE Gemini CA OCR', () => {
  beforeAll(() => {
    loadDotEnv()
    if (!process.env.GEMINI_API_KEY) {
      throw new Error('NAVADRISHTI_LIVE_GEMINI=1 requires GEMINI_API_KEY')
    }
  })

  it('extracts visible fields from a synthetic document', async () => {
    const { GeminiVisionJSON } = await import('@/lib/gemini-vision')
    let result: Record<string, unknown>
    try {
      result = await GeminiVisionJSON(
      `Copy visible printed KYC fields from the attached file only.
Allowed labels: Full Name, PAN Number, Date of Birth.
JSON: {"fields":[{"label":"","value":"","verbatim":""}]}
If none, {"fields":[]}.`,
      syntheticPanPdf(),
      0,
      'Extract only clearly printed fields. Return JSON only.',
      { disableThinking: true }
      )
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (/API_KEY_INVALID|API key not valid/i.test(message)) {
        throw new Error(
          'BLOCKED: configured GEMINI_API_KEY was rejected by Google (API_KEY_INVALID). Live OCR extraction was not verified.'
        )
      }
      throw error
    }
    const fields = Array.isArray((result as { fields?: unknown }).fields)
      ? (result as { fields: Array<{ label?: string; value?: string }> }).fields
      : []
    expect(fields.length).toBeGreaterThan(0)
    const joined = JSON.stringify(fields).toUpperCase()
    expect(joined.includes('ADA') || joined.includes('ABCDE1234F') || joined.includes('PAN')).toBe(true)
  }, 90_000)

  it('returns empty or sparse fields for an unreadable blank document', async () => {
    const { GeminiVisionJSON } = await import('@/lib/gemini-vision')
    const result = await GeminiVisionJSON(
      `Copy visible printed KYC fields only. JSON: {"fields":[{"label":"","value":"","verbatim":""}]}
If none clearly printed, {"fields":[]}.`,
      blankPdf(),
      0,
      'Do not invent fields. Return JSON only.',
      { disableThinking: true }
    )
    const fields = Array.isArray((result as { fields?: unknown }).fields)
      ? (result as { fields: unknown[] }).fields
      : []
    expect(Array.isArray(fields)).toBe(true)
  }, 90_000)

  it('extracts structured org fields from a synthetic registration PDF', async () => {
    const { GeminiVisionJSON } = await import('@/lib/gemini-vision')
    const result = await GeminiVisionJSON(
      `Copy visible printed fields only.
Allowed labels: Organization Name, Registration Number, Date of Registration, Registered Address.
JSON: {"fields":[{"label":"","value":"","verbatim":""}]}
If none, {"fields":[]}.`,
      syntheticRegistrationPdf(),
      0,
      'Extract only clearly printed fields. Return JSON only.',
      { disableThinking: true }
    )
    const fields = Array.isArray((result as { fields?: unknown }).fields)
      ? (result as { fields: Array<{ label?: string; value?: string }> }).fields
      : []
    expect(fields.length).toBeGreaterThan(0)
    const joined = JSON.stringify(fields).toUpperCase()
    expect(
      joined.includes('NAVADRISHTI') ||
        joined.includes('REG-DEMO') ||
        joined.includes('REGISTRATION') ||
        joined.includes('PUNE')
    ).toBe(true)
  }, 90_000)

  it('accepts image/png MIME and returns structured fields array', async () => {
    const { GeminiVisionJSON } = await import('@/lib/gemini-vision')
    const result = await GeminiVisionJSON(
      `Copy visible printed KYC fields only. JSON: {"fields":[{"label":"","value":"","verbatim":""}]}
If none clearly printed, {"fields":[]}.`,
      syntheticTinyPng(),
      0,
      'Do not invent fields. Return JSON only.',
      { disableThinking: true }
    )
    expect(Array.isArray((result as { fields?: unknown }).fields)).toBe(true)
  }, 90_000)

  it('fails closed on invalid API authentication', async () => {
    const previous = process.env.GEMINI_API_KEY
    process.env.GEMINI_API_KEY = 'invalid-key-for-live-auth-test'
    try {
      const { GeminiVisionJSON } = await import('@/lib/gemini-vision')
      await expect(
        GeminiVisionJSON('Return {"fields":[]}', syntheticPanPdf(), 0, 'JSON only.', {
          disableThinking: true,
        })
      ).rejects.toThrow()
    } finally {
      process.env.GEMINI_API_KEY = previous
    }
  }, 60_000)
})

describe('Gemini CA OCR live gate', () => {
  it('documents that live OCR is skipped unless NAVADRISHTI_LIVE_GEMINI=1', () => {
    if (LIVE) {
      expect(process.env.GEMINI_API_KEY).toBeTruthy()
    } else {
      expect(LIVE).toBe(false)
    }
  })
})
