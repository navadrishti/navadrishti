import { describe, expect, it } from 'vitest'
import {
  AGENT_CTA,
  AGENT_DOMAINS,
  AGENT_PROFILES,
  AI_SUITE_NAME,
  UNIMPLEMENTED_SUITE_AGENTS,
} from '@/lib/ai-agent-sessions'

describe('Navadrishti AI Suite naming', () => {
  it('uses the official suite name and domain labels', () => {
    expect(AI_SUITE_NAME).toBe('Navadrishti AI Suite')
    expect(AGENT_DOMAINS.atlas).toBe('NGO Intelligence')
    expect(AGENT_DOMAINS.catalyst).toBe('CSR Intelligence')
    expect(AGENT_DOMAINS.pulse).toBe('Matching Engine')
    expect(AGENT_DOMAINS.sentinel).toBe('Monitoring Intelligence')
    expect(AGENT_DOMAINS.insight).toBe('Analytics Intelligence')
  })

  it('documents real Atlas capabilities without claiming generative chat', () => {
    expect(AGENT_PROFILES.atlas.implemented).toBe(true)
    expect(AGENT_PROFILES.atlas.domain).toBe('NGO Intelligence')
    expect(AGENT_PROFILES.atlas.capabilities.join(' ')).toMatch(/Pulse/i)
    expect(AGENT_PROFILES.atlas.notIncluded.join(' ')).toMatch(/generative AI/i)
    expect(AGENT_CTA.ngo.description).toContain(AGENT_DOMAINS.atlas)
  })

  it('documents Catalyst milestone suggestions, assembled drafts, and missing credit wallet honestly', () => {
    expect(AGENT_PROFILES.catalyst.implemented).toBe(true)
    expect(AGENT_PROFILES.catalyst.domain).toBe('CSR Intelligence')
    expect(AGENT_PROFILES.catalyst.capabilities.join(' ')).toMatch(/milestone/i)
    expect(AGENT_PROFILES.catalyst.capabilities.join(' ')).toMatch(/Assembled campaign drafts/i)
    expect(AGENT_PROFILES.catalyst.notIncluded.join(' ')).toMatch(/credit wallet/i)
    expect(AGENT_CTA.company.description).toContain(AGENT_DOMAINS.catalyst)
  })

  it('keeps Pulse as embedded matching, not a chat agent', () => {
    expect(AGENT_PROFILES.pulse.implemented).toBe(true)
    expect(AGENT_PROFILES.pulse.domain).toBe('Matching Engine')
    expect(AGENT_PROFILES.pulse.notIncluded.join(' ')).toMatch(/No dedicated Pulse chat page/i)
  })

  it('marks Sentinel and Insight as unimplemented and not marketed as available', () => {
    expect(UNIMPLEMENTED_SUITE_AGENTS.sentinel.implemented).toBe(false)
    expect(UNIMPLEMENTED_SUITE_AGENTS.insight.implemented).toBe(false)
    expect(Object.keys(AGENT_PROFILES)).not.toContain('sentinel')
    expect(Object.keys(AGENT_PROFILES)).not.toContain('insight')
  })
})
