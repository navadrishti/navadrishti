'use client'

import { useCallback, useEffect, useState } from 'react'
import { clientAuthHeaders } from '@/lib/client-session'

type PayoutConnectionState = {
  loading: boolean
  connected: boolean | null
  hasPayoutDetails: boolean | null
  refresh: () => Promise<void>
}

export function usePayoutConnection(enabled = true): PayoutConnectionState {
  const [loading, setLoading] = useState(Boolean(enabled))
  const [connected, setConnected] = useState<boolean | null>(null)
  const [hasPayoutDetails, setHasPayoutDetails] = useState<boolean | null>(null)

  const refresh = useCallback(async () => {
    if (!enabled) {
      setLoading(false)
      setConnected(null)
      setHasPayoutDetails(null)
      return
    }

    setLoading(true)
    try {
      const response = await fetch('/api/profile/update?scope=payout', {
        credentials: 'include',
        headers: clientAuthHeaders(),
      })
      const data = await response.json()
      if (!response.ok) {
        if (response.status === 401) {
          setConnected(false)
          setHasPayoutDetails(false)
          return
        }
        setConnected(null)
        setHasPayoutDetails(null)
        return
      }
      setConnected(Boolean(data.acceptsPayments ?? data.routeReady))
      setHasPayoutDetails(Boolean(data.hasPayoutDetails))
    } catch {
      setConnected(null)
      setHasPayoutDetails(null)
    } finally {
      setLoading(false)
    }
  }, [enabled])

  useEffect(() => {
    void refresh()
  }, [refresh])

  return { loading, connected, hasPayoutDetails, refresh }
}

export function dashboardProfilePayoutHref(userType?: string | null): string {
  if (userType === 'company') return '/companies/dashboard?tab=profile#ngo-payout-bank-section'
  if (userType === 'individual') return '/individuals/dashboard?tab=profile#ngo-payout-bank-section'
  return '/ngos/dashboard?tab=profile#ngo-payout-bank-section'
}
