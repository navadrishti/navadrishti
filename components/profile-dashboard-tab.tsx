"use client"

import { useEffect, useEffectEvent, useState } from 'react'
import { useIsClient } from '@/hooks/use-is-client'
import { toast } from 'sonner'
import { useAuth } from '@/lib/auth-context'
import { useOtpSender } from '@/hooks/use-otp-sender'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { shouldShowPayoutAccountPanel } from '@/lib/access-control'
import {
  PHONE_VERIFICATION_ENABLED,
  getCoverImageUrl,
  summarizeDocumentExpiries,
  visibleCaBadgeNumber,
} from '@/lib/auth'
import { PayoutAccountPanel } from '@/components/payout-account-panel'
import { useProfileDetails } from './profile-dashboard-tab/use-profile-details'
import { useProfileImages } from './profile-dashboard-tab/use-profile-images'
import { ProfileMediaEditor } from './profile-dashboard-tab/profile-media-editor'
import { HeadquartersFields, IndividualLocationFields } from './profile-dashboard-tab/location-fields'
import { CompanyProfileFields } from './profile-dashboard-tab/company-profile-fields'
import { NgoProfileFields } from './profile-dashboard-tab/ngo-profile-fields'
import { VerificationStatusCard } from './profile-dashboard-tab/verification-status-card'
import type { FetchedProfileUser, FormErrors } from './profile-dashboard-tab/types'

const normalizeEmail = (value: string) => value.trim().toLowerCase()
const normalizePhone = (value: string) => value.trim().replace(/\s+/g, '')

export function ProfileDashboardTab() {
  const { user, updateUser, refreshUser } = useAuth()
  const mounted = useIsClient()
  const [loading, setLoading] = useState(true)
  const images = useProfileImages(refreshUser)
  const details = useProfileDetails()
  const [editableName, setEditableName] = useState('')
  const [editableEmail, setEditableEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [formErrors, setFormErrors] = useState<FormErrors>({})
  const [otpInput, setOtpInput] = useState({ email: '', phone: '' })
  const [profileVerificationStatus, setProfileVerificationStatus] = useState<'verified' | 'unverified' | 'pending'>('unverified')
  const [reverificationPending, setReverificationPending] = useState(false)
  const [verifiedEmailValue, setVerifiedEmailValue] = useState('')
  const [verifiedPhoneValue, setVerifiedPhoneValue] = useState('')
  const [savedEmail, setSavedEmail] = useState('')
  const [savedPhone, setSavedPhone] = useState('')
  const otp = useOtpSender(setFormErrors)
  const { otpVerified, handleVerifyEmailOtp, handleVerifyPhoneOtp, resetEmailOtpState, resetPhoneOtpState } = otp

  const currentEmail = normalizeEmail(editableEmail)
  const currentPhone = normalizePhone(phone)
  const originalEmail = normalizeEmail(savedEmail)
  const originalPhone = normalizePhone(savedPhone)
  const emailChanged = currentEmail !== originalEmail
  const phoneChanged = currentPhone !== originalPhone

  const emailVerifiedForCurrentValue = !emailChanged || (otpVerified.email && verifiedEmailValue === currentEmail)
  const phoneVerifiedForCurrentValue = PHONE_VERIFICATION_ENABLED
    ? !phoneChanged || (otpVerified.phone && verifiedPhoneValue === currentPhone)
    : true
  const canSaveProfile = emailVerifiedForCurrentValue && phoneVerifiedForCurrentValue

  const resolvedEmailVerified = !emailChanged ? !!user?.email_verified : emailVerifiedForCurrentValue
  const resolvedPhoneVerified = !phoneChanged ? !!user?.phone_verified : phoneVerifiedForCurrentValue
  const resolvedVerificationStatus = profileVerificationStatus || user?.verification_status || 'unverified'
  const caBadgeNumber = visibleCaBadgeNumber(
    resolvedVerificationStatus,
    user?.profile_data || user?.profile
  ) || (resolvedVerificationStatus === 'verified' ? user?.ca_badge_number || null : null)
  const documentExpirySummary =
    user?.user_type === 'ngo' ? summarizeDocumentExpiries(user.profile_data) : null
  const showDocumentExpiryBanner = Boolean(
    documentExpirySummary &&
      (documentExpirySummary.has_expired ||
        (resolvedVerificationStatus === 'verified' && documentExpirySummary.has_due_soon))
  )

  const fetchProfile = async () => {
    try {
      setLoading(true)
      const token = localStorage.getItem('token')
      if (!token || !user?.id) return

      const response = await fetch('/api/auth/me', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })

      if (!response.ok) {
        throw new Error('Failed to fetch profile data')
      }

      const data = await response.json()
      const freshUser: FetchedProfileUser | undefined = data.user

      setEditableName(freshUser?.name || '')
      setEditableEmail(freshUser?.email || '')
      setPhone(freshUser?.phone || '')
      setSavedEmail(freshUser?.email || '')
      setSavedPhone(freshUser?.phone || '')
      setVerifiedEmailValue(freshUser?.email_verified ? normalizeEmail(freshUser?.email || '') : '')
      setVerifiedPhoneValue(freshUser?.phone_verified ? normalizePhone(freshUser?.phone || '') : '')
      details.applyFetchedProfile(freshUser)
      images.setProfileImageUrl(freshUser?.profile_image || '')
      images.setCoverImageUrl(getCoverImageUrl(freshUser?.cover_image || freshUser?.profile_data || {}))
    } catch (error) {
      console.error('Error fetching profile:', error)
    } finally {
      setLoading(false)
    }
  }

  const fetchVerificationStatus = async () => {
    try {
      const token = localStorage.getItem('token')
      if (!token || !user?.user_type) return

      const response = await fetch(`/api/verification/${user.user_type}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })

      if (!response.ok) return

      const data = await response.json()
      setProfileVerificationStatus(data?.verification_status || data?.status || 'unverified')
      setReverificationPending(Boolean(data?.reverification_pending))
    } catch (error) {
      console.error('Error fetching verification status:', error)
    }
  }

  const loadProfile = useEffectEvent(() => {
    if (!user) return
    void fetchProfile()
    void fetchVerificationStatus()
  })

  useEffect(() => {
    if (mounted) loadProfile()
  }, [mounted, user?.id])

  useEffect(() => {
    if (normalizeEmail(editableEmail) === originalEmail) {
      return
    }

    resetEmailOtpState()
    setOtpInput((prev) => ({ ...prev, email: '' }))
    setVerifiedEmailValue('')
  }, [editableEmail, originalEmail, resetEmailOtpState])

  useEffect(() => {
    if (normalizePhone(phone) === originalPhone) {
      return
    }

    resetPhoneOtpState()
    setOtpInput((prev) => ({ ...prev, phone: '' }))
    setVerifiedPhoneValue('')
  }, [phone, originalPhone, resetPhoneOtpState])

  const handleSaveProfile = async () => {
    try {
      if (!user?.id) {
        throw new Error('User not authenticated')
      }

      if (emailChanged && !emailVerifiedForCurrentValue) {
        setFormErrors((prev) => ({ ...prev, emailOtp: 'Please send and verify the email OTP before saving.' }))
        toast.error('Please verify the new email before saving.')
        return
      }

      if (PHONE_VERIFICATION_ENABLED && phoneChanged && !phoneVerifiedForCurrentValue) {
        setFormErrors((prev) => ({ ...prev, phoneOtp: 'Please send and verify the phone OTP before saving.' }))
        toast.error('Please verify the new phone number before saving.')
        return
      }

      const locationError = details.getHeadquartersError(user.user_type)
      if (locationError) {
        toast.error(locationError)
        return
      }

      setLoading(true)

      const profileData = details.buildProfilePayload(
        user.user_type,
        {
          name: editableName,
          email: editableEmail,
          phone,
          profileImageUrl: images.profileImageUrl,
          coverImageUrl: images.coverImageUrl,
        },
        user?.name
      )

      const response = await fetch('/api/profile/update', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(profileData),
      })

      const data = await response.json().catch(() => null)
      if (!response.ok) {
        throw new Error(data?.error || 'Failed to update profile')
      }

      updateUser({
        name: editableName,
        email: editableEmail,
        phone,
        ...(emailChanged && emailVerifiedForCurrentValue ? { email_verified: true } : {}),
        ...(phoneChanged && phoneVerifiedForCurrentValue ? { phone_verified: true } : {}),
      })

      setSavedEmail(editableEmail)
      setSavedPhone(phone)
      setVerifiedEmailValue(normalizeEmail(editableEmail))
      setVerifiedPhoneValue(normalizePhone(phone))
      setOtpInput({ email: '', phone: '' })
      details.setComplianceDocuments(
        user.user_type === 'ngo'
          ? details.complianceDocuments
          : {}
      )

      await refreshUser()
      toast.success('Profile saved successfully!')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save profile. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const verifyPhoneOtp = async () => {
    const verified = await handleVerifyPhoneOtp(phone || user?.phone || '', otpInput.phone)
    if (!verified) return

    const verifiedAt = new Date().toISOString()
    updateUser({ phone: phone || user?.phone, phone_verified: true, phone_verified_at: verifiedAt })
    setVerifiedPhoneValue(normalizePhone(phone || user?.phone || ''))
    toast.success('Phone verified successfully.')
  }

  const verifyEmailOtp = async () => {
    const verified = await handleVerifyEmailOtp(editableEmail || user?.email || '', otpInput.email, { persist: true })
    if (!verified) return

    const verifiedAt = new Date().toISOString()
    updateUser({ email: editableEmail || user?.email, email_verified: true, email_verified_at: verifiedAt })
    setVerifiedEmailValue(normalizeEmail(editableEmail || user?.email || ''))
    toast.success('Email verified successfully.')
  }

  if (!mounted || !user) {
    return <div className="rounded-md border p-8 text-center text-muted-foreground">Loading profile...</div>
  }

  return (
    <div className="grid min-w-0 gap-6 lg:grid-cols-3">
      <div className="min-w-0 space-y-6 lg:col-span-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              Basic Information
            </CardTitle>
            <CardDescription>Manage your profile information for this account.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <ProfileMediaEditor images={images} userName={user?.name} />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>Full Name</Label>
                <Input value={editableName} onChange={(e) => setEditableName(e.target.value)} placeholder="Enter your full name" />
              </div>
              <div>
                <Label>Email</Label>
                <Input value={editableEmail} onChange={(e) => setEditableEmail(e.target.value)} placeholder="Enter your email" type="email" />
              </div>
            </div>

            <div>
              <Label>Phone Number</Label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+91 9876543210" type="tel" />
            </div>

            {user.user_type === 'ngo' ? (
              <HeadquartersFields
                details={details}
                description="Keep your NGO headquarters address, city, state, and pincode accurate so CSR campaigns and company matches can recommend you correctly."
                cityPlaceholder="e.g., Pune, Guwahati"
              />
            ) : user.user_type === 'company' ? (
              <HeadquartersFields
                details={details}
                description="Keep your registered office address, city, state, and pincode accurate for CSR matching and regional recommendations."
                cityPlaceholder="e.g., Pune, Mumbai"
              />
            ) : (
              <IndividualLocationFields details={details} />
            )}

            <div>
              <Label>Bio</Label>
              <Textarea value={details.bio} onChange={(e) => details.setBio(e.target.value)} rows={4} placeholder="Tell others about yourself..." />
            </div>

            {user.user_type === 'individual' && (
              <div>
                <Label>Age</Label>
                <Input type="number" min="18" max="100" placeholder="Enter your age" value={details.age} onChange={(e) => details.setAge(e.target.value)} />
              </div>
            )}

            {user.user_type === 'company' && <CompanyProfileFields details={details} />}

            {user.user_type === 'ngo' && <NgoProfileFields details={details} />}

            {shouldShowPayoutAccountPanel(user.user_type) &&
            (user.user_type === 'ngo' || user.user_type === 'individual' || user.user_type === 'company') ? (
              <div id="ngo-payout-bank-section" className="scroll-mt-24">
                <PayoutAccountPanel userType={user.user_type} />
              </div>
            ) : null}

            {!canSaveProfile && emailChanged && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                Verify the updated email before saving changes.
              </div>
            )}
            {!canSaveProfile && PHONE_VERIFICATION_ENABLED && phoneChanged && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                Verify the updated phone number before saving changes.
              </div>
            )}
            <Button onClick={handleSaveProfile} disabled={loading || !canSaveProfile} className="w-full max-w-full whitespace-normal break-words sm:w-auto">
              {loading ? 'Saving...' : canSaveProfile ? 'Update Profile' : 'Verify OTP to Save'}
            </Button>
          </CardContent>
        </Card>
      </div>

      <div className="min-w-0 space-y-6">
        <VerificationStatusCard
          user={user}
          phone={phone}
          editableEmail={editableEmail}
          emailChanged={emailChanged}
          resolvedPhoneVerified={resolvedPhoneVerified}
          resolvedEmailVerified={resolvedEmailVerified}
          resolvedVerificationStatus={resolvedVerificationStatus}
          caBadgeNumber={caBadgeNumber}
          documentExpirySummary={documentExpirySummary}
          showDocumentExpiryBanner={showDocumentExpiryBanner}
          reverificationPending={reverificationPending}
          otp={otp}
          otpInput={otpInput}
          setOtpInput={setOtpInput}
          formErrors={formErrors}
          onVerifyPhoneOtp={verifyPhoneOtp}
          onVerifyEmailOtp={verifyEmailOtp}
        />
      </div>
    </div>
  )
}

export default ProfileDashboardTab
