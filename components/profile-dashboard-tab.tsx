"use client"

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { AlertTriangle, Camera, CheckCircle2, Loader2, RefreshCw } from 'lucide-react'
// User icon removed from heading
import { useAuth } from '@/lib/auth-context'
import { useOtpSender } from '@/hooks/use-otp-sender'
import { PHONE_VERIFICATION_ENABLED, getCoverImageUrl, summarizeDocumentExpiries, visibleCaBadgeNumber } from '@/lib/auth'
import { formatDisplayDate } from '@/lib/format-date'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { NgoComplianceBadges, VerificationBadge } from '@/components/verification-badge'
import { ProfileCoverMedia } from '@/components/profile-card'
import { MultiSelectDropdown } from '@/components/ui/multi-select-dropdown'
import { useToast } from '@/hooks/use-toast'
import { openRazorpayCheckout } from '@/lib/razorpay-checkout'
import {
  CSR_SCHEDULE_VII_CATEGORIES,
  COMPANY_CSR_GOVERNANCE_MECHANISMS,
  COMPANY_CSR_IMPLEMENTATION_MODELS,
  normalizeCompanyFocusAreasScheduleVii,
  normalizeCompanyGovernanceMechanism,
  normalizeCompanyImplementationModel,
} from '@/lib/categories'
import {
  calculatePlatformCheckoutPricing,
  formatInr,
  normalizeIfsc,
  sanitizePayoutAccountInput,
  validateNgoPayoutAccount,
  type NgoPayoutAccount,
  type NgoRazorpayLinkStatus,
} from '@/lib/utils'
import { shouldShowPayoutAccountPanel } from '@/lib/access-control'
import {
  EMPTY_EXECUTION_CAPACITY,
  EMPTY_GEOGRAPHIC_COVERAGE_AREA,
  INDIAN_STATES_AND_UTS,
  buildNgoLocationDisplay,
  getComplianceDocumentUrl,
  normalizeExecutionCapacity,
  normalizeGeographicCoverage,
  normalizePincode,
  validateNgoHeadquartersLocation,
  validateCompanyHeadquartersLocation,
  type ComplianceDocuments,
  type NgoExecutionCapacity,
  type NgoGeographicCoverageArea,
} from '@/lib/auth'

type FormErrors = Record<string, string>

type PayoutAccountResponse = {
  payoutAccount: NgoPayoutAccount | null
  canConnect?: boolean
  bankDetailsSummary: string | null
  linkStatus: NgoRazorpayLinkStatus
  linkedAccountId: string | null
  linkError: string | null
  linkUpdatedAt: string | null
  hasPayoutDetails: boolean
  networkListingEligible?: boolean
  routeReady: boolean
  payoutStatusMessage: string | null
}

const EMPTY_PAYOUT: NgoPayoutAccount = {
  account_holder_name: '',
  bank_name: '',
  branch: '',
  account_number: '',
  ifsc: '',
  account_type: 'current',
}

function payoutLinkStatusLabel(status: NgoRazorpayLinkStatus): string {
  switch (status) {
    case 'active':
      return 'Connected'
    case 'pending':
      return 'Pending activation'
    case 'failed':
      return 'Connection failed'
    case 'needs_reconnect':
      return 'Reconnect required'
    default:
      return 'Not connected'
  }
}

function payoutLinkStatusVariant(status: NgoRazorpayLinkStatus): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (status === 'active') return 'default'
  if (status === 'failed') return 'destructive'
  if (status === 'needs_reconnect') return 'destructive'
  return 'secondary'
}

function payoutPanelDescription(userType: 'ngo' | 'individual' | 'company'): string {
  if (userType === 'ngo') {
    return 'Donations and CSR payments can settle directly to this bank account once Razorpay Route is connected.'
  }
  if (userType === 'individual') {
    return 'Save the bank account where capability and service payouts should be sent when merchant settlements are enabled.'
  }
  return 'Save the bank account where capability and CSR payouts should be sent when merchant settlements are enabled.'
}

function PayoutAccountPanel({ userType }: { userType: 'ngo' | 'individual' | 'company' }) {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [connecting, setConnecting] = useState(false)
  const [form, setForm] = useState<NgoPayoutAccount>(EMPTY_PAYOUT)
  const [status, setStatus] = useState<PayoutAccountResponse | null>(null)

  const loadStatus = useCallback(async () => {
    const token = localStorage.getItem('token')
    if (!token) return

    setLoading(true)
    try {
      const response = await fetch('/api/profile/update?scope=payout', {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = (await response.json()) as PayoutAccountResponse & { error?: string }
      if (!response.ok) {
        throw new Error(data.error || 'Failed to load payout account details.')
      }

      setStatus(data)
      setForm({
        ...EMPTY_PAYOUT,
        ...(data.payoutAccount || {}),
        account_number: '',
      })
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to load payout account.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadStatus()
  }, [loadStatus])

  const handleFieldChange = (field: keyof NgoPayoutAccount, value: string) => {
    const nextValue = field === 'ifsc' ? normalizeIfsc(value) : value
    setForm((prev) => ({ ...prev, [field]: nextValue }))
  }

  const handleSave = async () => {
    const sanitized = sanitizePayoutAccountInput(form)
    const allowMissingAccountNumber = !sanitized.account_number && Boolean(status?.hasPayoutDetails)
    let validationError = validateNgoPayoutAccount(sanitized)

    if (validationError && allowMissingAccountNumber) {
      if (sanitized.account_holder_name.length < 3) {
        validationError = 'Account holder name must be at least 3 characters.'
      } else if (sanitized.bank_name.length < 2) {
        validationError = 'Bank name is required.'
      } else if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(sanitized.ifsc)) {
        validationError = 'Enter a valid IFSC code (e.g. HDFC0001234).'
      } else {
        validationError = null
      }
    }

    if (validationError) {
      toast.error(validationError)
      return
    }

    const token = localStorage.getItem('token')
    if (!token) {
      toast.error('Please sign in again.')
      return
    }

    setSaving(true)
    try {
      const response = await fetch('/api/profile/update', {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ scope: 'payout', action: 'save', payoutAccount: sanitized }),
      })
      const data = await response.json()
      if (!response.ok) {
        throw new Error(data.error || 'Failed to save payout account.')
      }

      toast.success(data.message || 'Payout bank details saved.')
      setStatus(data)
      setForm({
        ...EMPTY_PAYOUT,
        ...(data.payoutAccount || {}),
        account_number: '',
      })
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save payout account.')
    } finally {
      setSaving(false)
    }
  }

  const handleConnect = async () => {
    const token = localStorage.getItem('token')
    if (!token) {
      toast.error('Please sign in again.')
      return
    }

    setConnecting(true)
    try {
      const response = await fetch('/api/profile/update', {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ scope: 'payout', action: 'connect' }),
      })
      const data = await response.json()
      if (!response.ok) {
        throw new Error(data.error || 'Failed to connect payout account.')
      }

      toast.success(data.message || 'Payout account connected.')
      setStatus(data)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to connect payout account.')
      await loadStatus()
    } finally {
      setConnecting(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-lg border p-4 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading payout account details...
      </div>
    )
  }

  const linkStatus = status?.linkStatus || 'not_started'
  const showReconnect = linkStatus === 'needs_reconnect' || linkStatus === 'failed' || linkStatus === 'not_started'
  const canConnect = Boolean(status?.canConnect)
  const maskedSavedAccount = status?.payoutAccount?.account_number
  const showStatusMessage =
    Boolean(status?.payoutStatusMessage) &&
    (linkStatus !== 'not_started' || Boolean(status?.hasPayoutDetails))

  return (
    <div className="space-y-4 rounded-lg border p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h4 className="text-sm font-semibold">Payout Bank Account</h4>
          <p className="mt-1 text-xs text-muted-foreground">
            {payoutPanelDescription(userType)}
          </p>
        </div>
        {userType === 'ngo' ? (
          <Badge variant={payoutLinkStatusVariant(linkStatus)}>{payoutLinkStatusLabel(linkStatus)}</Badge>
        ) : null}
      </div>

      {userType === 'ngo' && !status?.hasPayoutDetails ? (
        <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            Step 1: Save your bank details. Step 2: Connect Razorpay — your NGO appears on the NGO Network only after payout is active.
          </span>
        </div>
      ) : null}

      {userType === 'ngo' && status?.hasPayoutDetails && !status?.networkListingEligible ? (
        <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            Step 2: Connect Razorpay — your NGO appears on the NGO Network only after payout is active.
          </span>
        </div>
      ) : null}

      {userType === 'ngo' && status?.networkListingEligible ? (
        <div className="flex items-start gap-2 rounded-md border border-green-200 bg-green-50 p-3 text-xs text-green-800">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          <span>Your NGO is listed on the NGO Network and can receive Razorpay payouts.</span>
        </div>
      ) : null}

      {showStatusMessage ? (
        <p className="text-xs text-muted-foreground">{status?.payoutStatusMessage}</p>
      ) : null}

      {status?.linkError ? (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-xs text-red-700">
          {status.linkError}
        </div>
      ) : null}

      {userType === 'ngo' && linkStatus === 'active' ? (
        <div className="flex items-start gap-2 rounded-md border border-green-200 bg-green-50 p-3 text-xs text-green-800">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            Razorpay linked account is active
            {status?.linkedAccountId ? ` (${status.linkedAccountId})` : ''}. Direct payouts are enabled when Route is turned on for the platform.
          </span>
        </div>
      ) : null}

      {userType === 'ngo' && linkStatus === 'needs_reconnect' ? (
        <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>Bank details changed. Save the form and reconnect so Razorpay can verify the updated account.</span>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div>
          <Label htmlFor="payoutAccountHolder">Account holder name</Label>
          <Input
            id="payoutAccountHolder"
            value={form.account_holder_name}
            onChange={(event) => handleFieldChange('account_holder_name', event.target.value)}
            placeholder="As per bank records"
          />
        </div>
        <div>
          <Label htmlFor="payoutBankName">Bank name</Label>
          <Input
            id="payoutBankName"
            value={form.bank_name}
            onChange={(event) => handleFieldChange('bank_name', event.target.value)}
            placeholder="e.g. State Bank of India"
          />
        </div>
        <div>
          <Label htmlFor="payoutBranch">Branch (optional)</Label>
          <Input
            id="payoutBranch"
            value={form.branch || ''}
            onChange={(event) => handleFieldChange('branch', event.target.value)}
            placeholder="Branch name"
          />
        </div>
        <div>
          <Label htmlFor="payoutAccountType">Account type</Label>
          <Select value={form.account_type} onValueChange={(value) => handleFieldChange('account_type', value)}>
            <SelectTrigger id="payoutAccountType">
              <SelectValue placeholder="Select account type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="current">Current</SelectItem>
              <SelectItem value="savings">Savings</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="payoutAccountNumber">Account number</Label>
          <Input
            id="payoutAccountNumber"
            value={form.account_number}
            onChange={(event) => handleFieldChange('account_number', event.target.value)}
            placeholder={maskedSavedAccount ? `Saved: ${maskedSavedAccount}` : 'Enter account number'}
            inputMode="numeric"
          />
          {maskedSavedAccount ? (
            <p className="mt-1 text-xs text-muted-foreground">
              Current saved account ends with {maskedSavedAccount.replace(/\*/g, '')}. Enter the full number again to change it.
            </p>
          ) : null}
        </div>
        <div>
          <Label htmlFor="payoutIfsc">IFSC code</Label>
          <Input
            id="payoutIfsc"
            value={form.ifsc}
            onChange={(event) => handleFieldChange('ifsc', event.target.value)}
            placeholder="e.g. SBIN0001234"
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={handleSave} disabled={saving || connecting}>
          {saving ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Saving...
            </>
          ) : (
            'Save payout details'
          )}
        </Button>
        {userType === 'ngo' ? (
        <Button
          type="button"
          variant={showReconnect ? 'default' : 'outline'}
          onClick={handleConnect}
          disabled={connecting || saving || !canConnect}
        >
          {connecting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Connecting...
            </>
          ) : (
            <>
              <RefreshCw className="mr-2 h-4 w-4" />
              {showReconnect ? 'Connect payout account' : 'Refresh Razorpay status'}
            </>
          )}
        </Button>
        ) : null}
      </div>
      {userType === 'ngo' && !canConnect ? (
        <p className="text-xs text-muted-foreground">Save payout details first, then connect to Razorpay.</p>
      ) : null}
    </div>
  )
}

export function ProfileDashboardTab() {
  const { user, updateUser, refreshUser } = useAuth()
  const [mounted, setMounted] = useState(false)
  const [loading, setLoading] = useState(true)
  const [profileImageUrl, setProfileImageUrl] = useState('')
  const [coverImageUrl, setCoverImageUrl] = useState('')
  const [uploadingProfileImage, setUploadingProfileImage] = useState(false)
  const [uploadingCoverImage, setUploadingCoverImage] = useState(false)
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
  const [ngoVolunteerCapacity, setNgoVolunteerCapacity] = useState('')
  const [twelveANumber, setTwelveANumber] = useState('')
  const [eightyGNumber, setEightyGNumber] = useState('')
  const [csr1RegistrationNumber, setCsr1RegistrationNumber] = useState('')
  const [complianceDocuments, setComplianceDocuments] = useState<ComplianceDocuments>({})
  const [age, setAge] = useState('')
  const [addressLine, setAddressLine] = useState('')
  const [registrationDate, setRegistrationDate] = useState('')
  const [sectorsScheduleVii, setSectorsScheduleVii] = useState<string[]>([])
  const [geographicCoverageAreas, setGeographicCoverageAreas] = useState<NgoGeographicCoverageArea[]>([
    { ...EMPTY_GEOGRAPHIC_COVERAGE_AREA },
  ])
  const [executionCapacity, setExecutionCapacity] = useState<NgoExecutionCapacity>({ ...EMPTY_EXECUTION_CAPACITY })
  const [netWorth, setNetWorth] = useState('')
  const [turnover, setTurnover] = useState('')
  const [netProfit, setNetProfit] = useState('')
  const [csrVision, setCsrVision] = useState('')
  const [focusAreasScheduleVii, setFocusAreasScheduleVii] = useState<string[]>([])
  const [implementationModel, setImplementationModel] = useState('')
  const [governanceMechanism, setGovernanceMechanism] = useState('')
  const [formErrors, setFormErrors] = useState<FormErrors>({})
  const [otpInput, setOtpInput] = useState({ email: '', phone: '' })
  const [profileVerificationStatus, setProfileVerificationStatus] = useState<'verified' | 'unverified' | 'pending'>('unverified')
  const [reverificationPending, setReverificationPending] = useState(false)
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

  const addGeographicArea = () => {
    setGeographicCoverageAreas((prev) => [...prev, { ...EMPTY_GEOGRAPHIC_COVERAGE_AREA }])
  }

  const removeGeographicArea = (index: number) => {
    setGeographicCoverageAreas((prev) =>
      prev.length <= 1 ? prev : prev.filter((_, itemIndex) => itemIndex !== index)
    )
  }

  const updateGeographicArea = (
    index: number,
    field: keyof NgoGeographicCoverageArea,
    value: string
  ) => {
    setGeographicCoverageAreas((prev) =>
      prev.map((area, itemIndex) => (itemIndex === index ? { ...area, [field]: value } : area))
    )
  }

  const updateExecutionCapacityField = (field: keyof NgoExecutionCapacity, value: string) => {
    setExecutionCapacity((prev) => ({ ...prev, [field]: value }))
  }

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
      setNgoVolunteerCapacity(String(freshUser?.ngo_volunteer_capacity ?? userProfile.ngo_volunteer_capacity ?? ''))
      setTwelveANumber(String(userProfile.twelve_a_number || ''))
      setEightyGNumber(String(userProfile.eighty_g_number || ''))
      setCsr1RegistrationNumber(String(userProfile.csr1_registration_number || ''))

      const existingComplianceDocuments =
        userProfile.compliance_documents && typeof userProfile.compliance_documents === 'object'
          ? (userProfile.compliance_documents as ComplianceDocuments)
          : {}

      setComplianceDocuments({
        twelve_a: getComplianceDocumentUrl(existingComplianceDocuments.twelve_a),
        eighty_g: getComplianceDocumentUrl(existingComplianceDocuments.eighty_g),
        csr1: getComplianceDocumentUrl(existingComplianceDocuments.csr1),
      })
      setAge(userProfile.age || '')
      setProfileImageUrl(freshUser?.profile_image || '')
      setCoverImageUrl(getCoverImageUrl(freshUser?.cover_image || userProfile))

      if (freshUser?.user_type === 'ngo') {
        const headquarters =
          userProfile.ngo_headquarters && typeof userProfile.ngo_headquarters === 'object'
            ? (userProfile.ngo_headquarters as Record<string, string>)
            : {}

        setAddressLine(headquarters.address_line || '')
        setRegistrationDate(String(userProfile.registration_date || ''))
        setSectorsScheduleVii(
          Array.isArray(userProfile.sectors_schedule_vii)
            ? userProfile.sectors_schedule_vii.filter((item): item is string => typeof item === 'string')
            : []
        )

        const normalizedGeographicCoverage = normalizeGeographicCoverage(userProfile.geographic_coverage)
        setGeographicCoverageAreas(
          normalizedGeographicCoverage.length > 0
            ? normalizedGeographicCoverage
            : [{ ...EMPTY_GEOGRAPHIC_COVERAGE_AREA }]
        )

        setExecutionCapacity(
          normalizeExecutionCapacity(userProfile.execution_capacity) || { ...EMPTY_EXECUTION_CAPACITY }
        )
      }

      if (freshUser?.user_type === 'company') {
        const headquarters =
          userProfile.company_headquarters && typeof userProfile.company_headquarters === 'object'
            ? (userProfile.company_headquarters as Record<string, string>)
            : {}

        setAddressLine(headquarters.address_line || '')
        setNetWorth(String(userProfile.net_worth || ''))
        setTurnover(String(userProfile.turnover || ''))
        setNetProfit(String(userProfile.net_profit || ''))
        setCsrVision(String(userProfile.csr_vision || ''))
        setFocusAreasScheduleVii(normalizeCompanyFocusAreasScheduleVii(userProfile.focus_areas_schedule_vii))
        setImplementationModel(normalizeCompanyImplementationModel(userProfile.implementation_model))
        setGovernanceMechanism(normalizeCompanyGovernanceMechanism(userProfile.governance_mechanism))
      }
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

  const persistCoverImage = async (imageUrl: string) => {
    const token = localStorage.getItem('token')
    if (!token) {
      throw new Error('Authentication required. Please log in again.')
    }

    const saveResponse = await fetch('/api/profile/update', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        userId: user?.id,
        coverImageUrl: imageUrl,
      }),
    })

    if (!saveResponse.ok) {
      throw new Error('Failed to persist cover photo')
    }
  }

  const handleCoverImageUpload = async (file: File) => {
    try {
      setUploadingCoverImage(true)

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
      setCoverImageUrl(imageUrl)
      await persistCoverImage(imageUrl)
      await refreshUser()
      toast.success('Cover photo updated successfully!')
    } catch (error) {
      console.error('Error uploading cover photo:', error)
      toast.error(error instanceof Error ? error.message : 'Failed to upload cover photo.')
    } finally {
      setUploadingCoverImage(false)
    }
  }

  const handleRemoveCoverImage = async () => {
    try {
      setUploadingCoverImage(true)
      setCoverImageUrl('')
      await persistCoverImage('')
      await refreshUser()
      toast.success('Cover photo removed')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to remove cover photo.')
    } finally {
      setUploadingCoverImage(false)
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

      if (PHONE_VERIFICATION_ENABLED && phoneChanged && !phoneVerifiedForCurrentValue) {
        setFormErrors((prev) => ({ ...prev, phoneOtp: 'Please send and verify the phone OTP before saving.' }))
        toast.error('Please verify the new phone number before saving.')
        return
      }

      if (user.user_type === 'ngo') {
        const locationError = validateNgoHeadquartersLocation({
          address_line: addressLine,
          city,
          state: stateProvince,
          pincode,
          country,
        })
        if (locationError) {
          toast.error(locationError)
          return
        }
      }

      if (user.user_type === 'company') {
        const locationError = validateCompanyHeadquartersLocation({
          address_line: addressLine,
          city,
          state: stateProvince,
          pincode,
          country,
        })
        if (locationError) {
          toast.error(locationError)
          return
        }
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
        coverImageUrl,
        bio,
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
        const headquarters = {
          address_line: addressLine.trim(),
          city: city.trim(),
          state: stateProvince.trim(),
          pincode: normalizePincode(pincode, country),
          country,
        }

        profileData.location = buildNgoLocationDisplay(headquarters)
        profileData.profile_data.industry = industry
        profileData.profile_data.company_size = companySize
        profileData.profile_data.website = website.trim() || undefined
        profileData.profile_data.sector = sector.trim() || undefined
        if (foundedYear) profileData.profile_data.founded = parseInt(foundedYear)
        profileData.profile_data.company_name = editableName || user?.name
        profileData.profile_data.company_headquarters = headquarters
        profileData.profile_data.net_worth = netWorth.trim() || undefined
        profileData.profile_data.turnover = turnover.trim() || undefined
        profileData.profile_data.net_profit = netProfit.trim() || undefined
        profileData.profile_data.csr_vision = csrVision.trim() || undefined
        if (focusAreasScheduleVii.length > 0) {
          profileData.profile_data.focus_areas_schedule_vii = focusAreasScheduleVii
        }
        profileData.profile_data.implementation_model = implementationModel || undefined
        profileData.profile_data.governance_mechanism = governanceMechanism || undefined
      }

      if (user.user_type === 'ngo') {
        const headquarters = {
          address_line: addressLine.trim(),
          city: city.trim(),
          state: stateProvince.trim(),
          pincode: normalizePincode(pincode, country),
          country,
        }

        const normalizedGeographicCoverage = geographicCoverageAreas
          .map((area) => ({
            region: area.region.trim(),
            state: area.state.trim(),
            district: area.district.trim(),
            area_type: area.area_type,
          }))
          .filter((area) => area.state || area.region || area.district)

        const normalizedExecutionCapacity = {
          concurrent_projects: executionCapacity.concurrent_projects.trim(),
          annual_beneficiaries: executionCapacity.annual_beneficiaries.trim(),
          delivery_model: executionCapacity.delivery_model,
          notes: executionCapacity.notes.trim(),
        }
        const hasExecutionCapacity = Boolean(
          normalizedExecutionCapacity.concurrent_projects ||
            normalizedExecutionCapacity.annual_beneficiaries ||
            normalizedExecutionCapacity.delivery_model ||
            normalizedExecutionCapacity.notes
        )

        if (ngoVolunteerCapacity) {
          const parsedCapacity = Number(String(ngoVolunteerCapacity).replace(/[^0-9]/g, ''))
          profileData.ngo_volunteer_capacity = parsedCapacity
        }

        profileData.location = buildNgoLocationDisplay(headquarters)
        profileData.profile_data.sector = sectorsScheduleVii[0] || undefined
        if (foundedYear) profileData.profile_data.founded = parseInt(foundedYear)
        profileData.profile_data.ngo_name = editableName || user?.name
        profileData.profile_data.registration_date = registrationDate
        profileData.profile_data.sectors_schedule_vii = sectorsScheduleVii
        profileData.profile_data.geographic_coverage = normalizedGeographicCoverage
        profileData.profile_data.execution_capacity = hasExecutionCapacity
          ? normalizedExecutionCapacity
          : null
        profileData.profile_data.ngo_headquarters = headquarters
        profileData.profile_data.team_strength = String(ngoVolunteerCapacity).trim()
        profileData.profile_data.twelve_a_number = twelveANumber.trim()
        profileData.profile_data.eighty_g_number = eightyGNumber.trim()
        profileData.profile_data.csr1_registration_number = csr1RegistrationNumber.trim()
        profileData.profile_data.compliance_documents = complianceDocuments
        if (ngoVolunteerCapacity) {
          profileData.profile_data.ngo_volunteer_capacity = Number(
            String(ngoVolunteerCapacity).replace(/[^0-9]/g, '')
          )
        }
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
      setComplianceDocuments(
        user.user_type === 'ngo'
          ? complianceDocuments
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
            <div className="overflow-hidden rounded-lg border pb-4">
              <div className="relative">
                <ProfileCoverMedia src={coverImageUrl} className="h-36 w-full sm:h-44" alt="Cover photo" />
                <div className="absolute bottom-3 right-3 flex gap-2">
                  <label className="cursor-pointer">
                    <span className="inline-flex h-9 items-center gap-2 rounded-md border border-white/30 bg-black/45 px-3 text-xs font-medium text-white hover:bg-black/60">
                      <Camera className="h-3.5 w-3.5" />
                      {uploadingCoverImage ? 'Uploading...' : coverImageUrl ? 'Change cover' : 'Add cover'}
                    </span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => {
                        const file = e.target.files?.[0]
                        if (file) void handleCoverImageUpload(file)
                      }}
                      className="hidden"
                      disabled={uploadingCoverImage}
                    />
                  </label>
                  {coverImageUrl ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-9 border-white/30 bg-black/45 text-xs text-white hover:bg-black/60 hover:text-white"
                      onClick={() => void handleRemoveCoverImage()}
                      disabled={uploadingCoverImage}
                    >
                      Remove
                    </Button>
                  ) : null}
                </div>
              </div>
              <div className="flex flex-col items-start gap-3 px-4">
                <div className="-mt-12 relative">
                  <div className="h-24 w-24 overflow-hidden rounded-full border-4 border-white bg-white shadow-sm">
                    {profileImageUrl ? (
                      <img src={profileImageUrl} alt="Profile" className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center bg-udaan-orange text-xl font-semibold text-white">
                        {user?.name ? user.name.split(' ').map((n) => n[0]).join('').toUpperCase() : 'U'}
                      </div>
                    )}
                  </div>
                </div>
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

            <div>
              <Label>Phone Number</Label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+91 9876543210" type="tel" />
            </div>

            {user.user_type === 'ngo' ? (
              <>
                <p className="text-sm text-muted-foreground">
                  Keep your NGO headquarters address, city, state, and pincode accurate so CSR campaigns and company matches can recommend you correctly.
                </p>
                <div className="space-y-4 rounded-lg border p-4">
                  <div>
                    <Label>Registered office address</Label>
                    <Textarea
                      value={addressLine}
                      onChange={(e) => setAddressLine(e.target.value)}
                      placeholder="Building, street, locality"
                      rows={2}
                    />
                  </div>
                  <div>
                    <Label>Headquarters city / town</Label>
                    <Input value={city} onChange={(e) => setCity(e.target.value)} placeholder="e.g., Pune, Guwahati" />
                  </div>
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                    <div>
                      <Label>Country</Label>
                      <Select
                        value={country}
                        onValueChange={(value) => {
                          setCountry(value)
                          if (value !== 'India') {
                            setStateProvince('')
                          }
                        }}
                      >
                        <SelectTrigger><SelectValue placeholder="Select country" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="India">India</SelectItem>
                          <SelectItem value="Bangladesh">Bangladesh</SelectItem>
                          <SelectItem value="Nepal">Nepal</SelectItem>
                          <SelectItem value="Sri Lanka">Sri Lanka</SelectItem>
                          <SelectItem value="Pakistan">Pakistan</SelectItem>
                          <SelectItem value="Other">Other</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    {country === 'India' ? (
                      <div>
                        <Label>State / UT</Label>
                        <Select
                          value={stateProvince || 'unset'}
                          onValueChange={(value) => setStateProvince(value === 'unset' ? '' : value)}
                        >
                          <SelectTrigger><SelectValue placeholder="Select state or UT" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="unset">Select state or UT</SelectItem>
                            {INDIAN_STATES_AND_UTS.map((stateName) => (
                              <SelectItem key={stateName} value={stateName}>{stateName}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    ) : (
                      <div>
                        <Label>State/Province</Label>
                        <Input value={stateProvince} onChange={(e) => setStateProvince(e.target.value)} placeholder="State or province" />
                      </div>
                    )}
                    <div>
                      <Label>Pincode</Label>
                      <Input
                        value={pincode}
                        onChange={(e) => setPincode(e.target.value.replace(/[^\d]/g, '').slice(0, country === 'India' ? 6 : 10))}
                        placeholder={country === 'India' ? '6-digit pincode' : 'Postal code'}
                      />
                    </div>
                  </div>
                </div>
              </>
            ) : user.user_type === 'company' ? (
              <>
                <p className="text-sm text-muted-foreground">
                  Keep your registered office address, city, state, and pincode accurate for CSR matching and regional recommendations.
                </p>
                <div className="space-y-4 rounded-lg border p-4">
                  <div>
                    <Label>Registered office address</Label>
                    <Textarea
                      value={addressLine}
                      onChange={(e) => setAddressLine(e.target.value)}
                      placeholder="Building, street, locality"
                      rows={2}
                    />
                  </div>
                  <div>
                    <Label>Headquarters city / town</Label>
                    <Input value={city} onChange={(e) => setCity(e.target.value)} placeholder="e.g., Pune, Mumbai" />
                  </div>
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                    <div>
                      <Label>Country</Label>
                      <Select
                        value={country}
                        onValueChange={(value) => {
                          setCountry(value)
                          if (value !== 'India') {
                            setStateProvince('')
                          }
                        }}
                      >
                        <SelectTrigger><SelectValue placeholder="Select country" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="India">India</SelectItem>
                          <SelectItem value="Bangladesh">Bangladesh</SelectItem>
                          <SelectItem value="Nepal">Nepal</SelectItem>
                          <SelectItem value="Sri Lanka">Sri Lanka</SelectItem>
                          <SelectItem value="Pakistan">Pakistan</SelectItem>
                          <SelectItem value="Other">Other</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    {country === 'India' ? (
                      <div>
                        <Label>State / UT</Label>
                        <Select
                          value={stateProvince || 'unset'}
                          onValueChange={(value) => setStateProvince(value === 'unset' ? '' : value)}
                        >
                          <SelectTrigger><SelectValue placeholder="Select state or UT" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="unset">Select state or UT</SelectItem>
                            {INDIAN_STATES_AND_UTS.map((stateName) => (
                              <SelectItem key={stateName} value={stateName}>{stateName}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    ) : (
                      <div>
                        <Label>State/Province</Label>
                        <Input value={stateProvince} onChange={(e) => setStateProvince(e.target.value)} placeholder="State or province" />
                      </div>
                    )}
                    <div>
                      <Label>Pincode</Label>
                      <Input
                        value={pincode}
                        onChange={(e) => setPincode(e.target.value.replace(/[^\d]/g, '').slice(0, country === 'India' ? 6 : 10))}
                        placeholder={country === 'India' ? '6-digit pincode' : 'Postal code'}
                      />
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <>
                <div>
                  <Label>City</Label>
                  <Input value={city} onChange={(e) => setCity(e.target.value)} placeholder="e.g., Mumbai, Delhi" />
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
              </>
            )}

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

                <div className="space-y-3 rounded-lg border p-4">
                  <div>
                    <h4 className="text-sm font-semibold">CSR Program Details</h4>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Optional details that help with CSR matching.
                    </p>
                  </div>

                  <div>
                    <Label>
                      Focus Areas (Schedule VII){' '}
                      <span className="font-normal text-muted-foreground">(optional)</span>
                    </Label>
                    <MultiSelectDropdown
                      value={focusAreasScheduleVii}
                      options={CSR_SCHEDULE_VII_CATEGORIES}
                      placeholder="Select Schedule VII focus areas"
                      onValueChange={setFocusAreasScheduleVii}
                    />
                  </div>

                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div>
                      <Label>
                        Implementation Model{' '}
                        <span className="font-normal text-muted-foreground">(optional)</span>
                      </Label>
                      <Select
                        value={implementationModel || 'unset'}
                        onValueChange={(value) => setImplementationModel(value === 'unset' ? '' : value)}
                      >
                        <SelectTrigger><SelectValue placeholder="Select implementation model" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="unset">Select implementation model</SelectItem>
                          {COMPANY_CSR_IMPLEMENTATION_MODELS.map((option) => (
                            <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>
                        Governance Mechanism{' '}
                        <span className="font-normal text-muted-foreground">(optional)</span>
                      </Label>
                      <Select
                        value={governanceMechanism || 'unset'}
                        onValueChange={(value) => setGovernanceMechanism(value === 'unset' ? '' : value)}
                      >
                        <SelectTrigger><SelectValue placeholder="Select governance mechanism" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="unset">Select governance mechanism</SelectItem>
                          {COMPANY_CSR_GOVERNANCE_MECHANISMS.map((option) => (
                            <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div>
                    <Label>Net Worth <span className="font-normal text-muted-foreground">(optional)</span></Label>
                    <Input value={netWorth} onChange={(e) => setNetWorth(e.target.value)} placeholder="e.g. INR 120 Cr" />
                  </div>
                  <div>
                    <Label>Turnover <span className="font-normal text-muted-foreground">(optional)</span></Label>
                    <Input value={turnover} onChange={(e) => setTurnover(e.target.value)} placeholder="e.g. INR 450 Cr" />
                  </div>
                </div>
                <div>
                  <Label>Net Profit <span className="font-normal text-muted-foreground">(optional)</span></Label>
                  <Input value={netProfit} onChange={(e) => setNetProfit(e.target.value)} placeholder="e.g. INR 35 Cr" />
                </div>
                <div>
                  <Label>CSR Vision <span className="font-normal text-muted-foreground">(optional)</span></Label>
                  <Textarea value={csrVision} onChange={(e) => setCsrVision(e.target.value)} placeholder="Describe your long-term CSR vision" rows={3} />
                </div>
                </div>
              </>
            )}

            {user.user_type === 'ngo' && (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label>Exact volunteer capacity</Label>
                    <div className="flex gap-2">
                      <Input type="number" min="0" placeholder="e.g., 42" value={ngoVolunteerCapacity} onChange={(e) => setNgoVolunteerCapacity(e.target.value)} />
                      <span className="text-sm text-gray-600 self-center">people</span>
                    </div>
                  </div>
                  <div>
                    <Label>Founded Year</Label>
                    <Input type="number" min="1800" max={new Date().getFullYear()} placeholder="e.g., 2010" value={foundedYear} onChange={(e) => setFoundedYear(e.target.value)} />
                  </div>
                </div>
                <div>
                  <Label>Registration Date</Label>
                  <Input type="date" value={registrationDate} onChange={(e) => setRegistrationDate(e.target.value)} />
                </div>

                <div>
                  <Label>Sectors Worked (Schedule VII)</Label>
                  <MultiSelectDropdown
                    value={sectorsScheduleVii}
                    options={CSR_SCHEDULE_VII_CATEGORIES}
                    placeholder="Select Schedule VII sectors"
                    onValueChange={setSectorsScheduleVii}
                  />
                </div>

                <div className="space-y-3">
                  <div>
                    <Label>Geographic Coverage <span className="font-normal text-muted-foreground">(optional)</span></Label>
                    <p className="mt-1 text-xs text-muted-foreground">Add each region where you operate.</p>
                  </div>
                  {geographicCoverageAreas.map((area, index) => (
                    <div key={`profile-geo-area-${index}`} className="space-y-3 rounded-lg border bg-slate-50/60 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-medium">Coverage area {index + 1}</p>
                        {geographicCoverageAreas.length > 1 ? (
                          <Button type="button" variant="ghost" size="sm" className="h-8 px-2 text-red-600" onClick={() => removeGeographicArea(index)}>
                            Remove
                          </Button>
                        ) : null}
                      </div>
                      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        <div>
                          <Label>Region <span className="font-normal text-muted-foreground">(optional)</span></Label>
                          <Input value={area.region} onChange={(e) => updateGeographicArea(index, 'region', e.target.value)} />
                        </div>
                        <div>
                          <Label>State / UT</Label>
                          <Input value={area.state} onChange={(e) => updateGeographicArea(index, 'state', e.target.value)} />
                        </div>
                        <div>
                          <Label>District <span className="font-normal text-muted-foreground">(optional)</span></Label>
                          <Input value={area.district} onChange={(e) => updateGeographicArea(index, 'district', e.target.value)} />
                        </div>
                        <div>
                          <Label>Area type <span className="font-normal text-muted-foreground">(optional)</span></Label>
                          <Select
                            value={area.area_type || 'unset'}
                            onValueChange={(value) => updateGeographicArea(index, 'area_type', value === 'unset' ? '' : value)}
                          >
                            <SelectTrigger><SelectValue placeholder="Select area type" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="unset">Not specified</SelectItem>
                              <SelectItem value="urban">Urban</SelectItem>
                              <SelectItem value="rural">Rural</SelectItem>
                              <SelectItem value="both">Urban & rural</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    </div>
                  ))}
                  <Button type="button" variant="outline" size="sm" onClick={addGeographicArea}>Add another coverage area</Button>
                </div>

                <div className="space-y-3">
                  <div>
                    <Label>Execution Capacity <span className="font-normal text-muted-foreground">(optional)</span></Label>
                  </div>
                  <div className="space-y-4 rounded-lg border bg-slate-50/60 p-4">
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                      <div>
                        <Label>Max concurrent projects</Label>
                        <Input
                          value={executionCapacity.concurrent_projects}
                          onChange={(e) => updateExecutionCapacityField('concurrent_projects', e.target.value.replace(/[^\d]/g, ''))}
                          inputMode="numeric"
                          placeholder="e.g. 5"
                        />
                      </div>
                      <div>
                        <Label>Annual beneficiaries</Label>
                        <Input
                          value={executionCapacity.annual_beneficiaries}
                          onChange={(e) => updateExecutionCapacityField('annual_beneficiaries', e.target.value.replace(/[^\d]/g, ''))}
                          inputMode="numeric"
                          placeholder="e.g. 10000"
                        />
                      </div>
                      <div className="md:col-span-2">
                        <Label>Delivery model</Label>
                        <Select
                          value={executionCapacity.delivery_model || 'unset'}
                          onValueChange={(value) => updateExecutionCapacityField('delivery_model', value === 'unset' ? '' : value)}
                        >
                          <SelectTrigger><SelectValue placeholder="Select delivery model" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="unset">Not specified</SelectItem>
                            <SelectItem value="direct">Direct delivery</SelectItem>
                            <SelectItem value="partner_led">Partner-led</SelectItem>
                            <SelectItem value="hybrid">Hybrid (direct + partners)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="md:col-span-2">
                        <Label>Additional notes</Label>
                        <Textarea
                          value={executionCapacity.notes}
                          onChange={(e) => updateExecutionCapacityField('notes', e.target.value)}
                          rows={2}
                          placeholder="Partner network, reporting cadence, or other capacity details"
                        />
                      </div>
                    </div>
                  </div>
                </div>

              </>
            )}

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

      </div>
    </div>
  )
}

const PAYMENT_SOURCE_BADGE_CLASS: Record<string, string> = {
  ngo_network: 'bg-violet-50 text-violet-700 hover:bg-violet-50',
  service_request: 'bg-emerald-50 text-emerald-700 hover:bg-emerald-50',
  service_offer: 'bg-blue-50 text-blue-700 hover:bg-blue-50',
  engagement_settlement: 'bg-amber-50 text-amber-700 hover:bg-amber-50',
  company_ca: 'bg-slate-100 text-slate-700 hover:bg-slate-100',
  razorpay: 'bg-slate-100 text-slate-700 hover:bg-slate-100',
}

function formatPaymentInr(value: number) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(value)
}

function formatPaymentDate(value: string | null) {
  if (!value) return '—'
  return new Date(value).toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function PaymentHistoryPanel({
  role,
  title,
  description,
  emptyMessage,
}: {
  role: 'sent' | 'received'
  title: string
  description: string
  emptyMessage: string
}) {
  const [loading, setLoading] = useState(true)
  const [payments, setPayments] = useState<
    Array<{
      id: number | string
      razorpay_payment_id: string
      amount_inr: number
      payment_status: string
      paid_at: string | null
      service_request_title: string
      source: string
      source_label: string
      counterparty_name: string
    }>
  >([])
  const [fines, setFines] = useState<
    Array<{
      campaign_id: string
      campaign_title?: string | null
      service_offer_id: number
      material_total_worth_inr?: number
      base_amount_inr?: number
      pending_total_inr: number
      accrued_fine_inr?: number
      due_cleared_by?: string | null
      status: string
      reason?: string | null
    }>
  >([])

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true)
        const token = localStorage.getItem('token')
        if (!token) {
          setPayments([])
          return
        }

        const response = await fetch(`/api/users?view=payment-history&role=${role}`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        const payload = await response.json()
        setPayments(response.ok && payload.success ? payload.data || [] : [])
        setFines(response.ok && payload.success && role === 'sent' ? payload.fines || [] : [])
      } catch {
        setPayments([])
        setFines([])
      } finally {
        setLoading(false)
      }
    }

    void load()
  }, [role])

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        {role === 'sent' && fines.length > 0 ? (
          <div className="mb-6 space-y-3">
            <p className="text-sm font-medium text-red-700">Outstanding CSR capability penalties</p>
            {fines.map((fine) => (
              <div key={`${fine.campaign_id}-${fine.service_offer_id}`} className="rounded-lg border border-red-200 bg-red-50/70 p-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="font-medium text-slate-900">{fine.campaign_title || 'CSR campaign'}</p>
                    <p className="text-sm text-muted-foreground">Offer #{fine.service_offer_id}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{fine.reason || 'Material return / dispatch penalty'}</p>
                    {fine.due_cleared_by ? (
                      <p className="mt-1 text-xs text-red-700">Clear by {formatPaymentDate(fine.due_cleared_by)} or account may be suspended</p>
                    ) : null}
                  </div>
                  <div className="text-left sm:text-right">
                    <p className="text-lg font-semibold text-red-700">{formatPaymentInr(Number(fine.pending_total_inr || 0))}</p>
                    <p className="text-xs text-muted-foreground">
                      Material worth {formatPaymentInr(Number(fine.material_total_worth_inr || fine.base_amount_inr || 0))}
                      {Number(fine.accrued_fine_inr || 0) > 0 ? ` · incl. ${formatPaymentInr(Number(fine.accrued_fine_inr))} fine` : ''}
                    </p>
                    <Badge variant="outline" className="mt-2 capitalize">{fine.status}</Badge>
                  </div>
                </div>
              </div>
            ))}
            <p className="text-xs text-muted-foreground">Unpaid penalties accrue 2% daily on the pending balance. After 10 days overdue, company accounts are suspended.</p>
          </div>
        ) : null}
        {loading ? (
          <div className="space-y-3">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : payments.length === 0 ? (
          <p className="text-sm text-muted-foreground">{emptyMessage}</p>
        ) : (
          <div className="space-y-3">
            {payments.map((payment) => (
              <div key={payment.id} className="rounded-lg border p-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="font-medium text-slate-900">{payment.service_request_title}</p>
                    <p className="text-sm text-muted-foreground">
                      {role === 'sent' ? 'Paid to' : 'Received from'} {payment.counterparty_name}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">{formatPaymentDate(payment.paid_at)}</p>
                    {payment.razorpay_payment_id ? (
                      <p className="mt-1 text-[11px] text-muted-foreground">Ref: {payment.razorpay_payment_id}</p>
                    ) : null}
                  </div>
                  <div className="flex flex-col items-start gap-2 sm:items-end">
                    <p className="text-lg font-semibold text-emerald-700">{formatPaymentInr(payment.amount_inr)}</p>
                    <div className="flex flex-wrap gap-2">
                      <Badge variant="outline">{payment.payment_status}</Badge>
                      <Badge className={PAYMENT_SOURCE_BADGE_CLASS[payment.source] || PAYMENT_SOURCE_BADGE_CLASS.razorpay}>
                        {payment.source_label || 'Razorpay payment'}
                      </Badge>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

type PlatformPaymentSummaryProps = {
  baseAmountInr: number
  className?: string
  paymentKind?: string | null
}

export function PlatformPaymentSummary({ baseAmountInr, className = '', paymentKind }: PlatformPaymentSummaryProps) {
  const pricing = calculatePlatformCheckoutPricing(baseAmountInr, { paymentKind })

  if (pricing.baseAmountInr <= 0) {
    return null
  }

  return (
    <div className={`rounded-md border bg-slate-50 p-3 text-sm ${className}`.trim()}>
      <div className="flex items-center justify-between gap-3">
        <span className="text-muted-foreground">NGO receives</span>
        <span className="font-medium tabular-nums">{formatInr(pricing.baseAmountInr)}</span>
      </div>
      <div className="mt-1 flex items-center justify-between gap-3">
        <span className="text-muted-foreground">Platform fee ({pricing.platformFeePercent}%)</span>
        <span className="tabular-nums">{formatInr(pricing.platformFeeInr)}</span>
      </div>
      {pricing.gstOnPlatformFeeInr > 0 ? (
        <div className="mt-1 flex items-center justify-between gap-3">
          <span className="text-muted-foreground">GST on platform fee ({pricing.gstRatePercent}%)</span>
          <span className="tabular-nums">{formatInr(pricing.gstOnPlatformFeeInr)}</span>
        </div>
      ) : null}
      <div className="mt-2 flex items-center justify-between gap-3 border-t pt-2 font-medium">
        <span>Total you pay</span>
        <span className="tabular-nums">{formatInr(pricing.totalChargeInr)}</span>
      </div>
    </div>
  )
}

export function getTotalChargeLabel(baseAmountInr: number, paymentKind?: string | null): string {
  const pricing = calculatePlatformCheckoutPricing(baseAmountInr, { paymentKind })
  return formatInr(pricing.totalChargeInr)
}

export type NgoPayTarget = {
  id: number
  name: string
  email?: string | null
}

function parseNgoPayAmountToInr(value: string) {
  const normalized = value.replace(/,/g, '').trim()
  const amount = Number(normalized)
  return Number.isFinite(amount) ? amount : 0
}

export function NgoPayDialog({
  ngo,
  open,
  onOpenChange,
}: {
  ngo: NgoPayTarget | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { user } = useAuth()
  const { toast: notify } = useToast()
  const [paymentAmount, setPaymentAmount] = useState('')
  const [paying, setPaying] = useState(false)

  const close = () => {
    onOpenChange(false)
    setPaymentAmount('')
  }

  const handlePay = async () => {
    if (!ngo || !user) return

    const token = localStorage.getItem('token')
    if (!token) {
      notify({
        title: 'Sign in required',
        description: 'Log in as a company or individual to pay NGOs.',
        variant: 'destructive',
      })
      return
    }

    const requestedInr = parseNgoPayAmountToInr(paymentAmount)
    if (requestedInr <= 0) {
      notify({
        title: 'Invalid amount',
        description: 'Enter a valid contribution amount in INR.',
        variant: 'destructive',
      })
      return
    }

    setPaying(true)
    try {
      const orderRes = await fetch('/api/ngos/network', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ action: 'create-order', ngoId: ngo.id, amount: requestedInr }),
      })

      const orderPayload = await orderRes.json()
      if (!orderRes.ok || !orderPayload?.success) {
        notify({
          title: 'Unable to start payment',
          description: orderPayload?.error || 'Failed to create payment order',
          variant: 'destructive',
        })
        return
      }

      const orderData = orderPayload.data
      const activeNgo = ngo

      await openRazorpayCheckout({
        keyId: orderData.keyId,
        orderId: orderData.orderId,
        amountInr: Number(orderData.totalCharge || orderData.amount),
        currency: orderData.currency,
        description: `Support for ${activeNgo.name}`,
        prefill: {
          name: user.name || '',
          email: user.email || '',
        },
        onBeforeOpen: () => {
          onOpenChange(false)
        },
        onDismiss: () => {
          close()
        },
        onSuccess: async (response) => {
          const verifyRes = await fetch('/api/ngos/network', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              action: 'verify',
              ngoId: activeNgo.id,
              ...response,
            }),
          })

          const verifyPayload = await verifyRes.json()
          if (!verifyRes.ok || !verifyPayload?.success) {
            notify({
              title: 'Payment verification failed',
              description: verifyPayload?.error || 'Please contact support with your payment reference.',
              variant: 'destructive',
            })
            return
          }

          notify({
            title: 'Payment successful',
            description: verifyPayload?.data?.message || `Your support for ${activeNgo.name} was recorded.`,
          })
          close()
        },
        onFailure: (error) => {
          notify({
            title: 'Payment failed',
            description: error.description || error.reason || 'Payment could not be completed.',
            variant: 'destructive',
          })
        },
      })
    } catch (error) {
      notify({
        title: 'Payment failed',
        description: error instanceof Error ? error.message : 'Could not open checkout.',
        variant: 'destructive',
      })
    } finally {
      setPaying(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? onOpenChange(true) : close())}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Pay {ngo?.name || 'NGO'}</DialogTitle>
          <DialogDescription>
            Send direct support. You can also contact the NGO at{' '}
            {ngo?.email ? (
              <a href={`mailto:${ngo.email}`} className="font-medium text-emerald-700 hover:underline">
                {ngo.email}
              </a>
            ) : (
              'their profile email'
            )}{' '}
            before or after paying.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 py-2">
          <Label htmlFor="ngo-payment-amount">NGO support amount (INR)</Label>
          <Input
            id="ngo-payment-amount"
            inputMode="decimal"
            placeholder="e.g. 1000"
            value={paymentAmount}
            onChange={(event) => setPaymentAmount(event.target.value)}
            disabled={paying}
          />
          <PlatformPaymentSummary baseAmountInr={parseNgoPayAmountToInr(paymentAmount)} />
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={close} disabled={paying}>
            Cancel
          </Button>
          <Button type="button" onClick={handlePay} disabled={paying || parseNgoPayAmountToInr(paymentAmount) <= 0}>
            {paying ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Processing...
              </>
            ) : (
              `Pay ${getTotalChargeLabel(parseNgoPayAmountToInr(paymentAmount))}`
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default ProfileDashboardTab
