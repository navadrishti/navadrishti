'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { clientAuthHeaders } from '@/lib/client-session'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Button } from '@/components/ui/button'

export type EvidenceVerifierOption = {
  id: string
  ca_id?: string | null
  status: string
  users?: { id?: number; name?: string | null; email?: string | null } | null
}

export function EvidenceVerifierSelect({
  enabled,
  value,
  onChange,
  disabled,
}: {
  enabled: boolean
  value: string
  onChange: (identityId: string, option: EvidenceVerifierOption | null) => void
  disabled?: boolean
}) {
  const [options, setOptions] = useState<EvidenceVerifierOption[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        const response = await fetch('/api/evidence-verification/accounts', {
          credentials: 'include',
          headers: clientAuthHeaders(),
        })
        const payload = await response.json().catch(() => null)
        if (!response.ok || !payload?.success) {
          if (!cancelled) setError('Could not load Evidence Verifiers.')
          return
        }
        const rows = (Array.isArray(payload.data) ? payload.data : []).filter(
          (row: EvidenceVerifierOption) => String(row.status).toLowerCase() === 'active'
        )
        if (!cancelled) setOptions(rows)
      } catch {
        if (!cancelled) setError('Could not load Evidence Verifiers.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [enabled])

  if (!enabled) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-600">
        Finalize the Lead NGO first. Evidence Verifier assignment unlocks after a lead NGO accepts.
      </div>
    )
  }

  const selected = options.find((row) => row.id === value) || null

  return (
    <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
      <div>
        <h4 className="text-sm font-semibold text-slate-900">Evidence Verifier</h4>
        <p className="mt-1 text-xs text-slate-600">
          Required before publish. Choose an active Evidence Verifier from Team Management. They will
          only access this project after assignment.
        </p>
      </div>

      {error ? <p className="text-sm text-rose-700">{error}</p> : null}

      {loading ? (
        <p className="text-sm text-slate-600">Loading Evidence Verifiers…</p>
      ) : options.length === 0 ? (
        <div className="space-y-2 text-sm text-amber-900">
          <p>No active Evidence Verifiers are available.</p>
          <Button asChild size="sm" variant="outline">
            <Link href="/companies/dashboard?tab=team">Open Team Management</Link>
          </Button>
        </div>
      ) : (
        <div className="space-y-1">
          <Label htmlFor="evidence-verifier-select">Assign Evidence Verifier</Label>
          <Select
            value={value || undefined}
            onValueChange={(next) => {
              const option = options.find((row) => row.id === next) || null
              onChange(next === '__none' ? '' : next, option)
            }}
            disabled={disabled}
          >
            <SelectTrigger
              id="evidence-verifier-select"
              className="h-10 w-full border-slate-200 bg-white text-sm"
            >
              <SelectValue placeholder="Select Evidence Verifier…">
                {selected
                  ? selected.users?.name || selected.users?.email || 'Selected verifier'
                  : undefined}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {options.map((option) => (
                <SelectItem key={option.id} value={option.id} textValue={option.users?.name || ''}>
                  <span className="flex flex-col text-left">
                    <span className="font-medium">{option.users?.name || 'Evidence Verifier'}</span>
                    <span className="text-[11px] text-slate-500">
                      {option.users?.email || 'No email'}
                      {option.ca_id ? ` · ${option.ca_id}` : ''}
                    </span>
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  )
}
