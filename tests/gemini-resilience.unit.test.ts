/**
 * Mocked unit tests for Gemini OCR/CSR failure handling.
 * Not live integration — see tests/live/* for NAVADRISHTI_LIVE_GEMINI runs.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const fetchMock = vi.fn()

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock)
  vi.stubEnv('GEMINI_API_KEY', 'test-key-not-live')
  vi.stubEnv('GEMINI_MODEL', 'gemini-3.5-flash')
  vi.stubEnv('GEMINI_FALLBACK_MODEL', 'gemini-3.5-flash-lite')
  fetchMock.mockReset()
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('GeminiVisionJSON resilience (mocked)', () => {
  it('retries on 429 then succeeds', async () => {
    fetchMock
      .mockResolvedValueOnce(
        new Response('rate', { status: 429, headers: { 'retry-after': '0' } })
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            candidates: [{ content: { parts: [{ text: '{"fields":[]}' }] } }],
          }),
          { status: 200 }
        )
      )

    const { GeminiVisionJSON } = await import('@/lib/gemini-vision')
    const result = await GeminiVisionJSON(
      'x',
      { mimeType: 'application/pdf', data: Buffer.from('%PDF').toString('base64') },
      0,
      'sys',
      { disableThinking: true }
    )
    expect(result).toEqual({ fields: [] })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('rejects malformed JSON model output', async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          candidates: [{ content: { parts: [{ text: 'not-json{{' }] } }],
        }),
        { status: 200 }
      )
    )
    const { GeminiVisionJSON } = await import('@/lib/gemini-vision')
    await expect(
      GeminiVisionJSON('x', { mimeType: 'text/plain', data: 'YQ==' }, 0, 'sys', {
        disableThinking: true,
      })
    ).rejects.toThrow()
  })

  it('surfaces authentication failures without treating them as success', async () => {
    fetchMock.mockImplementation(
      async () =>
        new Response(JSON.stringify({ error: { message: 'API_KEY_INVALID' } }), { status: 403 })
    )
    const { GeminiVisionJSON } = await import('@/lib/gemini-vision')
    await expect(
      GeminiVisionJSON('x', { mimeType: 'text/plain', data: 'YQ==' }, 0, 'sys', {
        disableThinking: true,
      })
    ).rejects.toThrow(/API_KEY_INVALID|403|GeminiError/i)
  })
})

describe('generateCampaigns resilience (mocked)', () => {
  it('sends campaign intake to Gemini and validates the provider response', async () => {
    const campaign = {
      title: 'Education Campaign',
      description: 'Build local learning capacity.',
      category: 'Education',
      location: 'Pune, MH',
      budget_inr: 10000,
      budget_breakdown: {
        infrastructure: 4000,
        training: 2000,
        materials: 2000,
        monitoring: 1200,
        contingency: 800,
      },
      schedule_vii: 'Education',
      sdg_alignment: [4],
      start_date: '2026-01-01',
      end_date: '2026-06-01',
      impact_metrics: { beneficiaries: 20, duration: '2026-01-01 to 2026-06-01' },
      milestones: [
        {
          title: 'Learning spaces',
          description: 'Prepare classrooms.',
          duration_weeks: 2,
          budget_allocated: 10000,
          deliverables: ['Classrooms prepared'],
        },
      ],
    }
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          candidates: [
            {
              finishReason: 'STOP',
              content: { parts: [{ text: JSON.stringify({ campaigns: [campaign] }) }] },
            },
          ],
        }),
        { status: 200 }
      )
    )

    const { generateCampaigns } = await import('@/lib/csr-agent/llm')
    const result = await generateCampaigns({
      company_id: '1',
      budget: 10000,
      milestones: 1,
      category: 'Education',
      city: 'Pune',
      state_province: 'MH',
      start_date: '2026-01-01',
      end_date: '2026-06-01',
      milestone_info: [{ title: 'Learning spaces', description: 'Prepare classrooms.', budget_allocated: 10000 }],
    })

    expect(result).toEqual([campaign])
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain(
      '/models/gemini-3.5-flash:generateContent'
    )
    const requestInit = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined
    const requestBody = JSON.parse(String(requestInit?.body))
    expect(requestBody.contents[0].parts[0].text).toContain('Budget: ₹10000')
    expect(requestBody.contents[0].parts[0].text).toContain('Prepare classrooms.')
  })

  it('maps Gemini API failures to unavailable drafting', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ error: { message: 'API_KEY_INVALID' } }), { status: 400 })
    )

    const { generateCampaigns } = await import('@/lib/csr-agent/llm')
    await expect(
      generateCampaigns({
        company_id: '1',
        budget: 10000,
        milestones: 1,
        category: 'Education',
        city: 'Pune',
        state_province: 'MH',
        start_date: '2026-01-01',
        end_date: '2026-06-01',
      })
    ).rejects.toThrow(/unavailable|parse/i)
  })
})
