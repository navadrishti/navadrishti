"use client"

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Loader2, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  normalizeIfsc,
  sanitizePayoutAccountInput,
  validateNgoPayoutAccount,
  type NgoPayoutAccount,
  type NgoRazorpayLinkStatus,
} from '@/lib/utils'

type PayoutAccountResponse = {
  payoutAccount: NgoPayoutAccount | null
  canConnect?: boolean
  bankDetailsSummary: string | null
  linkStatus: NgoRazorpayLinkStatus
  linkedAccountId: string | null
  linkError: string | null
  linkUpdatedAt: string | null
  hasPayoutDetails: boolean
  acceptsPayments?: boolean
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

function isPayoutConnected(status: NgoRazorpayLinkStatus): boolean {
  return status === 'active'
}

function payoutLinkStatusLabel(status: NgoRazorpayLinkStatus): string {
  return isPayoutConnected(status) ? 'Connected' : 'Disconnected'
}

function payoutLinkStatusVariant(status: NgoRazorpayLinkStatus): 'default' | 'secondary' | 'destructive' | 'outline' {
  return isPayoutConnected(status) ? 'default' : 'secondary'
}

function payoutPanelDescription(userType: 'ngo' | 'individual' | 'company'): string {
  if (userType === 'ngo') {
    return 'Connect your payout account to receive donations and to list capabilities that settle to your account. NGO Network listing only requires verification.'
  }
  if (userType === 'individual') {
    return 'You must connect your payout account before listing capabilities so you can receive merchant payouts. You do not need this to donate to NGOs.'
  }
  return 'You must connect your payout account before listing capabilities so you can receive merchant payouts. You do not need this to pay NGOs.'
}

function payoutDisconnectedHelper(userType: 'ngo' | 'individual' | 'company'): string {
  if (userType === 'ngo') {
    return 'Connect account to receive donations and list capabilities'
  }
  if (userType === 'individual') {
    return 'Connect account to list capabilities and receive payouts'
  }
  return 'Connect account to list capabilities and receive merchant payouts'
}

export function PayoutAccountPanel({ userType }: { userType: 'ngo' | 'individual' | 'company' }) {
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
  const connected = isPayoutConnected(linkStatus)
  const showReconnect = linkStatus === 'needs_reconnect' || linkStatus === 'failed' || linkStatus === 'not_started' || linkStatus === 'pending'
  const canConnect = Boolean(status?.canConnect)
  const maskedSavedAccount = status?.payoutAccount?.account_number

  return (
    <div className="space-y-4 rounded-lg border p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h4 className="text-sm font-semibold">Payout Bank Account</h4>
          <p className="mt-1 text-xs text-muted-foreground">
            {payoutPanelDescription(userType)}
          </p>
        </div>
        <Badge variant={payoutLinkStatusVariant(linkStatus)}>{payoutLinkStatusLabel(linkStatus)}</Badge>
      </div>

      {!connected ? (
        <p className="text-xs text-muted-foreground">{payoutDisconnectedHelper(userType)}</p>
      ) : null}

      {status?.linkError ? (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-xs text-red-700">
          {status.linkError}
        </div>
      ) : null}

      {linkStatus === 'needs_reconnect' ? (
        <p className="text-xs text-muted-foreground">
          Bank details changed. Save the form and reconnect so your payout account can verify the updated details.
        </p>
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
              {showReconnect ? 'Connect payout account' : 'Refresh payout status'}
            </>
          )}
        </Button>
      </div>
      {!canConnect ? (
        <p className="text-xs text-muted-foreground">Save payout details first, then connect your payout account.</p>
      ) : null}
    </div>
  )
}
