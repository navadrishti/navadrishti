import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { OfferRequestsPanel } from '@/app/ngos/dashboard/offer-requests-panel'
import type { OfferRequestItem } from '@/lib/offer-requests'

vi.mock('@/components/offer-engagement-overview', () => ({
  OfferEngagementOverview: () => <div data-testid="offer-engagement-overview" />,
}))

function request(overrides: Partial<OfferRequestItem> = {}): OfferRequestItem {
  return {
    id: 1,
    service_offer_id: 7,
    offer_title: 'Teaching volunteers',
    status: 'accepted',
    isAssigned: true,
    client: { name: 'Requester NGO', email: 'ngo@example.org', user_type: 'ngo' },
    ...overrides,
  }
}

describe('OfferRequestsPanel fulfilment complete', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('shows Mark Fulfilment Complete for an accepted in-progress request', () => {
    render(
      <OfferRequestsPanel
        offerRequests={[request({ status: 'accepted' })]}
        loading={false}
        tab="in-progress"
        onTabChange={vi.fn()}
        updatingRequestId={null}
        onStatusUpdate={vi.fn()}
        onRequestsUpdated={vi.fn()}
      />
    )

    expect(screen.getByRole('button', { name: /Mark Fulfilment Complete/i })).toBeInTheDocument()
    expect(screen.getByText('Accepted')).toBeInTheDocument()
  })

  it('does not show complete on pending cards; accept/reject remain', () => {
    render(
      <OfferRequestsPanel
        offerRequests={[request({ id: 2, status: 'pending', isAssigned: false })]}
        loading={false}
        tab="pending"
        onTabChange={vi.fn()}
        updatingRequestId={null}
        onStatusUpdate={vi.fn()}
        onRequestsUpdated={vi.fn()}
      />
    )

    expect(screen.queryByRole('button', { name: /Mark Fulfilment Complete/i })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Accept/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Reject/i })).toBeInTheDocument()
  })

  it('does not show complete for rejected or completed history rows', () => {
    render(
      <OfferRequestsPanel
        offerRequests={[
          request({ id: 3, status: 'rejected', isAssigned: false }),
          request({ id: 4, status: 'completed', isAssigned: true }),
        ]}
        loading={false}
        tab="history"
        onTabChange={vi.fn()}
        updatingRequestId={null}
        onStatusUpdate={vi.fn()}
        onRequestsUpdated={vi.fn()}
      />
    )

    expect(screen.queryByRole('button', { name: /Mark Fulfilment Complete/i })).not.toBeInTheDocument()
    expect(screen.getByText('Rejected')).toBeInTheDocument()
    expect(screen.getByText('Completed')).toBeInTheDocument()
  })

  it('confirms then calls onStatusUpdate with completed', async () => {
    const onStatusUpdate = vi.fn()
    vi.spyOn(window, 'confirm').mockReturnValue(true)

    render(
      <OfferRequestsPanel
        offerRequests={[request({ id: 11, status: 'accepted' })]}
        loading={false}
        tab="in-progress"
        onTabChange={vi.fn()}
        updatingRequestId={null}
        onStatusUpdate={onStatusUpdate}
        onRequestsUpdated={vi.fn()}
      />
    )

    await userEvent.click(screen.getByRole('button', { name: /Mark Fulfilment Complete/i }))
    expect(onStatusUpdate).toHaveBeenCalledWith(11, 'completed')
  })

  it('keeps accept available while a different request is updating', async () => {
    const onStatusUpdate = vi.fn()

    render(
      <OfferRequestsPanel
        offerRequests={[request({ id: 5, status: 'pending', isAssigned: false })]}
        loading={false}
        tab="pending"
        onTabChange={vi.fn()}
        updatingRequestId={99}
        onStatusUpdate={onStatusUpdate}
        onRequestsUpdated={vi.fn()}
      />
    )

    await userEvent.click(screen.getByRole('button', { name: /Accept/i }))
    expect(onStatusUpdate).toHaveBeenCalledWith(5, 'accepted')
  })
})
