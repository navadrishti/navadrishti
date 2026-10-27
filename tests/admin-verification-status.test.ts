import { describe, expect, it, vi } from 'vitest'
import {
  applyAdminVerificationToProfile,
  promoteStagedReverification,
} from '@/lib/admin-verification-status'

vi.mock('server-only', () => ({}))
vi.mock('@/lib/db', () => ({ supabase: { from: vi.fn() }, db: {} }))

describe('applyAdminVerificationToProfile', () => {
  it('strips submitted documents on unverify and keeps CA history', () => {
    const next = applyAdminVerificationToProfile(
      {
        ca_badge_number: 'ND-CA-1',
        ca_review_history: [{ ca_id: 3, action: 'approve' }],
        verification_documents: {
          individual: {
            documents: { individualPanCard: 'https://cdn.example.com/pan.pdf' },
            entered_fields: { pan: 'ABCDE1234F' },
          },
        },
      },
      'individual',
      'unverified'
    )
    expect(next.ca_badge_number).toBeUndefined()
    expect(next.ca_review_history).toEqual([{ ca_id: 3, action: 'approve' }])
    expect(next.verification_documents.individual).toEqual({
      documents: {},
      entered_fields: {},
      status: 'unverified',
    })
  })

  it('keeps live documents on pending when there is no later pack', () => {
    const next = applyAdminVerificationToProfile(
      {
        ca_badge_number: 'ND-CA-1',
        verification_documents: {
          company: { documents: { companyPanCard: 'https://cdn.example.com/pan.pdf' } },
        },
      },
      'company',
      'pending'
    )
    expect(next.ca_badge_number).toBeUndefined()
    expect(next.verification_documents.company.documents.companyPanCard).toBe(
      'https://cdn.example.com/pan.pdf'
    )
  })
})

describe('promoteStagedReverification', () => {
  it('makes a later reverification pack the live pending documents', () => {
    const next = promoteStagedReverification(
      {
        reverification_pending: true,
        verification_documents: {
          ngo: {
            documents: { ngoPanCard: 'https://cdn.example.com/old.pdf' },
            reverification_documents: { ngoPanCard: 'https://cdn.example.com/new.pdf' },
            reverification_entered_fields: { pan: 'NEWPAN' },
          },
        },
      },
      'ngo'
    )
    expect(next.reverification_pending).toBeUndefined()
    expect(next.verification_documents.ngo.documents.ngoPanCard).toBe('https://cdn.example.com/new.pdf')
    expect(next.verification_documents.ngo.entered_fields.pan).toBe('NEWPAN')
    expect(next.verification_documents.ngo).not.toHaveProperty('reverification_documents')
  })
})
