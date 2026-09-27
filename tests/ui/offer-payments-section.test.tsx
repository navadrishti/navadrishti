import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { OfferPaymentsSection } from '@/app/evidence-verification/verification-panel/offer-payments-section'
import type { PendingPaymentItem } from '@/app/evidence-verification/verification-panel/types'
import { router } from './mocks/navigation'

const items: PendingPaymentItem[] = [
  { id: 'c1', service_request_id: 101, amount_due: 100, contribution_type: 'material_supply', created_at: '2026-09-01T00:00:00Z' },
  { id: 'c2', service_request_id: 101, amount: 50, created_at: '2026-09-02T00:00:00Z' },
  { id: 'a1', attendance_date: '2026-09-03', target_type: 'campaign', target_id: 'camp-7', amount_due: 200 },
  { id: 'c3', amount_due: 30, created_at: '2026-09-04T00:00:00Z' },
]

describe('OfferPaymentsSection', () => {
  it('shows empty state', () => {
    render(<OfferPaymentsSection items={[]} actionLoadingKey={null} onPayGroup={vi.fn()} />)
    expect(screen.getByText('No pending offer/attendance payments.')).toBeInTheDocument()
  })

  it('groups payments by target with totals', () => {
    render(<OfferPaymentsSection items={items} actionLoadingKey={null} onPayGroup={vi.fn()} />)

    expect(screen.getByText('Request #101')).toBeInTheDocument()
    expect(screen.getByText('Campaign #camp-7')).toBeInTheDocument()
    expect(screen.getByText('Unlinked payments')).toBeInTheDocument()
    expect(screen.getByText('2 pending item(s)')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Pay Now • Rs 150.00' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Pay Now • Rs 200.00' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Pay Now • Rs 30.00' })).toBeInTheDocument()
    expect(screen.getByText('2026-09-03 — Attendance')).toBeInTheDocument()
  })

  it('calls onPayGroup with the group', async () => {
    const onPayGroup = vi.fn()
    render(<OfferPaymentsSection items={items} actionLoadingKey={null} onPayGroup={onPayGroup} />)

    await userEvent.click(screen.getByRole('button', { name: 'Pay Now • Rs 150.00' }))

    expect(onPayGroup).toHaveBeenCalledWith(
      expect.objectContaining({
        key: 'service_request:101',
        requestId: '101',
        items: [expect.objectContaining({ id: 'c1' }), expect.objectContaining({ id: 'c2' })],
      }),
    )
  })

  it('shows Open Request only for groups with a request id', async () => {
    render(<OfferPaymentsSection items={items} actionLoadingKey={null} onPayGroup={vi.fn()} />)

    const openButtons = screen.getAllByRole('button', { name: 'Open Request' })
    expect(openButtons).toHaveLength(1)

    await userEvent.click(openButtons[0])
    expect(router.push).toHaveBeenCalledWith('/service-requests/101')
    expect(router.push).not.toHaveBeenCalledWith('/service-requests/unknown')
  })

  it('disables all pay buttons while one group is paying', () => {
    render(<OfferPaymentsSection items={items} actionLoadingKey="ca-pay-service_request:101" onPayGroup={vi.fn()} />)

    expect(screen.getByRole('button', { name: 'Processing...' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Pay Now • Rs 200.00' })).toBeDisabled()
  })

  it('disables pay for zero totals', () => {
    render(<OfferPaymentsSection items={[{ id: 'z', service_request_id: 102, amount_due: 0 }]} actionLoadingKey={null} onPayGroup={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Pay Now • Rs 0.00' })).toBeDisabled()
  })
})
