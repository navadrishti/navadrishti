import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { YourCapabilitiesPanel } from '@/components/service-card/your-capabilities-panel'
import type { CapabilityOfferSummary } from '@/lib/service-offers/types'

vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
}))

vi.mock('@/lib/client-session', () => ({
  getClientSessionToken: () => 'test-token',
}))

function offer(overrides: Partial<CapabilityOfferSummary> = {}): CapabilityOfferSummary {
  return {
    id: 7,
    title: 'Solar kits',
    status: 'active',
    admin_status: 'approved',
    is_listed: true,
    valid_until: '2099-12-31',
    offer_type: 'material',
    transaction_type: 'donate',
    ...overrides,
  }
}

describe('YourCapabilitiesPanel — no listing toggles', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('does not expose Hide from discovery or Re-list offer controls', () => {
    render(<YourCapabilitiesPanel offers={[offer()]} />)
    expect(screen.queryByRole('button', { name: 'Hide from discovery' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Re-list offer' })).not.toBeInTheDocument()
  })

  it('does not expose listing controls for historically unlisted rows', () => {
    render(<YourCapabilitiesPanel offers={[offer({ is_listed: false })]} />)
    expect(screen.queryByRole('button', { name: 'Hide from discovery' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Re-list offer' })).not.toBeInTheDocument()
  })
})
