"use client"

import Link from 'next/link'
import type { Dispatch, SetStateAction } from 'react'
import type { User } from '@/lib/auth-context'
import type { useOtpSender } from '@/hooks/use-otp-sender'
import { formatDisplayDate } from '@/lib/format-date'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NgoComplianceBadges, VerificationBadge } from '@/components/verification-badge'
import { PHONE_VERIFICATION_ENABLED, type summarizeDocumentExpiries } from '@/lib/auth'
import type { FormErrors } from './types'

type OtpInput = { email: string; phone: string }

interface VerificationStatusCardProps {
  user: User
  phone: string
  editableEmail: string
  emailChanged: boolean
  resolvedPhoneVerified: boolean
  resolvedEmailVerified: boolean
  resolvedVerificationStatus: string
  caBadgeNumber: string | null
  documentExpirySummary: ReturnType<typeof summarizeDocumentExpiries> | null
  showDocumentExpiryBanner: boolean
  reverificationPending: boolean
  otp: ReturnType<typeof useOtpSender>
  otpInput: OtpInput
  setOtpInput: Dispatch<SetStateAction<OtpInput>>
  formErrors: FormErrors
  onVerifyPhoneOtp: () => void | Promise<void>
  onVerifyEmailOtp: () => void | Promise<void>
}

export function VerificationStatusCard({
  user,
  phone,
  editableEmail,
  emailChanged,
  resolvedPhoneVerified,
  resolvedEmailVerified,
  resolvedVerificationStatus,
  caBadgeNumber,
  documentExpirySummary,
  showDocumentExpiryBanner,
  reverificationPending,
  otp,
  otpInput,
  setOtpInput,
  formErrors,
  onVerifyPhoneOtp,
  onVerifyEmailOtp,
}: VerificationStatusCardProps) {
  const { otpSending, otpSent, otpCooldown, otpVerifying, handleSendEmailOtp, handleSendPhoneOtp } = otp

  return (
    <Card>
      <CardHeader>
        <CardTitle>Verification Status</CardTitle>
        <CardDescription>Track verification and open the verification workflow.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-4">
          {PHONE_VERIFICATION_ENABLED ? (
          <div className="rounded-lg border p-4 space-y-3">
            <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
              <span className="shrink-0 text-sm font-medium">Mobile Number Verification</span>
              <VerificationBadge
                status={resolvedPhoneVerified ? 'verified' : 'unverified'}
                size="readable"
                showText={true}
                className="max-w-full min-w-0"
              />
            </div>
            <p className="text-xs text-muted-foreground">{(phone || user?.phone) ? `Phone: ${phone || user?.phone}` : 'Add a phone number in your profile settings.'}</p>
            {!resolvedPhoneVerified && (
              <div className="space-y-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-full max-w-full whitespace-normal break-words"
                  onClick={() => handleSendPhoneOtp(phone || user?.phone || '')}
                  disabled={otpSending.phone || otpCooldown.phone > 0}
                >
                  {otpSending.phone
                    ? 'Sending...'
                    : otpCooldown.phone > 0
                      ? `Resend in ${otpCooldown.phone}s`
                      : otpSent.phone
                        ? 'Resend OTP'
                        : 'Verify Mobile'}
                </Button>
                {formErrors.phone && <p className="text-sm text-red-500">{formErrors.phone}</p>}
                {otpSent.phone && (
                  <div className="space-y-2">
                    <Label htmlFor="profilePhoneOtp">Phone OTP</Label>
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <Input
                        id="profilePhoneOtp"
                        value={otpInput.phone}
                        onChange={(e) => setOtpInput((prev) => ({ ...prev, phone: e.target.value }))}
                        placeholder="Enter OTP"
                        className="min-w-0"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        className="w-full max-w-full whitespace-normal break-words sm:w-auto"
                        onClick={onVerifyPhoneOtp}
                        disabled={otpVerifying.phone}
                      >
                        {otpVerifying.phone ? 'Verifying...' : 'Verify OTP'}
                      </Button>
                    </div>
                    {formErrors.phoneOtp && <p className="text-sm text-red-500">{formErrors.phoneOtp}</p>}
                  </div>
                )}
              </div>
            )}
          </div>
          ) : null}

          <div className="rounded-lg border p-4 space-y-3">
            <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
              <span className="shrink-0 text-sm font-medium">Email Verification</span>
              <VerificationBadge
                status={resolvedEmailVerified ? 'verified' : 'unverified'}
                size="readable"
                showText={true}
                className="max-w-full min-w-0"
              />
            </div>
            <p className="text-xs text-muted-foreground">Email: {editableEmail || user?.email || 'No email found'}</p>
            {emailChanged && !resolvedEmailVerified && (
              <>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-full max-w-full whitespace-normal break-words"
                  onClick={() => handleSendEmailOtp(editableEmail || user?.email || '')}
                  disabled={otpSending.email || otpCooldown.email > 0}
                >
                  {otpSending.email ? 'Sending...' : otpCooldown.email > 0 ? `Resend in ${otpCooldown.email}s` : otpSent.email ? 'Resend OTP' : 'Verify Email'}
                </Button>
                {otpSent.email && (
                  <div className="space-y-2">
                    <Label htmlFor="profileEmailOtp">Email OTP</Label>
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <Input
                        id="profileEmailOtp"
                        value={otpInput.email}
                        onChange={(e) => setOtpInput((prev) => ({ ...prev, email: e.target.value }))}
                        placeholder="Enter OTP"
                        className="min-w-0"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        className="w-full max-w-full whitespace-normal break-words sm:w-auto"
                        onClick={onVerifyEmailOtp}
                        disabled={otpVerifying.email}
                      >
                        {otpVerifying.email ? 'Verifying...' : 'Verify OTP'}
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          <div className="rounded-lg border p-4 space-y-4 overflow-hidden">
            <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
              <span className="shrink-0 text-sm font-medium">Document Verification</span>
              <VerificationBadge
                status={resolvedVerificationStatus}
                size="readable"
                showText={true}
                badgeNumber={caBadgeNumber}
                className="max-w-full min-w-0"
              />
            </div>
            {user?.user_type === 'ngo' ? (
              <NgoComplianceBadges
                tags={user.ca_compliance_tags}
                registrationType={
                  (user.profile_data as { registration_type?: string } | undefined)?.registration_type ||
                  (user.verification_details as { registration_type?: string } | undefined)?.registration_type ||
                  null
                }
                size="lg"
                className="max-w-full"
              />
            ) : null}
            <p className="text-xs leading-5 text-muted-foreground">
              {resolvedVerificationStatus === 'verified'
                ? 'Your documents are CA-verified. Submit updated documents anytime from the verification dashboard.'
                : 'Complete identity verification from the verification dashboard.'}
            </p>
            {showDocumentExpiryBanner && documentExpirySummary ? (
              <div className="rounded-md border bg-background px-3 py-2 text-xs leading-5">
                {documentExpirySummary.has_expired ? (
                  <p>
                    One or more certificates have expired
                    {documentExpirySummary.soonest
                      ? ` (${documentExpirySummary.soonest.label} on ${formatDisplayDate(
                          documentExpirySummary.soonest.valid_until
                        )})`
                      : ''}
                    . The matching CA tag has been dropped. Reverify with an updated certificate to restore it. You stay verified.
                  </p>
                ) : (
                  <p>
                    Certificates expire soon
                    {documentExpirySummary.soonest
                      ? ` — ${documentExpirySummary.soonest.label} on ${formatDisplayDate(
                          documentExpirySummary.soonest.valid_until
                        )} (${Math.max(documentExpirySummary.soonest.days_remaining, 0)} days left)`
                      : ''}
                    . Reverify before they lapse to keep the matching CA tag.
                  </p>
                )}
              </div>
            ) : null}
            {reverificationPending && (
              <p className="text-xs leading-5 text-muted-foreground">
                Reverification is under review. You remain verified while we process your updated documents.
              </p>
            )}
            {resolvedVerificationStatus !== 'verified' ? (
              <Link href={`/verification?userType=${user?.user_type}`} className="block">
                <Button
                  type="button"
                  variant="default"
                  size="sm"
                  className="h-auto w-full max-w-full whitespace-normal break-words px-3 py-2 leading-snug"
                >
                  Open Verification Dashboard
                </Button>
              </Link>
            ) : (
              <Link href={`/verification?userType=${user?.user_type}`} className="block">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={reverificationPending}
                  className="h-auto w-full max-w-full whitespace-normal break-words border-udaan-orange px-3 py-2 leading-snug text-udaan-orange hover:bg-orange-50"
                >
                  {reverificationPending
                    ? 'Reverification pending'
                    : showDocumentExpiryBanner
                      ? 'Update expiring documents'
                      : 'Reverify documents'}
                </Button>
              </Link>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
