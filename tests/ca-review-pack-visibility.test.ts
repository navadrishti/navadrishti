import { describe, expect, it } from 'vitest'
import {
  effectiveCaQueueStatus,
  hasLiveVerificationPack,
  sanitizeCaReviewItem,
} from '@/lib/ca-review/pack-visibility'

describe('effectiveCaQueueStatus', () => {
  it('lets an admin unverified override win over a pending type row', () => {
    expect(effectiveCaQueueStatus('pending', 'unverified')).toBe('unverified')
    expect(effectiveCaQueueStatus('verified', 'suspended')).toBe('suspended')
  })

  it('falls back to the type row when the user is not downgraded', () => {
    expect(effectiveCaQueueStatus('pending', 'verified')).toBe('pending')
    expect(effectiveCaQueueStatus(null, 'pending')).toBe('pending')
  })
})

describe('sanitizeCaReviewItem', () => {
  it('keeps a live pending pack intact', () => {
    const item = sanitizeCaReviewItem({
      verification_status: 'pending',
      pan: 'ABCDE1234F',
      documents_total: 3,
      documents: [{ id: '1' }],
    })
    expect(item).toMatchObject({ verification_status: 'pending', pan: 'ABCDE1234F', documents_total: 3 })
  })

  it('strips leftover KYC and files from unverified accounts', () => {
    const item = sanitizeCaReviewItem({
      verification_status: 'unverified',
      name: 'Shubhendu Chakrabarti',
      email: 'chakshubh7@gmail.com',
      phone: '+9118527534463',
      pan: 'PQRSTUB212',
      aadhaar: '123456789012',
      documents_total: 3,
      documents: [{ id: 'pan' }, { id: 'aadhaar' }, { id: 'bank' }],
      field_comparisons: [{ field: 'PAN Number' }],
      ca_badge_number: 'ND-CA-1',
      reverification_pending: true,
      allotted_compliance_tags: ['csr1'],
    })
    expect(item).toMatchObject({
      verification_status: 'unverified',
      name: 'Shubhendu Chakrabarti',
      email: 'chakshubh7@gmail.com',
      phone: '+9118527534463',
      pan: '',
      aadhaar: '',
      documents_total: 0,
      documents: [],
      field_comparisons: [],
      ca_badge_number: null,
      reverification_pending: false,
      allotted_compliance_tags: [],
    })
  })

  it('only treats pending and verified as a live pack', () => {
    expect(hasLiveVerificationPack('pending')).toBe(true)
    expect(hasLiveVerificationPack('verified')).toBe(true)
    expect(hasLiveVerificationPack('unverified')).toBe(false)
    expect(hasLiveVerificationPack('rejected')).toBe(false)
  })
})
