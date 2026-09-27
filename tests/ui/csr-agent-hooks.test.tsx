import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { User } from '@/lib/auth-context'
import { useCapabilityRentals } from '@/app/companies/csr-agent/use-capability-rentals'
import { useLeadNgoInvites } from '@/app/companies/csr-agent/use-lead-ngo-invites'
import type { NgoDirectoryItem } from '@/app/companies/csr-agent/session'
import { jsonResponse, mockFetch, requestBody } from './helpers'

const checkout = vi.hoisted(() => ({ open: vi.fn() }))

vi.mock('@/lib/razorpay-checkout', () => ({
  openRazorpayCheckout: checkout.open,
}))

const ngo: NgoDirectoryItem = { id: 11, name: 'Green Earth', email: 'green@example.org', score: 80 }

function inviteOptions(overrides: Partial<Parameters<typeof useLeadNgoInvites>[0]> = {}) {
  return {
    mounted: true,
    userId: 5,
    token: 'tok',
    projectData: {},
    activeSessionId: 'session-1',
    draftCampaignId: null,
    setDraftCampaignId: vi.fn(),
    actionsEnabled: true,
    appendAssistantMessage: vi.fn(),
    persistSnapshot: vi.fn(),
    onLeadInvited: vi.fn(),
    ...overrides,
  }
}

function invitedState(status: string) {
  return {
    success: true,
    data: {
      draftCampaignId: 'draft-9',
      invites: [{ ngo_id: 11, name: 'Green Earth', email: 'green@example.org', status }],
    },
  }
}

describe('useLeadNgoInvites', () => {
  it('invites then removes a lead NGO', async () => {
    let inviteStatus = 'invited'
    const fetchMock = mockFetch((_url, init) => {
      if (init?.method === 'POST') {
        const body = requestBody(init)
        if (body.action === 'revoke') inviteStatus = 'revoked'
        return jsonResponse(body.action === 'revoke' ? { success: true, data: { draftCampaignId: 'draft-9', invites: [] } } : invitedState(inviteStatus))
      }
      return jsonResponse(inviteStatus === 'invited' ? invitedState('invited') : { success: true, data: { invites: [] } })
    })
    const options = inviteOptions()
    const { result } = renderHook(() => useLeadNgoInvites(options))

    await act(() => result.current.handleInviteLeadNgoToggle(ngo))

    expect(result.current.leadNgoInvites).toEqual([
      { ngoId: 11, name: 'Green Earth', email: 'green@example.org', status: 'invited' },
    ])
    expect(options.setDraftCampaignId).toHaveBeenCalledWith('draft-9')
    expect(options.onLeadInvited).toHaveBeenCalledTimes(1)
    expect(options.appendAssistantMessage).toHaveBeenLastCalledWith(expect.stringContaining('Invited Green Earth'))
    const inviteCall = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST')
    expect(requestBody(inviteCall?.[1])).toMatchObject({ action: 'invite', ngoId: 11, sessionId: 'session-1' })

    await act(() => result.current.handleInviteLeadNgoToggle(ngo))

    const postBodies = fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST').map(([, init]) => requestBody(init))
    expect(postBodies.at(-1)).toMatchObject({ action: 'revoke', ngoId: 11 })
    expect(result.current.leadNgoInvites).toEqual([])
    expect(options.onLeadInvited).toHaveBeenCalledTimes(1)
    expect(options.appendAssistantMessage).toHaveBeenLastCalledWith('Removed lead NGO invite for Green Earth.')
  })

  it('retries without the draft id when the draft is gone', async () => {
    const postDraftIds: unknown[] = []
    mockFetch((_url, init) => {
      if (init?.method === 'POST') {
        const body = requestBody(init)
        postDraftIds.push(body.draftCampaignId)
        return body.draftCampaignId ? jsonResponse({ success: false, error: 'Not found' }, 404) : jsonResponse(invitedState('invited'))
      }
      return jsonResponse({ success: false }, 404)
    })
    const options = inviteOptions({ draftCampaignId: 'stale-draft' })
    const { result } = renderHook(() => useLeadNgoInvites(options))

    await act(() => result.current.handleInviteLeadNgoToggle(ngo))

    expect(postDraftIds).toEqual(['stale-draft', null])
    expect(result.current.leadNgoInvites).toHaveLength(1)
    expect(options.setDraftCampaignId).toHaveBeenCalledWith('draft-9')
  })

  it('does not call the API when actions are disabled', async () => {
    const fetchMock = mockFetch(() => jsonResponse({}))
    const options = inviteOptions({ actionsEnabled: false })
    const { result } = renderHook(() => useLeadNgoInvites(options))

    await act(() => result.current.handleInviteLeadNgoToggle(ngo))

    expect(fetchMock).not.toHaveBeenCalled()
    expect(options.appendAssistantMessage).toHaveBeenCalledWith(expect.stringContaining('before inviting lead NGOs'))
  })

  it('resyncs when the invite was already accepted', async () => {
    mockFetch((_url, init) => {
      if (init?.method === 'POST') return jsonResponse({ success: false, error: 'Lead NGO already accepted' }, 409)
      return jsonResponse({
        success: true,
        data: {
          draftCampaignId: 'draft-9',
          leadNgoAccepted: true,
          selectedLeadNgoId: 11,
          selectedLeadNgoName: 'Green Earth',
          selectedLeadNgoEmail: 'green@example.org',
          invites: [{ ngo_id: 11, name: 'Green Earth', email: 'green@example.org', status: 'accepted' }],
        },
      })
    })
    const options = inviteOptions({ draftCampaignId: 'draft-9' })
    const { result } = renderHook(() => useLeadNgoInvites(options))

    await act(() => result.current.handleInviteLeadNgoToggle(ngo))

    await waitFor(() => expect(result.current.hasLockedLeadNgo).toBe(true))
    expect(result.current.acceptedLeadNgo).toMatchObject({ ngoId: 11, status: 'accepted' })
    expect(options.onLeadInvited).not.toHaveBeenCalled()
  })

  it('reports API errors to the assistant', async () => {
    mockFetch((_url, init) =>
      init?.method === 'POST' ? jsonResponse({ success: false, error: 'NGO is not CSR eligible' }, 400) : jsonResponse({ success: false }, 404),
    )
    const options = inviteOptions()
    const { result } = renderHook(() => useLeadNgoInvites(options))

    await act(() => result.current.handleInviteLeadNgoToggle(ngo))

    expect(options.appendAssistantMessage).toHaveBeenCalledWith('NGO is not CSR eligible')
    expect(result.current.leadNgoInvites).toEqual([])
  })
})

const companyUser: User = { id: 5, email: 'co@example.com', name: 'Acme', user_type: 'company', verification_status: 'verified' }

function rentalOptions(overrides: Partial<Parameters<typeof useCapabilityRentals>[0]> = {}) {
  return {
    user: companyUser,
    token: 'tok',
    campaignId: 'camp-1',
    ensureCampaignId: vi.fn(async () => 'camp-1'),
    actionsEnabled: true,
    leadAccepted: true,
    appendAssistantMessage: vi.fn(),
    onOfferInvited: vi.fn(),
    onPaymentVerified: vi.fn(),
    ...overrides,
  }
}

describe('useCapabilityRentals', () => {
  it('blocks payment until the lead NGO accepts', async () => {
    const fetchMock = mockFetch(() => jsonResponse({}))
    const options = rentalOptions({ leadAccepted: false })
    const { result } = renderHook(() => useCapabilityRentals(options))

    await act(() => result.current.handlePayAndReserveOffer(55, 'equipment'))

    expect(fetchMock).not.toHaveBeenCalled()
    expect(options.ensureCampaignId).not.toHaveBeenCalled()
    expect(options.appendAssistantMessage).toHaveBeenCalledWith(
      'Capability offers can be reserved once a lead NGO accepts the campaign.',
    )
    expect(result.current.paidOfferIds).toEqual([])
  })

  it('blocks payment for suspended companies', async () => {
    const fetchMock = mockFetch(() => jsonResponse({}))
    const options = rentalOptions({ user: { ...companyUser, verification_status: 'suspended' } })
    const { result } = renderHook(() => useCapabilityRentals(options))

    await act(() => result.current.handlePayAndReserveOffer(55))

    expect(fetchMock).not.toHaveBeenCalled()
    expect(options.appendAssistantMessage).toHaveBeenCalledWith(expect.stringContaining('suspended'))
  })

  it('marks the offer reserved when no payment is required', async () => {
    mockFetch(() => jsonResponse({ success: true, data: { paymentRequired: false } }))
    const options = rentalOptions()
    const { result } = renderHook(() => useCapabilityRentals(options))

    await act(() => result.current.handlePayAndReserveOffer(55))

    expect(result.current.paidOfferIds).toEqual([55])
    expect(result.current.payingOfferId).toBeNull()
    expect(options.onOfferInvited).toHaveBeenCalledWith(55)
    expect(checkout.open).not.toHaveBeenCalled()
  })

  it('verifies the Razorpay payment and stores the rental', async () => {
    const rental = { service_offer_id: 55, outbound_delivery: { tracking_id: 'AWB123' } }
    const fetchMock = mockFetch((_url, init) => {
      const body = requestBody(init)
      if (body.action === 'capability_rental_create_order') {
        return jsonResponse({ success: true, data: { paymentRequired: true, keyId: 'key', orderId: 'order_1', amount: 1500 } })
      }
      return jsonResponse({ success: true, data: { rental } })
    })
    checkout.open.mockImplementation(async (options: { onSuccess: (response: Record<string, string>) => Promise<void> }) => {
      await options.onSuccess({ razorpay_order_id: 'order_1', razorpay_payment_id: 'pay_1', razorpay_signature: 'sig' })
    })
    const options = rentalOptions()
    const { result } = renderHook(() => useCapabilityRentals(options))

    await act(() => result.current.handlePayAndReserveOffer(55, 'equipment'))

    expect(checkout.open).toHaveBeenCalledWith(expect.objectContaining({ orderId: 'order_1', amountInr: 1500 }))
    const verifyCall = fetchMock.mock.calls.find(([, init]) => requestBody(init).action === 'capability_rental_verify')
    expect(requestBody(verifyCall?.[1])).toMatchObject({ offer_id: 55, razorpay_payment_id: 'pay_1', campaign_id: 'camp-1' })
    expect(result.current.paidOfferIds).toEqual([55])
    expect(result.current.paidRentalsByOfferId[55]).toEqual(rental)
    expect(options.onPaymentVerified).toHaveBeenCalledWith(55)
    expect(options.appendAssistantMessage).toHaveBeenLastCalledWith(expect.stringContaining('AWB AWB123'))
  })

  it('reports order errors and resets paying state', async () => {
    mockFetch(() => jsonResponse({ success: false, error: 'Offer unavailable' }, 400))
    const options = rentalOptions()
    const { result } = renderHook(() => useCapabilityRentals(options))

    await act(() => result.current.handlePayAndReserveOffer(55))

    expect(options.appendAssistantMessage).toHaveBeenCalledWith('Offer unavailable')
    expect(result.current.payingOfferId).toBeNull()
    expect(result.current.paidOfferIds).toEqual([])
  })
})
