/**
 * LIVE Catalyst milestone suggestion integration (non-production).
 * Campaign drafts are assembled without Gemini; this suite verifies generative milestones.
 *
 * Gated: NAVADRISHTI_LIVE_GEMINI=1 + GEMINI_API_KEY.
 * Uses a controlled synthetic company input — no production writes.
 */
import fs from 'node:fs'
import path from 'node:path'
import { beforeAll, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

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

const controlledInput = {
  company_id: 'live-test-company',
  campaignName: 'Live Milestone Suggestion Check',
  budget: 250000,
  category: 'Education',
  city: 'Pune',
  state_province: 'MH',
  start_date: '2026-04-01',
  end_date: '2026-09-30',
  volunteerRequirement: 'Teacher volunteers',
  requirementDetails: 'Synthetic live-test: school library kits for demo NGO (not a real campaign).',
}

describe.skipIf(!LIVE)('LIVE Catalyst milestone suggestions', () => {
  beforeAll(() => {
    loadDotEnv()
    if (!process.env.GEMINI_API_KEY) {
      throw new Error('NAVADRISHTI_LIVE_GEMINI=1 requires GEMINI_API_KEY')
    }
  })

  it('returns structured milestone sets for a controlled company input', async () => {
    const { suggestMilestoneSets, suggestMilestonesResponseSchema } = await import('@/lib/csr-agent/llm')
    let sets: Awaited<ReturnType<typeof suggestMilestoneSets>>
    try {
      sets = await suggestMilestoneSets(controlledInput)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (/unavailable|API_KEY_INVALID|API key not valid/i.test(message)) {
        throw new Error(
          'BLOCKED: configured GEMINI_API_KEY was rejected or milestone suggestions unavailable. Live verification failed.'
        )
      }
      throw error
    }
    expect(Array.isArray(sets)).toBe(true)
    expect(sets.length).toBeGreaterThan(0)
    expect(sets[0].milestones.length).toBeGreaterThan(0)
    expect(suggestMilestonesResponseSchema.safeParse({ sets }).success).toBe(true)
  }, 120_000)

  it('assembles campaign drafts without generative drafting', async () => {
    const { assembleCampaigns, campaignSchema } = await import('@/lib/csr-agent/llm')
    const campaigns = assembleCampaigns({
      budget: controlledInput.budget,
      milestones: 3,
      category: controlledInput.category,
      city: controlledInput.city,
      state_province: controlledInput.state_province,
      start_date: controlledInput.start_date,
      end_date: controlledInput.end_date,
      requirementDetails: controlledInput.requirementDetails,
      milestone_info: [
        { title: 'Setup', description: 'Establish reading corners', budget_allocated: 80000 },
        { title: 'Train', description: 'Train teachers', budget_allocated: 90000 },
        { title: 'Distribute', description: 'Distribute kits', budget_allocated: 80000 },
      ],
    })
    expect(campaigns.length).toBeGreaterThan(0)
    expect(campaignSchema.safeParse(campaigns[0]).success).toBe(true)
  })

  it('rejects invalid milestone suggestion inputs before the model call (schema)', async () => {
    const { suggestMilestonesInputSchema } = await import('@/lib/csr-agent/llm')
    const bad = suggestMilestonesInputSchema.safeParse({
      ...controlledInput,
      budget: -1,
    })
    expect(bad.success).toBe(false)
  })

  it('surfaces auth failures as unavailable milestone suggestions', async () => {
    const previous = process.env.GEMINI_API_KEY
    process.env.GEMINI_API_KEY = 'invalid-key-for-live-auth-test'
    try {
      const { suggestMilestoneSets } = await import('@/lib/csr-agent/llm')
      await expect(suggestMilestoneSets(controlledInput)).rejects.toThrow(/unavailable|parse|API/i)
    } finally {
      process.env.GEMINI_API_KEY = previous
    }
  }, 90_000)
})

describe('Catalyst CSR live gate', () => {
  it('documents that live milestone suggestion is skipped unless NAVADRISHTI_LIVE_GEMINI=1', () => {
    if (!LIVE) expect(LIVE).toBe(false)
  })
})
