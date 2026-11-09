'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { formatStatusLabel } from '@/lib/format-date'
import { InfoMeter, InfoMeterGrid, meterPercent } from '@/components/info-meter'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { clientAuthHeaders, getClientSessionToken } from '@/lib/client-session'
import { readApiError } from '@/lib/user-facing-error'
import { toast } from 'sonner'
import type { FieldOfficerIdentity } from './types'
import { officerDisplayName } from './types'

type DeviceAssignee = { id: number; name: string | null; email: string | null } | null

type FieldDevice = {
  id: string
  device_id: string
  ngo_user_id: number
  assigned_user_id: number | null
  device_label: string | null
  platform: string | null
  app_version: string | null
  status: string
  registered_at: string | null
  last_seen_at: string | null
  revoked_at: string | null
  assignee?: DeviceAssignee
}

function formatWhen(value: string | null | undefined) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function deviceState(device: FieldDevice): 'revoked' | 'assigned' | 'unassigned' | 'active' {
  if (String(device.status).toLowerCase() === 'revoked' || device.revoked_at) return 'revoked'
  if (device.assigned_user_id != null) return 'assigned'
  return 'unassigned'
}

export function FieldDevicesPanel({
  officers,
  verified,
}: {
  officers: FieldOfficerIdentity[]
  verified: boolean
}) {
  const [devices, setDevices] = useState<FieldDevice[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'assigned' | 'unassigned' | 'revoked'>(
    'all'
  )
  const [registerId, setRegisterId] = useState('')
  const [registerLabel, setRegisterLabel] = useState('')
  const [registering, setRegistering] = useState(false)
  const [mutatingId, setMutatingId] = useState<string | null>(null)
  const [bindSelections, setBindSelections] = useState<Record<string, string>>({})

  const authHeaders = useCallback(() => {
    const token = getClientSessionToken()
    return {
      ...clientAuthHeaders({ 'Content-Type': 'application/json' }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    }
  }, [])

  const fetchDevices = useCallback(async () => {
    if (!verified) {
      setDevices([])
      return
    }
    try {
      setLoading(true)
      setError(null)
      const response = await fetch('/api/ngo/field-devices', {
        credentials: 'include',
        headers: clientAuthHeaders(),
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok || !payload?.success) {
        setDevices([])
        setError(readApiError(payload, 'Unable to load field devices.'))
        return
      }
      setDevices(Array.isArray(payload.data) ? payload.data : [])
    } catch {
      setDevices([])
      setError('Unable to load field devices.')
    } finally {
      setLoading(false)
    }
  }, [verified])

  useEffect(() => {
    void fetchDevices()
  }, [fetchDevices])

  const metrics = useMemo(() => {
    const total = devices.length
    const revoked = devices.filter((d) => deviceState(d) === 'revoked').length
    const assigned = devices.filter((d) => deviceState(d) === 'assigned').length
    const unassigned = devices.filter((d) => deviceState(d) === 'unassigned').length
    return { total, revoked, assigned, unassigned }
  }, [devices])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return devices.filter((device) => {
      const state = deviceState(device)
      if (statusFilter !== 'all' && state !== statusFilter) return false
      if (!q) return true
      const assigneeName = device.assignee?.name || ''
      const assigneeEmail = device.assignee?.email || ''
      return (
        device.device_id.toLowerCase().includes(q) ||
        String(device.device_label || '')
          .toLowerCase()
          .includes(q) ||
        assigneeName.toLowerCase().includes(q) ||
        assigneeEmail.toLowerCase().includes(q)
      )
    })
  }, [devices, search, statusFilter])

  const activeOfficers = useMemo(
    () => officers.filter((o) => String(o.status).toLowerCase() === 'active'),
    [officers]
  )

  async function registerDevice(event: React.FormEvent) {
    event.preventDefault()
    if (!registerId.trim()) return
    try {
      setRegistering(true)
      
      const response = await fetch('/api/ngo/field-devices', {
        method: 'POST',
        credentials: 'include',
        headers: authHeaders(),
        body: JSON.stringify({
          deviceId: registerId.trim(),
          deviceLabel: registerLabel.trim() || null,
        }),
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok || !payload?.success) {
        toast.error(readApiError(payload, 'Failed to register device.'))
        return
      }
      toast.success('Device registered. Bind it to an officer when ready.')
      setRegisterId('')
      setRegisterLabel('')
      await fetchDevices()
    } catch {
      toast.error('Failed to register device.')
    } finally {
      setRegistering(false)
    }
  }

  async function patchDevice(
    deviceRowId: string,
    body: Record<string, unknown>,
    confirmMessage: string
  ) {
    if (!window.confirm(confirmMessage)) return
    try {
      setMutatingId(deviceRowId)
      
      const response = await fetch(`/api/ngo/field-devices/${encodeURIComponent(deviceRowId)}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: authHeaders(),
        body: JSON.stringify(body),
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok || !payload?.success) {
        toast.error(readApiError(payload, 'Device update failed.'))
        return
      }
      toast.success('Device updated.')
      await fetchDevices()
    } catch {
      toast.error('Device update failed.')
    } finally {
      setMutatingId(null)
    }
  }

  if (!verified) return null

  return (
    <section className="space-y-4 rounded-lg border border-slate-200 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h4 className="text-sm font-semibold text-slate-900">Field devices</h4>
          <p className="mt-1 text-xs text-slate-600">
            Register NGO-owned handsets and bind them to Field Officers. Operational field access
            requires an active device bound to the officer — device IDs alone are not credentials.
          </p>
        </div>
        <Button type="button" size="sm" variant="outline" onClick={() => void fetchDevices()} disabled={loading}>
          Refresh
        </Button>
      </div>

      <InfoMeterGrid className="md:grid-cols-4">
        <InfoMeter title="Registered" value={String(metrics.total)} detail="Devices owned by this NGO." />
        <InfoMeter
          title="Assigned"
          value={String(metrics.assigned)}
          progress={meterPercent(metrics.assigned, metrics.total)}
          detail={
            metrics.total > 0
              ? `${metrics.assigned} of ${metrics.total} currently bound to an officer.`
              : 'No devices registered yet.'
          }
        />
        <InfoMeter title="Unassigned" value={String(metrics.unassigned)} detail="Active devices awaiting officer binding." />
        <InfoMeter title="Revoked" value={String(metrics.revoked)} detail="Revoked devices cannot sync or access field APIs." />
      </InfoMeterGrid>

      <form className="grid grid-cols-1 gap-3 rounded-md border border-slate-200 bg-slate-50 p-3 md:grid-cols-3" onSubmit={registerDevice}>
        <div className="space-y-1 md:col-span-2">
          <Label htmlFor="device-id">Device ID</Label>
          <Input
            id="device-id"
            value={registerId}
            onChange={(e) => setRegisterId(e.target.value)}
            placeholder="Paste ID from the officer’s GRAM App device screen"
            required
            minLength={8}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="device-label">Label (optional)</Label>
          <Input
            id="device-label"
            value={registerLabel}
            onChange={(e) => setRegisterLabel(e.target.value)}
            placeholder="Warehouse tablet 1"
          />
        </div>
        <div className="md:col-span-3">
          <Button type="submit" size="sm" disabled={registering}>
            {registering ? 'Registering…' : 'Register device'}
          </Button>
        </div>
      </form>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="device-search">Search</Label>
          <Input
            id="device-search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Device ID, label, or officer"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="device-filter">Status</Label>
          <select
            id="device-filter"
            className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
          >
            <option value="all">All</option>
            <option value="assigned">Assigned</option>
            <option value="unassigned">Unassigned</option>
            <option value="revoked">Revoked</option>
          </select>
        </div>
      </div>

      {loading ? (
        <div className="space-y-2">
          <div className="h-12 animate-pulse rounded bg-slate-200" />
          <div className="h-12 animate-pulse rounded bg-slate-200" />
        </div>
      ) : error ? (
        <p className="text-sm text-rose-700">{error}</p>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-slate-600">
          No devices match these filters. Register a device ID from an officer handset to get started.
        </p>
      ) : (
        <ul className="space-y-3">
          {filtered.map((device) => {
            const state = deviceState(device)
            return (
              <li key={device.id} className="rounded-md border border-slate-200 bg-white p-3 text-sm">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="space-y-1">
                    <p className="font-medium text-slate-900">
                      {device.device_label || 'Unlabelled device'}
                    </p>
                    <p className="break-all text-xs text-slate-500">{device.device_id}</p>
                    <div className="flex flex-wrap gap-2 pt-1">
                      <Badge
                        variant="outline"
                        className={
                          state === 'revoked'
                            ? 'border-rose-200 bg-rose-50 text-rose-800'
                            : state === 'assigned'
                              ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                              : 'border-amber-200 bg-amber-50 text-amber-800'
                        }
                      >
                        {state === 'revoked'
                          ? 'Revoked'
                          : state === 'assigned'
                            ? 'Assigned'
                            : 'Unassigned'}
                      </Badge>
                      <Badge variant="outline" className="border-slate-200 bg-slate-50 text-slate-700">
                        {formatStatusLabel(device.status)}
                      </Badge>
                    </div>
                    <p className="text-xs text-slate-600">
                      Officer:{' '}
                      {device.assignee
                        ? `${device.assignee.name || 'Officer'} (${device.assignee.email || 'no email'})`
                        : 'None'}
                    </p>
                    <p className="text-xs text-slate-500">
                      Registered: {formatWhen(device.registered_at)} · Last seen:{' '}
                      {formatWhen(device.last_seen_at)}
                      {device.revoked_at ? ` · Revoked: ${formatWhen(device.revoked_at)}` : ''}
                    </p>
                  </div>

                  <div className="flex min-w-[220px] flex-col gap-2">
                    {state !== 'revoked' ? (
                      <>
                        <select
                          className="h-9 rounded-md border border-slate-200 bg-white px-2 text-xs"
                          value={bindSelections[device.id] || ''}
                          onChange={(e) =>
                            setBindSelections((prev) => ({ ...prev, [device.id]: e.target.value }))
                          }
                        >
                          <option value="">Select officer…</option>
                          {activeOfficers.map((officer) => (
                            <option key={officer.id} value={officer.id}>
                              {officerDisplayName(officer)}
                            </option>
                          ))}
                        </select>
                        <Button
                          type="button"
                          size="sm"
                          disabled={mutatingId === device.id || !bindSelections[device.id]}
                          onClick={() =>
                            void patchDevice(
                              device.id,
                              {
                                action: device.assigned_user_id ? 'reassign' : 'bind',
                                identityId: bindSelections[device.id],
                              },
                              device.assigned_user_id
                                ? 'Reassign this device? The previous officer will lose access immediately.'
                                : 'Bind this device to the selected Field Officer?'
                            )
                          }
                        >
                          {device.assigned_user_id ? 'Reassign' : 'Bind'}
                        </Button>
                        {device.assigned_user_id ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={mutatingId === device.id}
                            onClick={() =>
                              void patchDevice(
                                device.id,
                                { action: 'unassign' },
                                'Unassign this device? The officer will lose device access until rebound.'
                              )
                            }
                          >
                            Unassign
                          </Button>
                        ) : null}
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={mutatingId === device.id}
                          onClick={() =>
                            void patchDevice(
                              device.id,
                              { action: 'revoke' },
                              'Revoke this device? Existing sessions and offline sync for this handset will be rejected.'
                            )
                          }
                        >
                          Revoke
                        </Button>
                      </>
                    ) : (
                      <Button
                        type="button"
                        size="sm"
                        disabled={mutatingId === device.id}
                        onClick={() =>
                          void patchDevice(
                            device.id,
                            { action: 'reactivate' },
                            'Reactivate this device as unassigned? You must bind an officer again before it can be used.'
                          )
                        }
                      >
                        Reactivate
                      </Button>
                    )}
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
