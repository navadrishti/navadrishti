import 'server-only'
import { AuthError, hashPassword, type UserData } from '@/lib/auth'
import { supabase } from '@/lib/db'
import {
  describeFieldAssignmentLock,
  FIELD_ASSIGNMENT_LOCKED_MESSAGE,
  isFieldOfficerAssignmentLocked,
} from '@/lib/field-officer-assignment-lock'
import { parseJsonObject } from '@/lib/utils'
import { isProjectFinancialLead } from '@/lib/csr-agent/project-financial-access'

/** NGO main accounts only — Field Officers must never pass this gate. */
export async function assertVerifiedNgoFieldOfficerManager(user: UserData): Promise<void> {
  if (user.user_type !== 'ngo') {
    throw new AuthError('Insufficient permissions', 403)
  }

  if (String(user.verification_status || '').toLowerCase() === 'verified') {
    return
  }

  throw new AuthError('Verified NGO account required to manage field officers', 403)
}

export const NGO_FIELD_OFFICER_PROFILE_ROLE = 'ngo_field_officer' as const

export const FIELD_OFFICER_PASSWORD_CHANGE_REQUIRED_MESSAGE =
  'Password change required before continuing.'

export const DEFAULT_FIELD_OFFICER_PERMISSIONS = {
  can_submit_field_evidence: true,
} as const

export type FieldOfficerPermission = keyof typeof DEFAULT_FIELD_OFFICER_PERMISSIONS

export type NgoFieldOfficerIdentity = {
  id: string
  user_id: number
  ngo_user_id: number
  status: string
  permissions: Record<string, unknown>
  must_change_password: boolean
  created_by: number | null
  created_at: string
  updated_at: string
  last_login_at: string | null
  deactivated_at: string | null
}

export type FieldOfficerAuthEvaluation =
  | { isFieldOfficer: false }
  | {
      isFieldOfficer: true
      allowed: boolean
      reason: string | null
      mustChangePassword: boolean
      identity: NgoFieldOfficerIdentity
    }

function mapIdentity(row: Record<string, unknown>): NgoFieldOfficerIdentity {
  return {
    id: String(row.id),
    user_id: Number(row.user_id),
    ngo_user_id: Number(row.ngo_user_id),
    status: String(row.status || ''),
    permissions: parseJsonObject(row.permissions),
    must_change_password: Boolean(row.must_change_password),
    created_by: row.created_by == null ? null : Number(row.created_by),
    created_at: String(row.created_at || ''),
    updated_at: String(row.updated_at || ''),
    last_login_at: row.last_login_at == null ? null : String(row.last_login_at),
    deactivated_at: row.deactivated_at == null ? null : String(row.deactivated_at),
  }
}

export async function isNgoFieldOfficerUser(userId: number): Promise<boolean> {
  const { data, error } = await supabase
    .from('ngo_field_officer_identities')
    .select('id')
    .eq('user_id', userId)
    .maybeSingle()

  if (error) throw error
  return Boolean(data)
}

export async function findFieldOfficerIdentityByUserId(
  userId: number
): Promise<NgoFieldOfficerIdentity | null> {
  const { data, error } = await supabase
    .from('ngo_field_officer_identities')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle()

  if (error) throw error
  return data ? mapIdentity(data as Record<string, unknown>) : null
}

export async function findFieldOfficerIdentityForNgo(
  identityId: string,
  ngoUserId: number
): Promise<NgoFieldOfficerIdentity | null> {
  const { data, error } = await supabase
    .from('ngo_field_officer_identities')
    .select('*')
    .eq('id', identityId)
    .eq('ngo_user_id', ngoUserId)
    .maybeSingle()

  if (error) throw error
  return data ? mapIdentity(data as Record<string, unknown>) : null
}

/**
 * Authentication gate for Field Officer sessions (PWA and future portals).
 * Callers must not leak whether an email is registered when wrapping login.
 */
export async function evaluateFieldOfficerAuthentication(
  userId: number,
  options: { allowPasswordChangePending?: boolean } = {}
): Promise<FieldOfficerAuthEvaluation> {
  const identity = await findFieldOfficerIdentityByUserId(userId)
  if (!identity) {
    return { isFieldOfficer: false }
  }

  if (identity.status !== 'active') {
    return {
      isFieldOfficer: true,
      allowed: false,
      reason: 'This account cannot sign in.',
      mustChangePassword: identity.must_change_password,
      identity,
    }
  }

  if (identity.must_change_password && !options.allowPasswordChangePending) {
    return {
      isFieldOfficer: true,
      allowed: false,
      reason: FIELD_OFFICER_PASSWORD_CHANGE_REQUIRED_MESSAGE,
      mustChangePassword: true,
      identity,
    }
  }

  return {
    isFieldOfficer: true,
    allowed: true,
    reason: null,
    mustChangePassword: identity.must_change_password,
    identity,
  }
}

export function assertFieldOfficerActive(
  evaluation: FieldOfficerAuthEvaluation
): asserts evaluation is Extract<FieldOfficerAuthEvaluation, { isFieldOfficer: true; allowed: true }> {
  if (!evaluation.isFieldOfficer) {
    throw new AuthError('Field officer authentication required', 401)
  }
  if (!evaluation.allowed) {
    throw new AuthError(evaluation.reason || 'This account cannot sign in.', 403)
  }
}

export function hasFieldOfficerPermission(
  identity: Pick<NgoFieldOfficerIdentity, 'permissions'>,
  permission: FieldOfficerPermission
): boolean {
  const value = identity.permissions[permission]
  return value === undefined || value === true
}

export async function revokeFieldDevicesForOfficer(input: {
  ngoUserId: number
  officerUserId: number
}): Promise<void> {
  const now = new Date().toISOString()
  const { error } = await supabase
    .from('field_devices')
    .update({
      status: 'revoked',
      revoked_at: now,
    })
    .eq('ngo_user_id', input.ngoUserId)
    .eq('assigned_user_id', input.officerUserId)
    .is('revoked_at', null)

  if (error) {
    console.error('[ngo-field-officer] failed to revoke field devices:', error)
    throw new Error('Failed to revoke field devices for officer')
  }
}

export async function writeFieldOfficerAudit(input: {
  identityId: string
  eventType: string
  ngoUserId: number
  officerUserId: number
  actorUserId: number
  payload?: Record<string, unknown>
}): Promise<void> {
  const { error } = await supabase.from('csr_audit_log').insert({
    entity_type: 'ngo_field_officer_identity',
    entity_id: input.identityId,
    event_type: input.eventType,
    event_hash: `${input.eventType}:${input.identityId}:${Date.now()}`,
    event_payload: {
      ngo_user_id: input.ngoUserId,
      field_officer_user_id: input.officerUserId,
      ...(input.payload ?? {}),
    },
    created_by: input.actorUserId,
  })

  if (error) {
    console.error('[ngo-field-officer] audit insert failed:', error)
  }
}

export async function resetFieldOfficerPassword(input: {
  identityId: string
  ngoUserId: number
  password: string
  actorUserId: number
}) {
  const existing = await findFieldOfficerIdentityForNgo(input.identityId, input.ngoUserId)
  if (!existing) {
    throw new Error('FIELD_OFFICER_NOT_FOUND')
  }

  const passwordHash = await hashPassword(input.password)
  const { error: userUpdateError } = await supabase
    .from('users')
    .update({ password: passwordHash, updated_at: new Date().toISOString() })
    .eq('id', existing.user_id)

  if (userUpdateError) {
    throw new Error('Failed to reset field officer password')
  }

  const { data: updated, error: identityUpdateError } = await supabase
    .from('ngo_field_officer_identities')
    .update({
      must_change_password: true,
      updated_at: new Date().toISOString(),
    })
    .eq('id', input.identityId)
    .eq('ngo_user_id', input.ngoUserId)
    .select('*')
    .single()

  if (identityUpdateError || !updated) {
    throw new Error('Failed to reset field officer password')
  }

  await writeFieldOfficerAudit({
    identityId: input.identityId,
    eventType: 'ngo_field_officer_password_reset',
    ngoUserId: input.ngoUserId,
    officerUserId: existing.user_id,
    actorUserId: input.actorUserId,
    payload: { reset_by_ngo: true },
  })

  return mapIdentity(updated as Record<string, unknown>)
}

export class FieldOfficerAssignmentError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'FieldOfficerAssignmentError'
    this.status = status
  }
}

/** Statuses that allow creating or reactivating a field assignment. */
export const FIELD_ASSIGNABLE_PROJECT_STATUSES = [
  'planning',
  'active',
  'on-hold',
  'in_progress',
] as const

const FIELD_ASSIGNMENT_HISTORY_STATUSES = new Set([
  'completed',
  'closed',
  'finished',
  'done',
  'cancelled',
  'canceled',
  'rejected',
  'expired',
  'ended',
])

export type NgoFieldOfficerProjectAssignment = {
  id: string
  field_officer_identity_id: string
  field_officer_user_id: number
  ngo_user_id: number
  project_id: string
  status: 'active' | 'inactive' | string
  assigned_by: number | null
  assigned_at: string
  deactivated_at: string | null
  created_at: string
  updated_at: string
}

export function isProjectEligibleForFieldAssignment(projectStatus: unknown): boolean {
  const status = String(projectStatus || '')
    .trim()
    .toLowerCase()
  if (!status) return false
  if (FIELD_ASSIGNMENT_HISTORY_STATUSES.has(status)) return false
  return (FIELD_ASSIGNABLE_PROJECT_STATUSES as readonly string[]).includes(status)
}

function mapAssignment(row: Record<string, unknown>): NgoFieldOfficerProjectAssignment {
  return {
    id: String(row.id),
    field_officer_identity_id: String(row.field_officer_identity_id),
    field_officer_user_id: Number(row.field_officer_user_id),
    ngo_user_id: Number(row.ngo_user_id),
    project_id: String(row.project_id),
    status: String(row.status || ''),
    assigned_by: row.assigned_by == null ? null : Number(row.assigned_by),
    assigned_at: String(row.assigned_at || ''),
    deactivated_at: row.deactivated_at == null ? null : String(row.deactivated_at),
    created_at: String(row.created_at || ''),
    updated_at: String(row.updated_at || ''),
  }
}

export async function findOwnedCsrProjectForNgo(
  projectId: string,
  ngoUserId: number
): Promise<{
  id: string
  title: string
  project_status: string
  ngo_user_id: number
  start_date: string | null
  campaign_id: string | null
  campaigns: { lead_ngo_user_id: number | null } | null
} | null> {
  const { data, error } = await supabase
    .from('csr_projects')
    .select('id, title, project_status, ngo_user_id, start_date, campaign_id, campaigns(lead_ngo_user_id)')
    .eq('id', projectId)
    .eq('ngo_user_id', ngoUserId)
    .maybeSingle()

  if (error) throw error
  if (!data) return null
  return {
    id: String(data.id),
    title: String(data.title || ''),
    project_status: String(data.project_status || ''),
    ngo_user_id: Number(data.ngo_user_id),
    start_date: data.start_date == null ? null : String(data.start_date),
    campaign_id: data.campaign_id,
    campaigns: data.campaigns,
  }
}

function assertAssignmentEditableForProjectStart(startDate: string | null | undefined) {
  if (!isFieldOfficerAssignmentLocked(startDate)) return
  const lock = describeFieldAssignmentLock(startDate)
  throw new FieldOfficerAssignmentError(
    `${FIELD_ASSIGNMENT_LOCKED_MESSAGE}${
      lock.lockAt ? ` Lock took effect at ${lock.lockAt} (${lock.timeZone}).` : ''
    }`,
    409
  )
}

export async function listFieldOfficerAssignmentsForNgo(input: {
  ngoUserId: number
  identityId: string
}): Promise<NgoFieldOfficerProjectAssignment[]> {
  const { data, error } = await supabase
    .from('ngo_field_officer_project_assignments')
    .select('*')
    .eq('ngo_user_id', input.ngoUserId)
    .eq('field_officer_identity_id', input.identityId)
    .order('assigned_at', { ascending: false })

  if (error) throw error
  return (data ?? []).map((row) => mapAssignment(row as Record<string, unknown>))
}

export async function findFieldOfficerAssignmentForNgo(input: {
  ngoUserId: number
  identityId: string
  assignmentId: string
}): Promise<NgoFieldOfficerProjectAssignment | null> {
  const { data, error } = await supabase
    .from('ngo_field_officer_project_assignments')
    .select('*')
    .eq('id', input.assignmentId)
    .eq('ngo_user_id', input.ngoUserId)
    .eq('field_officer_identity_id', input.identityId)
    .maybeSingle()

  if (error) throw error
  return data ? mapAssignment(data as Record<string, unknown>) : null
}

export async function assignFieldOfficerToProject(input: {
  ngoUserId: number
  actorUserId: number
  identityId: string
  projectId: string
}): Promise<{ assignment: NgoFieldOfficerProjectAssignment; created: boolean }> {
  const identity = await findFieldOfficerIdentityForNgo(input.identityId, input.ngoUserId)
  if (!identity) {
    throw new FieldOfficerAssignmentError('Field officer identity not found', 404)
  }
  if (identity.status !== 'active') {
    throw new FieldOfficerAssignmentError(
      'Only active field officers can be assigned to projects',
      409
    )
  }

  const project = await findOwnedCsrProjectForNgo(input.projectId, input.ngoUserId)
  if (!project) {
    throw new FieldOfficerAssignmentError('Project not found', 404)
  }
  if (!isProjectFinancialLead(project, input.ngoUserId)) {
    throw new FieldOfficerAssignmentError('Project not found', 404)
  }
  if (!isProjectEligibleForFieldAssignment(project.project_status)) {
    throw new FieldOfficerAssignmentError(
      'This project is not eligible for field officer assignment',
      409
    )
  }
  assertAssignmentEditableForProjectStart(project.start_date)

  const { data: existing, error: existingError } = await supabase
    .from('ngo_field_officer_project_assignments')
    .select('*')
    .eq('field_officer_identity_id', identity.id)
    .eq('project_id', project.id)
    .eq('ngo_user_id', input.ngoUserId)
    .maybeSingle()

  if (existingError) throw existingError

  if (existing) {
    const current = mapAssignment(existing as Record<string, unknown>)
    if (String(current.status).toLowerCase() === 'active') {
      throw new FieldOfficerAssignmentError(
        'Field officer is already assigned to this project',
        409
      )
    }

    const now = new Date().toISOString()
    const { data: reactivated, error: reactivateError } = await supabase
      .from('ngo_field_officer_project_assignments')
      .update({
        status: 'active',
        assigned_by: input.actorUserId,
        assigned_at: now,
        deactivated_at: null,
        updated_at: now,
      })
      .eq('id', current.id)
      .eq('ngo_user_id', input.ngoUserId)
      .select('*')
      .single()

    if (reactivateError || !reactivated) {
      throw new Error('Failed to reactivate field officer project assignment')
    }

    const assignment = mapAssignment(reactivated as Record<string, unknown>)
    await writeFieldOfficerAudit({
      identityId: identity.id,
      eventType: 'ngo_field_officer_project_assignment_reactivated',
      ngoUserId: input.ngoUserId,
      officerUserId: identity.user_id,
      actorUserId: input.actorUserId,
      payload: {
        assignment_id: assignment.id,
        project_id: project.id,
        project_title: project.title,
      },
    })
    return { assignment, created: false }
  }

  const now = new Date().toISOString()
  const { data: inserted, error: insertError } = await supabase
    .from('ngo_field_officer_project_assignments')
    .insert({
      field_officer_identity_id: identity.id,
      field_officer_user_id: identity.user_id,
      ngo_user_id: input.ngoUserId,
      project_id: project.id,
      status: 'active',
      assigned_by: input.actorUserId,
      assigned_at: now,
      deactivated_at: null,
      created_at: now,
      updated_at: now,
    })
    .select('*')
    .single()

  if (insertError || !inserted) {
    if (String(insertError?.code || '') === '23505') {
      throw new FieldOfficerAssignmentError(
        'Field officer is already assigned to this project',
        409
      )
    }
    throw new Error('Failed to create field officer project assignment')
  }

  const assignment = mapAssignment(inserted as Record<string, unknown>)
  await writeFieldOfficerAudit({
    identityId: identity.id,
    eventType: 'ngo_field_officer_project_assigned',
    ngoUserId: input.ngoUserId,
    officerUserId: identity.user_id,
    actorUserId: input.actorUserId,
    payload: {
      assignment_id: assignment.id,
      project_id: project.id,
      project_title: project.title,
    },
  })
  return { assignment, created: true }
}

export async function setFieldOfficerAssignmentStatus(input: {
  ngoUserId: number
  actorUserId: number
  identityId: string
  assignmentId: string
  status: 'active' | 'inactive'
}): Promise<NgoFieldOfficerProjectAssignment> {
  const identity = await findFieldOfficerIdentityForNgo(input.identityId, input.ngoUserId)
  if (!identity) {
    throw new FieldOfficerAssignmentError('Field officer identity not found', 404)
  }

  const existing = await findFieldOfficerAssignmentForNgo({
    ngoUserId: input.ngoUserId,
    identityId: input.identityId,
    assignmentId: input.assignmentId,
  })
  if (!existing) {
    throw new FieldOfficerAssignmentError('Assignment not found', 404)
  }

  if (String(existing.status).toLowerCase() === input.status) {
    return existing
  }

  const projectForLock = await findOwnedCsrProjectForNgo(existing.project_id, input.ngoUserId)
  if (!projectForLock) {
    throw new FieldOfficerAssignmentError('Project not found', 404)
  }
  assertAssignmentEditableForProjectStart(projectForLock.start_date)

  if (input.status === 'active') {
    if (!isProjectFinancialLead(projectForLock, input.ngoUserId)) {
      throw new FieldOfficerAssignmentError('Project not found', 404)
    }
    if (identity.status !== 'active') {
      throw new FieldOfficerAssignmentError(
        'Only active field officers can be assigned to projects',
        409
      )
    }
    if (!isProjectEligibleForFieldAssignment(projectForLock.project_status)) {
      throw new FieldOfficerAssignmentError(
        'This project is not eligible for field officer assignment',
        409
      )
    }
  }

  const now = new Date().toISOString()
  const { data: updated, error } = await supabase
    .from('ngo_field_officer_project_assignments')
    .update({
      status: input.status,
      deactivated_at: input.status === 'inactive' ? now : null,
      assigned_at: input.status === 'active' ? now : existing.assigned_at,
      assigned_by: input.status === 'active' ? input.actorUserId : existing.assigned_by,
      updated_at: now,
    })
    .eq('id', existing.id)
    .eq('ngo_user_id', input.ngoUserId)
    .select('*')
    .single()

  if (error || !updated) {
    throw new Error('Failed to update field officer project assignment')
  }

  const assignment = mapAssignment(updated as Record<string, unknown>)
  await writeFieldOfficerAudit({
    identityId: identity.id,
    eventType:
      input.status === 'active'
        ? 'ngo_field_officer_project_assignment_reactivated'
        : 'ngo_field_officer_project_assignment_deactivated',
    ngoUserId: input.ngoUserId,
    officerUserId: identity.user_id,
    actorUserId: input.actorUserId,
    payload: {
      assignment_id: assignment.id,
      project_id: assignment.project_id,
    },
  })
  return assignment
}
