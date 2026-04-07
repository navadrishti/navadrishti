"use client"

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { User } from 'lucide-react'
import { useAuth } from '@/lib/auth-context'
import { useOtpSender } from '@/hooks/use-otp-sender'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { VerificationBadge } from '@/components/verification-badge'

type FormErrors = Record<string, string>

export function ProfileDashboardTab() {
  const { user, updateUser, refreshUser } = useAuth()
  const [mounted, setMounted] = useState(false)
  const [loading, setLoading] = useState(true)
  const [profileImageUrl, setProfileImageUrl] = useState('')
  const [uploadingProfileImage, setUploadingProfileImage] = useState(false)
  const [editableName, setEditableName] = useState('')
  const [editableEmail, setEditableEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [city, setCity] = useState('')
  const [stateProvince, setStateProvince] = useState('')
  const [pincode, setPincode] = useState('')
  const [country, setCountry] = useState('India')
  const [bio, setBio] = useState('')
  const [sector, setSector] = useState('')
  const [foundedYear, setFoundedYear] = useState('')
  const [website, setWebsite] = useState('')
  const [industry, setIndustry] = useState('')
  const [companySize, setCompanySize] = useState('')
  const [ngoSize, setNgoSize] = useState('')
  const [age, setAge] = useState('')
  const [formErrors, setFormErrors] = useState<FormErrors>({})
  const [otpInput, setOtpInput] = useState({ email: '', phone: '' })
  const [profileVerificationStatus, setProfileVerificationStatus] = useState<'verified' | 'unverified' | 'pending'>('unverified')
  const [verifiedEmailValue, setVerifiedEmailValue] = useState('')
  const [verifiedPhoneValue, setVerifiedPhoneValue] = useState('')
  const initialEmailRef = useRef('')
  const initialPhoneRef = useRef('')
  const { otpSending, otpSent, otpCooldown, otpVerifying, otpVerified, handleSendEmailOtp, handleVerifyEmailOtp, handleSendPhoneOtp, handleVerifyPhoneOtp, resetEmailOtpState, resetPhoneOtpState } = useOtpSender(setFormErrors)

  const normalizeEmail = (value: string) => value.trim().toLowerCase()
  const normalizePhone = (value: string) => value.trim().replace(/\s+/g, '')

  const currentEmail = normalizeEmail(editableEmail)
  const currentPhone = normalizePhone(phone)
  const originalEmail = normalizeEmail(initialEmailRef.current)
  const originalPhone = normalizePhone(initialPhoneRef.current)
  const emailChanged = currentEmail !== originalEmail
  const phoneChanged = currentPhone !== originalPhone

  const emailVerifiedForCurrentValue = !emailChanged || (otpVerified.email && verifiedEmailValue === currentEmail)
  const phoneVerifiedForCurrentValue = !phoneChanged || (otpVerified.phone && verifiedPhoneValue === currentPhone)
  const canSaveProfile = emailVerifiedForCurrentValue && phoneVerifiedForCurrentValue

  const resolvedEmailVerified = !emailChanged ? !!user?.email_verified : emailVerifiedForCurrentValue
  const resolvedPhoneVerified = !phoneChanged ? !!user?.phone_verified : phoneVerifiedForCurrentValue
  const resolvedVerificationStatus = profileVerificationStatus || user?.verification_status || 'unverified'

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!mounted || !user) return
    void fetchProfile()
    void fetchVerificationStatus()
  }, [mounted, user?.id])

  useEffect(() => {
    if (normalizeEmail(editableEmail) === normalizeEmail(initialEmailRef.current)) {
      return
    }

    resetEmailOtpState()
    setOtpInput((prev) => ({ ...prev, email: '' }))
    setVerifiedEmailValue('')
  }, [editableEmail, resetEmailOtpState])

  useEffect(() => {
    if (normalizePhone(phone) === normalizePhone(initialPhoneRef.current)) {
      return
    }

    resetPhoneOtpState()
    setOtpInput((prev) => ({ ...prev, phone: '' }))
    setVerifiedPhoneValue('')
  }, [phone, resetPhoneOtpState])

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
      const freshUser = data.user
      const userProfile = freshUser?.profile_data || {}

      setEditableName(freshUser?.name || '')
      setEditableEmail(freshUser?.email || '')
      setPhone(freshUser?.phone || '')
      initialEmailRef.current = freshUser?.email || ''
      initialPhoneRef.current = freshUser?.phone || ''
      setVerifiedEmailValue(freshUser?.email_verified ? normalizeEmail(freshUser?.email || '') : '')
      setVerifiedPhoneValue(freshUser?.phone_verified ? normalizePhone(freshUser?.phone || '') : '')
      setCity(freshUser?.city || '')
      setStateProvince(freshUser?.state_province || '')
      setPincode(freshUser?.pincode || '')
      setCountry(freshUser?.country || 'India')
      setBio(userProfile.bio || freshUser?.bio || '')
      setSector(userProfile.sector || '')
      setFoundedYear(userProfile.founded || userProfile.founded_year || '')
      setWebsite(userProfile.website || userProfile.company_website || userProfile.organization_website || '')
      setIndustry(userProfile.industry || '')
      setCompanySize(userProfile.company_size || '')
      setNgoSize(userProfile.ngo_size || '')
      setAge(userProfile.age || '')
      setProfileImageUrl(freshUser?.profile_image || '')
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
    } catch (error) {
      console.error('Error fetching verification status:', error)
    }
  }

  const handleProfileImageUpload = async (file: File) => {
    try {
      setUploadingProfileImage(true)

      const token = localStorage.getItem('token')
      if (!token) {
        throw new Error('Authentication required. Please log in again.')
      }

      const formData = new FormData()
      formData.append('file', file)

      const response = await fetch('/api/upload', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Upload failed')
      }

      const result = await response.json()
      const imageUrl = result.data.url
      setProfileImageUrl(imageUrl)

      const saveResponse = await fetch('/api/profile/update', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: user?.id,
          profileImageUrl: imageUrl,
        }),
      })

      if (!saveResponse.ok) {
        throw new Error('Failed to persist profile image')
      }

      await refreshUser()
      toast.success('Profile picture updated successfully!')
    } catch (error) {
      console.error('Error uploading profile image:', error)
      toast.error(error instanceof Error ? error.message : 'Failed to upload profile picture.')
    } finally {
      setUploadingProfileImage(false)
    }
  }

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

      if (phoneChanged && !phoneVerifiedForCurrentValue) {
        setFormErrors((prev) => ({ ...prev, phoneOtp: 'Please send and verify the phone OTP before saving.' }))
        toast.error('Please verify the new phone number before saving.')
        return
      }

      setLoading(true)

      const profileData: Record<string, any> = {
        userId: user.id,
        name: editableName,
        email: editableEmail,
        phone,
        city,
        state_province: stateProvince,
        pincode,
        country,
        profileImageUrl,
        profile_data: {
          bio,
        },
      }

      if (emailChanged && emailVerifiedForCurrentValue) {
        profileData.email_verified = true
        profileData.email_verified_at = new Date().toISOString()
      }

      if (phoneChanged && phoneVerifiedForCurrentValue) {
        profileData.phone_verified = true
        profileData.phone_verified_at = new Date().toISOString()
      }

      if (user.user_type === 'individual' && age) {
        profileData.profile_data.age = parseInt(age)
      }

      if (user.user_type === 'company') {
        profileData.profile_data.industry = industry
        profileData.profile_data.company_size = companySize
        profileData.profile_data.website = website
        profileData.profile_data.sector = sector
        if (foundedYear) profileData.profile_data.founded = parseInt(foundedYear)
        profileData.profile_data.company_name = editableName || user?.name
      }

      if (user.user_type === 'ngo') {
        profileData.profile_data.ngo_size = ngoSize
        profileData.profile_data.sector = sector
        if (foundedYear) profileData.profile_data.founded = parseInt(foundedYear)
        profileData.profile_data.ngo_name = editableName || user?.name
      }

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

      initialEmailRef.current = editableEmail
      initialPhoneRef.current = phone
      setVerifiedEmailValue(normalizeEmail(editableEmail))
      setVerifiedPhoneValue(normalizePhone(phone))
      setOtpInput({ email: '', phone: '' })

      await refreshUser()
      toast.success('Profile saved successfully!')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save profile. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  if (!mounted || !user) {
    return <div className="rounded-md border p-8 text-center text-muted-foreground">Loading profile...</div>
  }

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="lg:col-span-2 space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5" />
              Basic Information
            </CardTitle>
            <CardDescription>Manage your profile information for this account.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col items-center gap-4 pb-4 border-b">
              <div className="relative">
                <div className="w-24 h-24 rounded-full overflow-hidden border-4 border-gray-200">
                  {profileImageUrl ? (
                    <img src={profileImageUrl} alt="Profile" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-blue-400 to-indigo-500 text-white font-semibold flex items-center justify-center text-xl">
                      {user?.name ? user.name.split(' ').map((n) => n[0]).join('').toUpperCase() : 'U'}
                    </div>
                  )}
                </div>
              </div>
              <div className="flex min-w-0 flex-col items-center gap-2">
                <label className="cursor-pointer">
                  <Button variant="outline" size="sm" disabled={uploadingProfileImage} asChild className="w-full max-w-full whitespace-normal break-words text-center">
                    <span>{uploadingProfileImage ? 'Uploading...' : 'Change Profile Picture'}</span>
                  </Button>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      if (file) handleProfileImageUpload(file)
                    }}
                    className="hidden"
                    disabled={uploadingProfileImage}
                  />
                </label>
              </div>
            </div>

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

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>Phone Number</Label>
                <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Enter your phone number" />
              </div>
              <div>
                <Label>City</Label>
                <Input value={city} onChange={(e) => setCity(e.target.value)} placeholder="e.g., Mumbai, Delhi" />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <Label>State/Province</Label>
                <Input value={stateProvince} onChange={(e) => setStateProvince(e.target.value)} placeholder="e.g., Maharashtra, Karnataka" />
              </div>
              <div>
                <Label>Pincode</Label>
                <Input value={pincode} onChange={(e) => setPincode(e.target.value)} placeholder="e.g., 400001" />
              </div>
              <div>
                <Label>Country</Label>
                <Input value={country} onChange={(e) => setCountry(e.target.value)} placeholder="Country" />
              </div>
            </div>

            <div>
              <Label>Bio</Label>
              <Textarea value={bio} onChange={(e) => setBio(e.target.value)} rows={4} placeholder="Tell others about yourself..." />
            </div>

            {user.user_type === 'individual' && (
              <div>
                <Label>Age</Label>
                <Input type="number" min="18" max="100" placeholder="Enter your age" value={age} onChange={(e) => setAge(e.target.value)} />
              </div>
            )}

            {user.user_type === 'company' && (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label>Industry</Label>
                    <Select value={industry} onValueChange={setIndustry}>
                      <SelectTrigger><SelectValue placeholder="Select industry" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="technology">Technology</SelectItem>
                        <SelectItem value="healthcare">Healthcare</SelectItem>
                        <SelectItem value="education">Education</SelectItem>
                        <SelectItem value="manufacturing">Manufacturing</SelectItem>
                        <SelectItem value="finance">Finance & Banking</SelectItem>
                        <SelectItem value="retail">Retail</SelectItem>
                        <SelectItem value="consulting">Consulting</SelectItem>
                        <SelectItem value="media">Media & Entertainment</SelectItem>
                        <SelectItem value="energy">Energy</SelectItem>
                        <SelectItem value="ecommerce">E-commerce</SelectItem>
                        <SelectItem value="other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Company Size</Label>
                    <Select value={companySize} onValueChange={setCompanySize}>
                      <SelectTrigger><SelectValue placeholder="Select company size" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1-10">1-10 employees</SelectItem>
                        <SelectItem value="11-50">11-50 employees</SelectItem>
                        <SelectItem value="51-200">51-200 employees</SelectItem>
                        <SelectItem value="201-500">201-500 employees</SelectItem>
                        <SelectItem value="501-1000">501-1000 employees</SelectItem>
                        <SelectItem value="1001+">1001+ employees</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label>Website</Label>
                    <Input type="url" placeholder="https://www.yourcompany.com" value={website} onChange={(e) => setWebsite(e.target.value)} />
                  </div>
                  <div>
                    <Label>Sector</Label>
                    <Input placeholder="e.g., CSR, Education, Healthcare" value={sector} onChange={(e) => setSector(e.target.value)} />
                  </div>
                </div>
                <div>
                  <Label>Founded Year</Label>
                  <Input type="number" min="1800" max={new Date().getFullYear()} placeholder="e.g., 2010" value={foundedYear} onChange={(e) => setFoundedYear(e.target.value)} />
                </div>
              </>
            )}

            {user.user_type === 'ngo' && (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label>NGO Size</Label>
                    <Select value={ngoSize} onValueChange={setNgoSize}>
                      <SelectTrigger><SelectValue placeholder="Select NGO size" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1-10">1-10 members</SelectItem>
                        <SelectItem value="11-50">11-50 members</SelectItem>
                        <SelectItem value="51-200">51-200 members</SelectItem>
                        <SelectItem value="201-500">201-500 members</SelectItem>
                        <SelectItem value="501+">501+ members</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Founded Year</Label>
                    <Input type="number" min="1800" max={new Date().getFullYear()} placeholder="e.g., 2010" value={foundedYear} onChange={(e) => setFoundedYear(e.target.value)} />
                  </div>
                </div>
                <div>
                  <Label>Sector</Label>
                  <Input placeholder="Education, Healthcare, Environment, etc." value={sector} onChange={(e) => setSector(e.target.value)} />
                </div>
              </>
            )}

            {!canSaveProfile && (emailChanged || phoneChanged) && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                Verify the updated email and phone number before saving changes.
              </div>
            )}
            <Button onClick={handleSaveProfile} disabled={loading || !canSaveProfile} className="w-full max-w-full whitespace-normal break-words sm:w-auto">
              {loading ? 'Saving...' : canSaveProfile ? 'Update Profile' : 'Verify OTP to Save'}
            </Button>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Verification Status</CardTitle>
            <CardDescription>Track verification and open the verification workflow.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-4">
              <div className="rounded-lg border p-4 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-medium">Mobile Number Verification</span>
                  <VerificationBadge status={resolvedPhoneVerified ? 'verified' : 'unverified'} size="sm" showText={false} />
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
                            onClick={async () => {
                              const verified = await handleVerifyPhoneOtp(phone || user?.phone || '', otpInput.phone)
                              if (!verified) return

                              const verifiedAt = new Date().toISOString()
                              const response = await fetch('/api/profile/update', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                  userId: user?.id,
                                  phone_verified: true,
                                  phone_verified_at: verifiedAt,
                                }),
                              })

                              if (!response.ok) {
                                toast.error('Phone OTP verified but failed to persist status. Please refresh and try again.')
                                return
                              }

                              updateUser({ phone: phone || user?.phone, phone_verified: true, phone_verified_at: verifiedAt })
                              setVerifiedPhoneValue(normalizePhone(phone || user?.phone || ''))
                              toast.success('Phone verified successfully.')
                            }}
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

              <div className="rounded-lg border p-4 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-medium">Email Verification</span>
                  <VerificationBadge status={resolvedEmailVerified ? 'verified' : 'unverified'} size="sm" showText={false} />
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
                            onClick={async () => {
                              const verified = await handleVerifyEmailOtp(editableEmail || user?.email || '', otpInput.email)
                              if (!verified) return

                              const verifiedAt = new Date().toISOString()
                              const response = await fetch('/api/profile/update', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                  userId: user?.id,
                                  email_verified: true,
                                  email_verified_at: verifiedAt,
                                }),
                              })

                              if (!response.ok) {
                                toast.error('Email OTP verified but failed to persist status. Please refresh and try again.')
                                return
                              }

                              updateUser({ email: editableEmail || user?.email, email_verified: true, email_verified_at: verifiedAt })
                              setVerifiedEmailValue(normalizeEmail(editableEmail || user?.email || ''))
                              toast.success('Email verified successfully.')
                            }}
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

              <div className="rounded-lg border p-4 space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-medium">Document Verification</span>
                  <VerificationBadge status={resolvedVerificationStatus} size="sm" showText={false} />
                </div>
                <p className="text-xs leading-5 text-muted-foreground">Complete identity verification from the verification dashboard.</p>
                {resolvedVerificationStatus !== 'verified' && (
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
                )}
              </div>
            </div>
          </CardContent>
        </Card>

      </div>
    </div>
  )
}

export default ProfileDashboardTab
