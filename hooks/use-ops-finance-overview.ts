'use client'

import { useCallback, useEffect, useState } from 'react'
import { clientAuthHeaders } from '@/lib/client-session'
import type {
  PortfolioOpsFinanceRollup,
  ProjectOpsFinanceRow,
} from '@/lib/dashboard/ops-finance-presentation'

export type OpsFinanceOverviewPayload = {
  scope: 'portfolio'
  project_cap: number
  truncated: boolean
  expense_table_available: boolean
  material_table_available: boolean
  portfolio: PortfolioOpsFinanceRollup
  projects: ProjectOpsFinanceRow[]
}

export function useOpsFinanceOverview(enabled: boolean) {
  const [data, setData] = useState<OpsFinanceOverviewPayload | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    if (!enabled) return
    setLoading(true)
    setError(null)
    try {
      const response = await fetch('/api/csr-projects/ops-overview', {
        headers: clientAuthHeaders(),
        credentials: 'include',
      })
      const json = await response.json().catch(() => ({}))
      if (!response.ok || !json?.success) {
        throw new Error(json?.error || 'Failed to load ops finance overview')
      }
      setData(json.data as OpsFinanceOverviewPayload)
    } catch (err) {
      setData(null)
      setError(err instanceof Error ? err.message : 'Failed to load ops finance overview')
    } finally {
      setLoading(false)
    }
  }, [enabled])

  useEffect(() => {
    void reload()
  }, [reload])

  return { data, loading, error, reload }
}
