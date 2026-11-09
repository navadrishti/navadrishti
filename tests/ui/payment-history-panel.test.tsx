import { render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PaymentHistoryPanel } from '@/components/payment-history-panel'

const auth = vi.hoisted(() => ({
  token: null as string | null,
  loading: true,
  user: null as { id: number; user_type: string } | null,
}))

vi.mock('@/lib/auth-context', () => ({
  useAuth: () => ({
    token: auth.token,
    loading: auth.loading,
    user: auth.user,
  }),
}))

describe('PaymentHistoryPanel', () => {
  beforeEach(() => {
    auth.token = null
    auth.loading = true
    auth.user = null
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          success: true,
          data: [
            {
              id: 'pay-1',
              razorpay_payment_id: 'pay_test_1',
              amount_inr: 1000,
              payment_status: 'captured',
              paid_at: '2026-11-06T10:00:00.000Z',
              service_request_title: 'CSR milestone payment',
              source: 'csr_milestone',
              source_label: 'CSR milestone',
              counterparty_name: 'E2E Synthetic NGO Trust',
            },
          ],
          fines: [],
        }),
      }))
    )
  })

  it('waits for auth hydration instead of rendering a false empty ledger', async () => {
    const { rerender } = render(
      <PaymentHistoryPanel
        role="sent"
        title="Payment history"
        description="All online payments"
        emptyMessage="No online payments recorded yet for your company account."
      />
    )

    expect(screen.queryByText(/No online payments recorded yet/i)).not.toBeInTheDocument()
    expect(fetch).not.toHaveBeenCalled()

    auth.loading = false
    auth.token = 'session-token'
    auth.user = { id: 1, user_type: 'company' }
    rerender(
      <PaymentHistoryPanel
        role="sent"
        title="Payment history"
        description="All online payments"
        emptyMessage="No online payments recorded yet for your company account."
      />
    )

    await waitFor(() => {
      expect(fetch).toHaveBeenCalled()
    })

    const [url, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(String(url)).toContain('/api/users?view=payment-history&role=sent')
    expect(init?.credentials).toBe('include')
    expect(init?.headers?.Authorization).toBe('Bearer session-token')

    expect(await screen.findByText('CSR milestone payment')).toBeInTheDocument()
    expect(screen.queryByText(/No online payments recorded yet/i)).not.toBeInTheDocument()
  })

  it('still loads via cookie credentials when memory token is absent after hydration', async () => {
    auth.loading = false
    auth.token = null
    auth.user = { id: 1, user_type: 'company' }

    render(
      <PaymentHistoryPanel
        role="sent"
        title="Payment history"
        description="All online payments"
        emptyMessage="No online payments recorded yet for your company account."
      />
    )

    await waitFor(() => {
      expect(fetch).toHaveBeenCalled()
    })

    const [, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(init?.credentials).toBe('include')
    expect(init?.headers?.Authorization).toBeUndefined()
    expect(await screen.findByText('CSR milestone payment')).toBeInTheDocument()
  })
})
