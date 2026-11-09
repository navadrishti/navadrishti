import 'server-only'
import { supabase } from '@/lib/db'
import {
  assertVerifiedNgoFieldOfficerManager,
  findFieldOfficerIdentityForNgo,
  writeFieldOfficerAudit,
  type NgoFieldOfficerIdentity,
} from '@/lib/ngo-field-officer'
import type { UserData } from '@/lib/auth'

export class FieldDeviceError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'FieldDeviceError'
    this.status = status
  }
}

export type FieldDeviceRow = {
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
  metadata: Record<string, unknown> | null
}

function mapDevice(row: Record<string, unknown>): FieldDeviceRow {
  return {
    id: String(row.id),
    device_id: String(row.device_id),
    ngo_user_id: Number(row.ngo_user_id),
    assigned_user_id: row.assigned_user_id == null ? null : Number(row.assigned_user_id),
    device_label: row.device_label == null ? null : String(row.device_label),
    platform: row.platform == null ? null : String(row.platform),
    app_version: row.app_version == null ? null : String(row.app_version),
    status: String(row.status || ''),
    registered_at: row.registered_at == null ? null : String(row.registered_at),
    last_seen_at: row.last_seen_at == null ? null : String(row.last_seen_at),
    revoked_at: row.revoked_at == null ? null : String(row.revoked_at),
    metadata:
      row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata)
        ? (row.metadata as Record<string, unknown>)
        : null,
  }
}

async function writeDeviceAudit(input: {
  deviceId: string
  eventType: string
  ngoUserId: number
  actorUserId: number
  officerUserId?: number | null
  payload?: Record<string, unknown>
}) {
  const { error } = await supabase.from('csr_audit_log').insert({
    entity_type: 'field_device',
    entity_id: input.deviceId,
    event_type: input.eventType,
    event_hash: `${input.eventType}:${input.deviceId}:${Date.now()}`,
    event_payload: {
      ngo_user_id: input.ngoUserId,
      ...(input.officerUserId != null ? { field_officer_user_id: input.officerUserId } : {}),
      ...(input.payload ?? {}),
    },
    created_by: input.actorUserId,
  })
  if (error) {
    console.error('[ngo-field-devices] audit insert failed:', error)
  }
}

export async function listFieldDevicesForNgo(ngoUserId: number): Promise<FieldDeviceRow[]> {
  const { data, error } = await supabase
    .from('field_devices')
    .select('*')
    .eq('ngo_user_id', ngoUserId)
    .order('registered_at', { ascending: false })

  if (error) throw error
  return (data ?? []).map((row) => mapDevice(row as Record<string, unknown>))
}

export async function findFieldDeviceForNgo(
  deviceRowId: string,
  ngoUserId: number
): Promise<FieldDeviceRow | null> {
  const { data, error } = await supabase
    .from('field_devices')
    .select('*')
    .eq('id', deviceRowId)
    .eq('ngo_user_id', ngoUserId)
    .maybeSingle()

  if (error) throw error
  return data ? mapDevice(data as Record<string, unknown>) : null
}

export async function registerFieldDeviceForNgo(input: {
  ngoUserId: number
  actorUserId: number
  deviceId: string
  deviceLabel?: string | null
  platform?: string | null
  appVersion?: string | null
}): Promise<FieldDeviceRow> {
  const deviceId = String(input.deviceId || '').trim()
  if (deviceId.length < 8 || deviceId.length > 128) {
    throw new FieldDeviceError('Device ID must be between 8 and 128 characters', 400)
  }

  const { data: existing, error: existingError } = await supabase
    .from('field_devices')
    .select('id, ngo_user_id')
    .eq('device_id', deviceId)
    .maybeSingle()

  if (existingError) throw existingError
  if (existing) {
    if (Number(existing.ngo_user_id) === input.ngoUserId) {
      throw new FieldDeviceError('This device is already registered to your NGO', 409)
    }
    throw new FieldDeviceError('This device ID is already registered to another organisation', 409)
  }

  const now = new Date().toISOString()
  const { data, error } = await supabase
    .from('field_devices')
    .insert({
      device_id: deviceId,
      ngo_user_id: input.ngoUserId,
      assigned_user_id: null,
      device_label: input.deviceLabel?.trim() || null,
      platform: input.platform?.trim() || null,
      app_version: input.appVersion?.trim() || null,
      status: 'active',
      registered_at: now,
      last_seen_at: null,
      revoked_at: null,
      metadata: {},
    })
    .select('*')
    .single()

  if (error || !data) {
    if (String(error?.code || '') === '23505') {
      throw new FieldDeviceError('This device ID is already registered', 409)
    }
    throw new Error('Failed to register field device')
  }

  const device = mapDevice(data as Record<string, unknown>)
  await writeDeviceAudit({
    deviceId: device.id,
    eventType: 'field_device_registered',
    ngoUserId: input.ngoUserId,
    actorUserId: input.actorUserId,
    payload: { client_device_id: device.device_id, device_label: device.device_label },
  })
  return device
}

async function requireActiveOfficer(
  identityId: string,
  ngoUserId: number
): Promise<NgoFieldOfficerIdentity> {
  const identity = await findFieldOfficerIdentityForNgo(identityId, ngoUserId)
  if (!identity) {
    throw new FieldDeviceError('Field officer identity not found', 404)
  }
  if (identity.status !== 'active') {
    throw new FieldDeviceError('Only active field officers can be bound to devices', 409)
  }
  return identity
}

export async function bindFieldDeviceToOfficer(input: {
  ngoUserId: number
  actorUserId: number
  deviceRowId: string
  identityId: string
}): Promise<FieldDeviceRow> {
  const device = await findFieldDeviceForNgo(input.deviceRowId, input.ngoUserId)
  if (!device) {
    throw new FieldDeviceError('Device not found', 404)
  }
  if (String(device.status).toLowerCase() === 'revoked' || device.revoked_at) {
    throw new FieldDeviceError('Revoked devices must be reactivated before binding', 409)
  }

  const officer = await requireActiveOfficer(input.identityId, input.ngoUserId)
  const previousOfficerId = device.assigned_user_id
  if (previousOfficerId === officer.user_id) {
    return device
  }

  const now = new Date().toISOString()
  const { data, error } = await supabase
    .from('field_devices')
    .update({
      assigned_user_id: officer.user_id,
      status: 'active',
      revoked_at: null,
      last_seen_at: now,
    })
    .eq('id', device.id)
    .eq('ngo_user_id', input.ngoUserId)
    .select('*')
    .single()

  if (error || !data) {
    throw new Error('Failed to bind field device')
  }

  const updated = mapDevice(data as Record<string, unknown>)
  const eventType =
    previousOfficerId && previousOfficerId !== officer.user_id
      ? 'field_device_reassigned'
      : 'field_device_bound'

  await writeDeviceAudit({
    deviceId: updated.id,
    eventType,
    ngoUserId: input.ngoUserId,
    actorUserId: input.actorUserId,
    officerUserId: officer.user_id,
    payload: {
      client_device_id: updated.device_id,
      previous_assigned_user_id: previousOfficerId,
      field_officer_identity_id: officer.id,
    },
  })

  await writeFieldOfficerAudit({
    identityId: officer.id,
    eventType:
      previousOfficerId && previousOfficerId !== officer.user_id
        ? 'ngo_field_officer_device_reassigned'
        : 'ngo_field_officer_device_bound',
    ngoUserId: input.ngoUserId,
    officerUserId: officer.user_id,
    actorUserId: input.actorUserId,
    payload: {
      field_device_row_id: updated.id,
      client_device_id: updated.device_id,
      previous_assigned_user_id: previousOfficerId,
    },
  })

  return updated
}

export async function revokeFieldDevice(input: {
  ngoUserId: number
  actorUserId: number
  deviceRowId: string
}): Promise<FieldDeviceRow> {
  const device = await findFieldDeviceForNgo(input.deviceRowId, input.ngoUserId)
  if (!device) {
    throw new FieldDeviceError('Device not found', 404)
  }
  if (String(device.status).toLowerCase() === 'revoked' && device.revoked_at) {
    return device
  }

  const now = new Date().toISOString()
  const { data, error } = await supabase
    .from('field_devices')
    .update({
      status: 'revoked',
      revoked_at: now,
    })
    .eq('id', device.id)
    .eq('ngo_user_id', input.ngoUserId)
    .select('*')
    .single()

  if (error || !data) {
    throw new Error('Failed to revoke field device')
  }

  const updated = mapDevice(data as Record<string, unknown>)
  await writeDeviceAudit({
    deviceId: updated.id,
    eventType: 'field_device_revoked',
    ngoUserId: input.ngoUserId,
    actorUserId: input.actorUserId,
    officerUserId: updated.assigned_user_id,
    payload: { client_device_id: updated.device_id },
  })
  return updated
}

export async function reactivateFieldDevice(input: {
  ngoUserId: number
  actorUserId: number
  deviceRowId: string
}): Promise<FieldDeviceRow> {
  const device = await findFieldDeviceForNgo(input.deviceRowId, input.ngoUserId)
  if (!device) {
    throw new FieldDeviceError('Device not found', 404)
  }

  // Reactivate as unassigned — NGO must explicitly re-bind an officer.
  const now = new Date().toISOString()
  const { data, error } = await supabase
    .from('field_devices')
    .update({
      status: 'active',
      revoked_at: null,
      assigned_user_id: null,
      last_seen_at: now,
    })
    .eq('id', device.id)
    .eq('ngo_user_id', input.ngoUserId)
    .select('*')
    .single()

  if (error || !data) {
    throw new Error('Failed to reactivate field device')
  }

  const updated = mapDevice(data as Record<string, unknown>)
  await writeDeviceAudit({
    deviceId: updated.id,
    eventType: 'field_device_reactivated',
    ngoUserId: input.ngoUserId,
    actorUserId: input.actorUserId,
    officerUserId: device.assigned_user_id,
    payload: {
      client_device_id: updated.device_id,
      previous_assigned_user_id: device.assigned_user_id,
      cleared_assignment: true,
    },
  })
  return updated
}

export async function unassignFieldDevice(input: {
  ngoUserId: number
  actorUserId: number
  deviceRowId: string
}): Promise<FieldDeviceRow> {
  const device = await findFieldDeviceForNgo(input.deviceRowId, input.ngoUserId)
  if (!device) {
    throw new FieldDeviceError('Device not found', 404)
  }
  if (String(device.status).toLowerCase() === 'revoked' || device.revoked_at) {
    throw new FieldDeviceError('Revoked devices cannot be unassigned; reactivate first', 409)
  }
  if (device.assigned_user_id == null) {
    return device
  }

  const previous = device.assigned_user_id
  const { data, error } = await supabase
    .from('field_devices')
    .update({ assigned_user_id: null })
    .eq('id', device.id)
    .eq('ngo_user_id', input.ngoUserId)
    .select('*')
    .single()

  if (error || !data) {
    throw new Error('Failed to unassign field device')
  }

  const updated = mapDevice(data as Record<string, unknown>)
  await writeDeviceAudit({
    deviceId: updated.id,
    eventType: 'field_device_unassigned',
    ngoUserId: input.ngoUserId,
    actorUserId: input.actorUserId,
    officerUserId: previous,
    payload: { client_device_id: updated.device_id },
  })
  return updated
}

export async function assertNgoManagesFieldDevices(user: UserData) {
  await assertVerifiedNgoFieldOfficerManager(user)
}
