import { describe, expect, it } from 'vitest'
import {
  getNeedListingPresentation,
  getOfferListingPresentation,
} from '@/components/service-card/listing-metrics'

describe('getNeedListingPresentation', () => {
  it('keeps funding progress meters when a financial target exists', () => {
    const { meters, stats, contextBits } = getNeedListingPresentation({
      request_type: 'Financial Need',
      category: 'Financial Need',
      target_amount: 10000,
      current_amount: 2500,
      remaining_amount: 7500,
      created_at: '2026-01-15T00:00:00.000Z',
      status: 'open',
    })

    expect(meters).toHaveLength(1)
    expect(meters[0].title).toBe('Funding progress')
    expect(meters[0].progress).toBe(25)
    expect(meters[0].detail).toMatch(/remaining/i)
    expect(stats).toHaveLength(0)
    expect(contextBits.some((bit) => bit.toLowerCase().includes('open'))).toBe(true)
  })

  it('keeps quantity fulfilment meters for material needs', () => {
    const { meters } = getNeedListingPresentation({
      request_type: 'Material Need',
      category: 'Material Need',
      target_quantity: 40,
      current_quantity: 10,
      remaining_quantity: 30,
      created_at: '2026-02-01T00:00:00.000Z',
    })

    expect(meters[0].title).toBe('Quantity fulfilment')
    expect(meters[0].progress).toBe(25)
  })

  it('keeps accepted-volunteer meters when a requirement exists', () => {
    const { meters } = getNeedListingPresentation({
      request_type: 'Skill / Service Need',
      category: 'Skill / Service Need',
      volunteers_needed: 5,
      accepted_volunteers_count: 2,
      created_at: '2026-03-01T00:00:00.000Z',
    })

    expect(meters[0].title).toBe('Accepted volunteers')
    expect(meters[0].progress).toBe(40)
  })

  it('does not invent progress when no target exists and keeps status as context text', () => {
    const { meters, stats, contextBits } = getNeedListingPresentation({
      request_type: 'Skill / Service Need',
      category: 'Skill / Service Need',
      created_at: '2026-03-01T00:00:00.000Z',
      status: 'open',
      deadline: '2026-04-01',
    })

    expect(meters).toHaveLength(0)
    expect(stats).toHaveLength(0)
    expect(contextBits.join(' ')).toMatch(/open/i)
    expect(contextBits.join(' ')).toMatch(/Due/i)
  })

  it('shows untargeted budget as a compact statistic, not a progress meter', () => {
    const { meters, stats } = getNeedListingPresentation({
      request_type: 'Financial Need',
      category: 'Financial Need',
      estimated_budget: 'Rs 50,000',
      created_at: '2026-01-15T00:00:00.000Z',
    })

    expect(meters).toHaveLength(0)
    expect(stats[0]?.label).toBe('Budget')
  })
})

describe('getOfferListingPresentation', () => {
  it('shows applications and capacity as statistics without progress meters', () => {
    const { meters, stats } = getOfferListingPresentation({
      quantity: 12,
      item: 'laptops',
      applications_count: 4,
      pending_applications: 1,
      created_at: '2026-04-01T00:00:00.000Z',
    })

    expect(meters).toHaveLength(0)
    expect(stats.find((stat) => stat.label === 'Offered quantity')?.value).toBe('12 laptops')
    expect(stats.find((stat) => stat.label === 'Applications')?.value).toMatch(/4 received/)
    expect(stats.find((stat) => stat.label === 'Applications')?.detail).toBeUndefined()
  })

  it('skips application stats when count is unavailable', () => {
    const { stats } = getOfferListingPresentation({
      capacity: 3,
      created_at: '2026-04-01T00:00:00.000Z',
    })

    expect(stats.some((stat) => stat.label === 'Applications')).toBe(false)
    expect(stats.some((stat) => stat.label === 'Offered capacity')).toBe(true)
  })
})
