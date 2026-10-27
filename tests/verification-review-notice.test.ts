import { describe, expect, it } from 'vitest'
import { getVerificationReviewNotice } from '@/lib/verification-review-notice'

describe('getVerificationReviewNotice', () => {
  it('hides feedback while a CA review is pending', () => {
    expect(
      getVerificationReviewNotice({
        userType: 'company',
        verificationStatus: 'pending',
        profileData: { verification_documents: { company: { rejection_reason: 'old' } } },
      })
    ).toBeNull()
  })

  it('asks an unverified user to apply again after a CA reject', () => {
    expect(
      getVerificationReviewNotice({
        userType: 'individual',
        verificationStatus: 'unverified',
        profileData: {
          verification_documents: { individual: { status: 'rejected', rejection_reason: 'PAN is blurry' } },
        },
      })
    ).toMatchObject({
      kind: 'rejected',
      title: 'Verification was not approved',
      description: expect.stringContaining('PAN is blurry'),
    })
  })

  it('asks a verified user to reapply after a reverification reject', () => {
    expect(
      getVerificationReviewNotice({
        userType: 'ngo',
        verificationStatus: 'verified',
        reverificationPending: false,
        profileData: {
          verification_documents: {
            ngo: { reverification_status: 'rejected', reverification_rejection_reason: '80G expired' },
          },
        },
      })
    ).toMatchObject({
      kind: 'reverification_rejected',
      description: expect.stringContaining('80G expired'),
    })
  })

  it('clears reverification feedback once they apply again', () => {
    expect(
      getVerificationReviewNotice({
        userType: 'company',
        verificationStatus: 'verified',
        reverificationPending: true,
        profileData: {
          reverification_pending: true,
          verification_documents: {
            company: { reverification_status: 'rejected', reverification_rejection_reason: 'GST unreadable' },
          },
        },
      })
    ).toBeNull()
  })
})
