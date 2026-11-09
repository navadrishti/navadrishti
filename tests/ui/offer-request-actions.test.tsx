import { act, renderHook, waitFor } from '@testing-library/react'
import type { SetStateAction } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { OfferRequestItem } from '@/lib/offer-requests'
import { jsonResponse, mockFetch } from './helpers'

const toast = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
}))

vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), toast),
}))

vi.mock('@/lib/client-session', () => ({
  getClientSessionToken: () => 'test-token',
}))

import { useOfferRequestActions } from '@/app/individuals/dashboard/use-offer-request-actions'

function baseRequest(overrides: Partial<OfferRequestItem> = {}): OfferRequestItem {
  return {
    id: 15,
    service_offer_id: 3,
    offer_title: 'Teaching volunteers',
    status: 'accepted',
    isAssigned: true,
    ...overrides,
  }
}

describe('useOfferRequestActions completion', () => {
  beforeEach(() => {
    toast.success.mockReset()
    toast.error.mockReset()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('marks fulfilment completed and updates local status', async () => {
    mockFetch(() =>
      jsonResponse({
        success: true,
        data: { id: 15, service_offer_id: 3, status: 'completed', isAssigned: true },
      })
    )

    let requests = [baseRequest()]
    const setOfferRequests = vi.fn((value: SetStateAction<OfferRequestItem[]>) => {
      requests = typeof value === 'function' ? value(requests) : value
    })

    const { result } = renderHook(() => useOfferRequestActions(setOfferRequests))

    await act(async () => {
      await result.current.handleOfferRequestStatusUpdate(15, 'completed')
    })

    await waitFor(() => {
      expect(requests[0]).toMatchObject({ status: 'completed', isAssigned: true })
    })
    expect(toast.success).toHaveBeenCalledWith('Success', {
      description: 'Offer fulfilment marked as completed',
    })
  })

  it('surfaces payment-required conflicts without changing status', async () => {
    mockFetch(() =>
      jsonResponse({ error: 'The client has not paid for this offer yet.' }, 409)
    )

    let requests = [baseRequest()]
    const setOfferRequests = vi.fn((value: SetStateAction<OfferRequestItem[]>) => {
      requests = typeof value === 'function' ? value(requests) : value
    })

    const { result } = renderHook(() => useOfferRequestActions(setOfferRequests))

    await act(async () => {
      await result.current.handleOfferRequestStatusUpdate(15, 'completed')
    })

    expect(setOfferRequests).not.toHaveBeenCalled()
    expect(requests[0].status).toBe('accepted')
    expect(toast.error).toHaveBeenCalledWith('Error', {
      description: 'The client has not paid for this offer yet.',
    })
  })

  it('surfaces authorization and conflict errors', async () => {
    mockFetch(() => jsonResponse({ error: 'Only the offer owner can update this request.' }, 403))

    const setOfferRequests = vi.fn()
    const { result } = renderHook(() => useOfferRequestActions(setOfferRequests))

    await act(async () => {
      await result.current.handleOfferRequestStatusUpdate(15, 'completed')
    })

    expect(setOfferRequests).not.toHaveBeenCalled()
    expect(toast.error).toHaveBeenCalledWith('Error', {
      description: 'Only the offer owner can update this request.',
    })
  })

  it('ignores duplicate submissions while a request is updating', async () => {
    let resolveFetch: ((value: Response) => void) | null = null
    mockFetch(
      () =>
        new Promise<Response>((resolve) => {
          resolveFetch = resolve
        })
    )

    const setOfferRequests = vi.fn()
    const { result } = renderHook(() => useOfferRequestActions(setOfferRequests))

    let first: Promise<void>
    act(() => {
      first = result.current.handleOfferRequestStatusUpdate(15, 'completed')
    })

    await waitFor(() => {
      expect(result.current.updatingOfferRequestId).toBe(15)
    })

    await act(async () => {
      await result.current.handleOfferRequestStatusUpdate(15, 'completed')
    })

    expect(setOfferRequests).not.toHaveBeenCalled()

    await act(async () => {
      resolveFetch?.(
        jsonResponse({
          success: true,
          data: { id: 15, service_offer_id: 3, status: 'completed', isAssigned: true },
        })
      )
      await first!
    })
  })

  it('rejects concurrent updates after the first finishes', async () => {
    mockFetch(() =>
      jsonResponse({
        success: true,
        data: { id: 15, service_offer_id: 3, status: 'completed', isAssigned: true },
      })
    )

    const setOfferRequests = vi.fn()
    const { result } = renderHook(() => useOfferRequestActions(setOfferRequests))

    await act(async () => {
      await result.current.handleOfferRequestStatusUpdate(15, 'completed')
    })

    expect(toast.success).toHaveBeenCalled()
  })
})
