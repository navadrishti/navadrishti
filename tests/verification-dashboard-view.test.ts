import { describe, expect, it } from 'vitest'
import { getVerificationDashboardView } from '@/lib/verification-dashboard-view'

describe('getVerificationDashboardView', () => {
  it('hides the first-time form while a CA is reviewing', () => {
    expect(
      getVerificationDashboardView({
        verificationStatus: 'pending',
        justSubmitted: true,
      })
    ).toBe('submitted_review')
    expect(getVerificationDashboardView({ verificationStatus: 'pending' })).toBe('submitted_review')
  })

  it('hides the reverify form the same way while a CA is reviewing', () => {
    expect(
      getVerificationDashboardView({
        verificationStatus: 'verified',
        justSubmitted: true,
        reverificationPending: true,
      })
    ).toBe('submitted_review')
    expect(
      getVerificationDashboardView({
        verificationStatus: 'verified',
        reverificationPending: true,
      })
    ).toBe('submitted_review')
  })

  it('keeps the verified summary so they can still apply for reverification', () => {
    expect(getVerificationDashboardView({ verificationStatus: 'verified' })).toBe('verified_summary')
  })

  it('opens the form when a verified user applies for reverification', () => {
    expect(
      getVerificationDashboardView({
        reverifyMode: true,
        verificationStatus: 'verified',
        justSubmitted: false,
      })
    ).toBe('form')
  })

  it('still shows the reverify form even if a leftover success flag is set', () => {
    expect(
      getVerificationDashboardView({
        reverifyMode: true,
        verificationStatus: 'verified',
        justSubmitted: true,
        reverificationPending: true,
      })
    ).toBe('form')
  })

  it('returns the form after a first-time reject so they can apply again', () => {
    expect(
      getVerificationDashboardView({
        verificationStatus: 'unverified',
        justSubmitted: false,
      })
    ).toBe('form')
  })
})
