import { describe, expect, it, vi } from 'vitest'
import { buildServiceOfferEmbeddingText } from '@/lib/embeddings'

vi.mock('@/lib/db', () => ({ supabase: {}, db: {} }))

describe('buildServiceOfferEmbeddingText', () => {
  it('joins the searchable offer fields and skips empty ones', () => {
    const text = buildServiceOfferEmbeddingText({
      title: 'School desks',
      description: '  Wooden desks for primary schools ',
      offer_type: 'material',
      impact_area: ['Education'],
      tags: ['furniture', ''],
      requirements: null,
      city: 'Pune',
      state_province: 'Maharashtra',
      offer_details: { item: 'Desk', quantity: 40, notes: '' },
    })

    expect(text).toBe(
      ['School desks', 'Wooden desks for primary schools', 'Type: material', 'Education', 'furniture', 'Desk', 'Pune, Maharashtra'].join('\n')
    )
  })

  it('returns an empty string when there is nothing to embed', () => {
    expect(buildServiceOfferEmbeddingText({})).toBe('')
  })
})
