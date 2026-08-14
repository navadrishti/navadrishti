import 'server-only'

import { GeminiError } from '@/lib/geminiClient'

function parseGeminiJson(output: string): Record<string, unknown> {
  const trimmed = output.trim().replace(/^```json\s*/i, '').replace(/```$/i, '').trim()
  return JSON.parse(trimmed)
}

export type GeminiVisionOptions = {
  disableThinking?: boolean
  responseSchema?: Record<string, unknown>
}

export async function GeminiVisionJSON(
  prompt: string,
  file: { mimeType: string; data: string },
  retryCount = 0,
  systemInstruction = 'Extract KYC fields from the document. Return JSON only.',
  options?: GeminiVisionOptions
): Promise<Record<string, unknown>> {
  const API_KEY = process.env.GEMINI_API_KEY
  if (!API_KEY) throw new Error('GEMINI_API_KEY is missing.')

  const PRIMARY = process.env.GEMINI_MODEL || 'gemini-2.5-flash'
  const FALLBACK = process.env.GEMINI_FALLBACK_MODEL || 'gemini-2.5-flash-lite'
  const currentModel = retryCount < 2 ? PRIMARY : FALLBACK
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${currentModel}:generateContent?key=${API_KEY}`

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 60000)

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: systemInstruction }],
        },
        contents: [
          {
            role: 'user',
            parts: [
              { text: prompt },
              { inlineData: { mimeType: file.mimeType, data: file.data } },
            ],
          },
        ],
        generationConfig: {
          temperature: 0,
          topP: 0,
          topK: 1,
          responseMimeType: 'application/json',
          maxOutputTokens: 4096,
          ...(options?.disableThinking ? { thinkingConfig: { thinkingBudget: 0 } } : {}),
          ...(options?.responseSchema ? { responseSchema: options.responseSchema } : {}),
        },
      }),
      signal: controller.signal,
    })

    clearTimeout(timeoutId)

    if (!res.ok) {
      if (res.status === 400 && options?.disableThinking && retryCount < 3) {
        await res.text()
        return GeminiVisionJSON(prompt, file, retryCount + 1, systemInstruction, {
          ...options,
          disableThinking: false,
        })
      }
      if ((res.status === 429 || res.status >= 500) && retryCount < 3) {
        const retryAfterHeader = res.headers.get('retry-after')
        let waitTime = Math.pow(2, retryCount) * 1000 + Math.random() * 500
        if (res.status === 429 && retryAfterHeader) {
          const seconds = parseInt(retryAfterHeader, 10)
          if (!Number.isNaN(seconds)) waitTime = seconds * 1000
        }
        await new Promise((r) => setTimeout(r, waitTime))
        return GeminiVisionJSON(prompt, file, retryCount + 1, systemInstruction, options)
      }
      throw new GeminiError(res.status, await res.text())
    }

    const data = await res.json()
    const candidate = data?.candidates?.[0]
    if (!candidate || candidate.finishReason === 'SAFETY') {
      throw new GeminiError(res.status || 400, 'Safety block or empty response.', true)
    }

    const output = candidate.content?.parts
      ?.map((p: any) => p.text)
      .filter(Boolean)
      .join('')
      .trim()

    if (!output) throw new Error("Empty response from document reader.")
    return parseGeminiJson(output)
  } catch (error: any) {
    clearTimeout(timeoutId)
    const isNetworkError = error instanceof TypeError || error.name === 'FetchError'
    if (isNetworkError && retryCount < 3) {
      await new Promise((r) => setTimeout(r, 1500))
      return GeminiVisionJSON(prompt, file, retryCount + 1, systemInstruction, options)
    }
    if (error.name === 'AbortError') throw new Error('Document reading timed out.')
    throw error
  }
}

const MAX_OCR_BYTES = 12 * 1024 * 1024

const PLACEHOLDER =
  /^(n\/?a|na|none|null|unknown|not (found|visible|clear|available|extracted|printed)|illegible|unreadable|redacted|hidden|masked|-|—|\.{2,}|x{2,}|\*{2,}|•{2,})$/i

const GUESS_LANGUAGE =
  /\b(as per|appears to be|looks like|probably|likely|typical|standard format|checksum|should be|might be|seems to|estimated|inferred|completed|filled in|see (above|document|image)|not (visible|clear|printed))\b/i

const OCR_SYSTEM = `You are a camera. You copy printed characters from the attached file. You do nothing else.

You are not a KYC checker, not a formatter, and not a validator.
You do not know what a PAN, Aadhaar, GST, CIN, or FCRA number "should" look like.

Copy rules:
- Copy characters only if they are clearly printed on this file.
- Keep the original letters, digits, spaces, punctuation, masking (X * •), and case.
- If a character is blurry, cropped, masked, or uncertain, omit the whole field.

Forbidden:
- Guessing, inferring, completing, calculating, or generating any character.
- Fixing spelling or expanding abbreviations.
- Filling masked or missing digits from format knowledge.
- Using the file name, document type, or typical Indian ID layouts to invent a value.
- Outputting a field that is not printed on this exact file.

verbatim must be a contiguous quote copied from the file. The value must appear inside that quote as printed.

If nothing is clearly readable, return {"fields":[]}.
Return JSON only.`

const OCR_CONFIRM_SYSTEM = `You are a camera. For each given string, answer whether those exact characters are printed on the attached file.

Copy a quote from the file only if the string is visibly printed.
Do not correct, complete, reformat, or guess.
If the string is not clearly printed, found must be false and quote must be empty.
Return JSON only.`


const ALLOWED_LABELS = new Set(
  [
    'Name',
    'Full Name',
    "Father's Name",
    'Date of Birth',
    'PAN Number',
    'Aadhaar Number',
    'GSTIN',
    'GST Number',
    'CIN',
    'Registration Number',
    'FCRA Number',
    '12A Number',
    '80G Number',
    'CSR-1 Registration Number',
    'Address',
    'Registered Address',
    'Registered Office',
    'Permanent Address',
    'Date of Incorporation',
    'Date of Registration',
    'Company Name',
    'Legal Name',
    'Organization Name',
    'Account Holder Name',
    'Account Number',
    'Bank Name',
    'IFSC',
    'Account Type',
    'Statement From',
    'Statement To',
    'Opening Balance',
    'Closing Balance',
    'Approval Date',
    'Valid From',
    'Valid Until',
    'Valid Till',
    'Valid Upto',
    'Expiry Date',
    'Date of Expiry',
    'FCRA Expiry',
    '12A Expiry',
    '80G Expiry',
    'CSR-1 Expiry',
  ].map((label) => label.replace(/\s+/g, '').toUpperCase())
)

const OCR_RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    fields: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          label: { type: 'STRING' },
          value: { type: 'STRING' },
          verbatim: { type: 'STRING' },
        },
        required: ['label', 'value', 'verbatim'],
      },
    },
  },
  required: ['fields'],
}

const OCR_CONFIRM_SCHEMA = {
  type: 'OBJECT',
  properties: {
    checks: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          value: { type: 'STRING' },
          found: { type: 'BOOLEAN' },
          quote: { type: 'STRING' },
        },
        required: ['value', 'found', 'quote'],
      },
    },
  },
  required: ['checks'],
}

function guessMimeType(url: string, contentType?: string | null) {
  if (contentType) {
    const mime = contentType.split(';')[0].trim().toLowerCase()
    if (mime && mime !== 'application/octet-stream') return mime
  }
  if (/\.pdf$/i.test(url) || url.includes('/raw/upload')) return 'application/pdf'
  if (/\.png$/i.test(url)) return 'image/png'
  if (/\.webp$/i.test(url)) return 'image/webp'
  return 'image/jpeg'
}

function compact(text: string) {
  return text.replace(/[\s\-_.]/g, '')
}

function collapse(text: string) {
  return text.replace(/\s+/g, ' ').trim()
}

function isPlaceholder(value: string) {
  return !value.trim() || PLACEHOLDER.test(value.trim())
}

function looksLikeGuess(value: string) {
  return GUESS_LANGUAGE.test(value)
}

function filledMaskedValue(value: string, verbatim: string) {
  return /[X*•]/i.test(verbatim) && !/[X*•]/i.test(value)
}

function isAllowedLabel(label: string) {
  return ALLOWED_LABELS.has(label.replace(/\s+/g, '').toUpperCase())
}

function looksLikeDateValue(value: string) {
  return (
    /\d{1,4}[/.\-]\d{1,2}[/.\-]\d{2,4}/.test(value) ||
    /\d{1,2}\s+[A-Za-z]{3,9},?\s+\d{4}/.test(value)
  )
}

function valueIsOnDocument(value: string, verbatim: string) {
  const trimmed = collapse(value)
  const quote = collapse(verbatim)
  if (!trimmed || !quote) return false
  if (trimmed.length > quote.length) return false
  if (quote.includes(trimmed)) return true
  if (quote.toLowerCase().includes(trimmed.toLowerCase())) return true

  const compactValue = compact(trimmed)
  const compactQuote = compact(quote)
  if (compactValue.length < (looksLikeDateValue(trimmed) ? 5 : 6)) return false
  return compactQuote.toLowerCase().includes(compactValue.toLowerCase())
}

function keepExtractedField(label: string, value: string, verbatim: string) {
  if (!isAllowedLabel(label)) return false
  if (isPlaceholder(value) || isPlaceholder(verbatim)) return false
  if (looksLikeGuess(value) || looksLikeGuess(verbatim)) return false
  if (filledMaskedValue(value, verbatim)) return false
  return valueIsOnDocument(value, verbatim)
}

export function isGeminiOcrUnavailable(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  return /GEMINI_API_KEY is missing|API_KEY_INVALID|API key not valid|403|401/i.test(message)
}

async function fetchDocumentForGemini(fileUrl: string) {
  const response = await fetch(fileUrl, { signal: AbortSignal.timeout(20000) })
  if (!response.ok) {
    throw new Error(`Failed to download document (${response.status})`)
  }
  const buffer = Buffer.from(await response.arrayBuffer())
  if (buffer.byteLength > MAX_OCR_BYTES) {
    throw new Error('Document is too large to read')
  }
  return {
    data: buffer.toString('base64'),
    mimeType: guessMimeType(fileUrl, response.headers.get('content-type')),
  }
}

export async function extractVisibleKycFields(input: {
  label: string
  fileName: string
  fileUrl: string
}) {
  const file = await fetchDocumentForGemini(input.fileUrl)
  const extracted = await GeminiVisionJSON(
    `Copy visible printed KYC fields from the attached file only.

Do not use the file name or document type to invent values.
Include a field only if every character of its value is clearly printed on this file.

Allowed labels:
Name, Full Name, Father's Name, Date of Birth, Date of Incorporation, Date of Registration, PAN Number, Aadhaar Number, GSTIN, GST Number, CIN, Registration Number, FCRA Number, 12A Number, 80G Number, CSR-1 Registration Number, Address, Registered Address, Registered Office, Permanent Address, Company Name, Legal Name, Organization Name, Account Holder Name, Account Number, Bank Name, IFSC, Account Type, Statement From, Statement To, Opening Balance, Closing Balance, Approval Date, Valid From, Valid Until, Valid Till, Valid Upto, Expiry Date, Date of Expiry, FCRA Expiry, 12A Expiry, 80G Expiry, CSR-1 Expiry.

JSON:
{"fields":[{"label":"","value":"","verbatim":""}]}

value = exact printed text.
verbatim = a contiguous quote from the file that contains that exact printed value.
Omit any field you cannot quote. If none, {"fields":[]}.`,
    file,
    0,
    OCR_SYSTEM,
    {
      disableThinking: true,
      responseSchema: OCR_RESPONSE_SCHEMA,
    }
  )

  const raw = Array.isArray((extracted as { fields?: unknown }).fields)
    ? (extracted as { fields: unknown[] }).fields
    : []

  const candidates: { label: string; value: string }[] = []
  const seen = new Set<string>()

  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue
    const row = entry as Record<string, unknown>
    const label = typeof row.label === 'string' ? row.label.trim() : ''
    const value = typeof row.value === 'string' ? row.value.trim() : ''
    const verbatim = typeof row.verbatim === 'string' ? row.verbatim.trim() : ''
    if (!keepExtractedField(label, value, verbatim)) continue
    const key = label.replace(/\s+/g, '').toUpperCase()
    if (seen.has(key)) continue
    seen.add(key)
    candidates.push({ label, value })
  }

  if (candidates.length === 0) return []

  try {
    const listed = candidates
      .map((field, index) => `${index + 1}. ${JSON.stringify(field.value)}`)
      .join('\n')
    const confirmed = await GeminiVisionJSON(
      `For each string below, found=true only if those exact characters are printed on the attached file.

${listed}

JSON:
{"checks":[{"value":"","found":false,"quote":""}]}

quote must be copied from the file and must contain the value as printed.
If the string is not clearly printed, found=false and quote="".`,
      file,
      0,
      OCR_CONFIRM_SYSTEM,
      {
        disableThinking: true,
        responseSchema: OCR_CONFIRM_SCHEMA,
      }
    )

    const checks = Array.isArray((confirmed as { checks?: unknown }).checks)
      ? (confirmed as { checks: unknown[] }).checks
      : []
    const confirmedValues = new Set(
      checks
        .map((entry) => {
          if (!entry || typeof entry !== 'object') return ''
          const row = entry as Record<string, unknown>
          if (row.found !== true) return ''
          const value = typeof row.value === 'string' ? row.value.trim() : ''
          const quote = typeof row.quote === 'string' ? row.quote.trim() : ''
          if (!value || !valueIsOnDocument(value, quote) || filledMaskedValue(value, quote)) return ''
          return value
        })
        .filter(Boolean)
    )

    return candidates.filter((field) => confirmedValues.has(field.value))
  } catch (error) {
    if (isGeminiOcrUnavailable(error)) throw error
    console.error('OCR confirm pass failed; dropping unconfirmed fields:', error)
    return []
  }
}

