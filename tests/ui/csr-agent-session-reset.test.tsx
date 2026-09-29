import { act, render, renderHook, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { fetchCampaignRow } from '@/app/companies/csr-agent/api'
import type { MilestoneInput, ProjectIntakeData } from '@/app/companies/csr-agent/session'
import type { CampaignState } from '@/app/companies/csr-agent/use-campaign-state'
import { useLeadNgoInvites } from '@/app/companies/csr-agent/use-lead-ngo-invites'
import { usePreviewEdits } from '@/app/companies/csr-agent/use-preview-edits'
import { useSessionActions } from '@/app/companies/csr-agent/use-session-actions'
import { ChatComposer } from '@/app/ngos/ai-agent/chat-panel'
import { jsonResponse, mockFetch } from './helpers'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function campaignState(values: Partial<CampaignState> = {}) {
  const setters: Record<string, ReturnType<typeof vi.fn>> = {}
  const state = new Proxy(values as Record<string, unknown>, {
    get(target, key: string) {
      if (key in target) return target[key]
      if (key.startsWith('set')) return (setters[key] ??= vi.fn())
      return undefined
    },
  })
  return { campaign: state as unknown as CampaignState, setters }
}

describe('createNewSession', () => {
  it('resets draft, invite and selection state and uses a UUID id', () => {
    const { campaign, setters } = campaignState()
    const options = {
      campaign,
      userId: 5,
      token: 'tok',
      canPersist: true,
      sessions: [],
      setSessions: vi.fn(),
      activeSessionId: 'old',
      setActiveSessionId: vi.fn(),
      persistSessions: vi.fn(),
      setServiceSuggestions: vi.fn(),
      setRecommendationError: vi.fn(),
      setProjectSuggestions: vi.fn(),
      restoreLeadNgoState: vi.fn(),
      syncLeadInviteStatuses: vi.fn(async () => null),
      appendAssistantMessage: vi.fn(),
    }
    const { result } = renderHook(() => useSessionActions(options))

    act(() => result.current.createNewSession())

    expect(setters.setDraftCampaignId).toHaveBeenCalledWith(null)
    expect(setters.setInvitedOfferIds).toHaveBeenCalledWith([])
    expect(setters.setSelectedProjectSuggestionId).toHaveBeenCalledWith(null)
    expect(options.setProjectSuggestions).toHaveBeenCalledWith([])
    expect(options.restoreLeadNgoState).toHaveBeenCalledWith(expect.objectContaining({ leadNgoInvites: [], draftCampaignId: null }))
    const freshId = options.setActiveSessionId.mock.calls[0][0]
    expect(freshId).toMatch(UUID_PATTERN)
    expect(options.persistSessions).toHaveBeenCalledWith([expect.objectContaining({ id: freshId })], freshId)
  })
})

describe('useLeadNgoInvites directory spinner', () => {
  it('clears when project details become incomplete while a fetch is pending', async () => {
    mockFetch(() => new Promise<Response>(() => {}))
    const complete: ProjectIntakeData = { campaignName: 'Wells', category: 'Water', endDate: '2026-12-31' }
    const baseOptions = {
      mounted: true,
      userId: 5,
      token: 'tok',
      activeSessionId: 'session-1',
      draftCampaignId: null,
      setDraftCampaignId: vi.fn(),
      actionsEnabled: true,
      appendAssistantMessage: vi.fn(),
      persistSnapshot: vi.fn(),
      onLeadInvited: vi.fn(),
    }
    const { result, rerender } = renderHook((projectData: ProjectIntakeData) => useLeadNgoInvites({ ...baseOptions, projectData }), {
      initialProps: complete,
    })
    await waitFor(() => expect(result.current.isFetchingNgoDirectory).toBe(true))

    rerender({ ...complete, category: '' })

    await waitFor(() => expect(result.current.isFetchingNgoDirectory).toBe(false))
  })
})

describe('fetchCampaignRow', () => {
  it('reads the campaign through the authenticated API', async () => {
    const fetchMock = mockFetch(() => jsonResponse({ success: true, data: { id: 'c1', title: 'Wells' } }))
    await expect(fetchCampaignRow('c1', 'tok')).resolves.toEqual({ id: 'c1', title: 'Wells' })
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/campaigns/c1')
    expect(init?.headers).toEqual({ Authorization: 'Bearer tok' })
  })

  it('returns null when the campaign is not visible', async () => {
    mockFetch(() => jsonResponse({ error: 'Campaign not found' }, 404))
    await expect(fetchCampaignRow('c1', 'tok')).resolves.toBeNull()
  })
})

describe('usePreviewEdits', () => {
  it('regenerates with the edited project details instead of stale state', async () => {
    const stale: ProjectIntakeData = { category: 'Water', city: 'Pune', state: 'MH', budget: '100000', startDate: '2026-01-01', endDate: '2026-12-31' }
    const milestones = [{ description: 'Dig', budgetTarget: '100000' }] as MilestoneInput[]
    const { campaign } = campaignState({ projectData: stale, milestoneCount: 1, milestoneInputs: milestones })
    const finalizeConversation = vi.fn(async () => {})
    const { result } = renderHook(() =>
      usePreviewEdits({
        campaign,
        setServiceSuggestions: vi.fn(),
        finalizeConversation,
        appendAssistantMessage: vi.fn(),
        persistSnapshot: vi.fn(),
      })
    )

    act(() => {
      result.current.handleSaveProjectPreviewEdit({ ...stale, city: 'Nashik', budget: '250000' })
    })

    await waitFor(() => expect(finalizeConversation).toHaveBeenCalledTimes(1))
    expect(finalizeConversation).toHaveBeenCalledWith({
      projectData: expect.objectContaining({ city: 'Nashik', budget: '250000' }),
      milestoneCount: 1,
      milestoneInputs: milestones,
      serviceSuggestions: [],
      questionnaireComplete: true,
    })
  })
})

describe('NGO ChatComposer', () => {
  it('disables quick picks while the assistant is typing', () => {
    const onQuickPick = vi.fn()
    render(
      <ChatComposer
        input=""
        isTyping
        fixedChoiceOptions={['Yes', 'No']}
        suggestionNeedIndex={null}
        suggestedOffers={[]}
        appliedOfferIds={[]}
        onInputChange={vi.fn()}
        onInputFocus={vi.fn()}
        onSend={vi.fn()}
        onQuickPick={onQuickPick}
        onApplyOffer={vi.fn()}
        onRemoveOffer={vi.fn()}
      />
    )
    const yes = screen.getByRole('button', { name: 'Yes' })
    expect(yes).toBeDisabled()
    yes.click()
    expect(onQuickPick).not.toHaveBeenCalled()
  })
})
