import 'server-only'
import { AuthError, hashPassword, type UserData } from '@/lib/auth'
import { db, supabase } from '@/lib/db'
import { parseJsonObject } from '@/lib/utils'

export const COMPANY_EMPLOYEE_PROFILE_ROLE = 'company_employee' as const

export const COMPANY_EMPLOYEE_PASSWORD_CHANGE_REQUIRED_MESSAGE =
  'Password change required before continuing.'

export type CompanyEmployeeIdentity = {
  id: string
  user_id: number
  company_user_id: number
  status: string
  permissions: Record<string, unknown>
  must_change_password: boolean
  created_by: number | null
  created_at: string
  updated_at: string
  last_login_at: string | null
  deactivated_at: string | null
}

export type CompanyEmployeeProjectAssignment = {
  id: string
  company_employee_identity_id: string
  company_employee_user_id: number
  company_user_id: number
  project_id: string
  status: string
  assigned_by: number | null
  assigned_at: string
  deactivated_at: string | null
  created_at: string
  updated_at: string
}

export class CompanyEmployeeAssignmentError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.name = 'CompanyEmployeeAssignmentError'
    this.status = status
  }
}

export class CompanyEmployeeError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.name = 'CompanyEmployeeError'
    this.status = status
  }
}

/** Company owners only — employees must never pass this gate. */
export async function assertVerifiedCompanyEmployeeManager(user: UserData): Promise<void> {
  if (user.user_type !== 'company') {
    throw new AuthError('Insufficient permissions', 403)
  }
  if (await isCompanyEmployeeUser(user.id)) {
    throw new AuthError('Insufficient permissions', 403)
  }
  if (String(user.verification_status || '').toLowerCase() === 'verified') {
    return
  }
  throw new AuthError('Verified Company account required to manage employees', 403)
}

function mapIdentity(row: Record<string, unknown>): CompanyEmployeeIdentity {
  return {
    id: String(row.id),
    user_id: Number(row.user_id),
    company_user_id: Number(row.company_user_id),
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

function mapAssignment(row: Record<string, unknown>): CompanyEmployeeProjectAssignment {
  return {
    id: String(row.id),
    company_employee_identity_id: String(row.company_employee_identity_id),
    company_employee_user_id: Number(row.company_employee_user_id),
    company_user_id: Number(row.company_user_id),
    project_id: String(row.project_id),
    status: String(row.status || ''),
    assigned_by: row.assigned_by == null ? null : Number(row.assigned_by),
    assigned_at: String(row.assigned_at || ''),
    deactivated_at: row.deactivated_at == null ? null : String(row.deactivated_at),
    created_at: String(row.created_at || ''),
    updated_at: String(row.updated_at || ''),
  }
}

export async function isCompanyEmployeeUser(userId: number): Promise<boolean> {
  const { data, error } = await supabase
    .from('company_employee_identities')
    .select('id')
    .eq('user_id', userId)
    .maybeSingle()
  if (error) {
    console.error('Employee identity lookup failed')
    throw new AuthError('Authorization service temporarily unavailable', 503)
  }
  return Boolean(data)
}

export async function findCompanyEmployeeIdentityByUserId(
  userId: number
): Promise<CompanyEmployeeIdentity | null> {
  const { data, error } = await supabase
    .from('company_employee_identities')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle()
  if (error) {
    console.error('Employee identity lookup failed')
    throw new AuthError('Authorization service temporarily unavailable', 503)
  }
  return data ? mapIdentity(data as Record<string, unknown>) : null
}

export async function findCompanyEmployeeIdentityForCompany(
  identityId: string,
  companyUserId: number
): Promise<CompanyEmployeeIdentity | null> {
  const { data, error } = await supabase
    .from('company_employee_identities')
    .select('*')
    .eq('id', identityId)
    .eq('company_user_id', companyUserId)
    .maybeSingle()
  if (error) throw error
  return data ? mapIdentity(data as Record<string, unknown>) : null
}

export async function evaluateCompanyEmployeeAuthentication(
  userId: number,
  options: { allowPasswordChangePending?: boolean } = {}
): Promise<
  | { isEmployee: false }
  | {
      isEmployee: true
      allowed: boolean
      reason: string | null
      mustChangePassword: boolean
      identity: CompanyEmployeeIdentity
    }
> {
  const identity = await findCompanyEmployeeIdentityByUserId(userId)
  if (!identity) return { isEmployee: false }

  if (identity.status !== 'active') {
    return {
      isEmployee: true,
      allowed: false,
      reason: 'This account cannot sign in.',
      mustChangePassword: identity.must_change_password,
      identity,
    }
  }

  const { data: parent, error: parentError } = await supabase
    .from('users')
    .select('id, user_type, account_status, locked_until, profile_data')
    .eq('id', identity.company_user_id)
    .maybeSingle()
  if (parentError) {
    console.error('Employee company lookup failed')
    throw new AuthError('Authorization service temporarily unavailable', 503)
  }
  if (!parent || String(parent.user_type || '').toLowerCase() !== 'company') {
    return {
      isEmployee: true,
      allowed: false,
      reason: 'Parent Company account is not available.',
      mustChangePassword: identity.must_change_password,
      identity,
    }
  }

  if (identity.must_change_password && !options.allowPasswordChangePending) {
    return {
      isEmployee: true,
      allowed: false,
      reason: COMPANY_EMPLOYEE_PASSWORD_CHANGE_REQUIRED_MESSAGE,
      mustChangePassword: true,
      identity,
    }
  }

  return {
    isEmployee: true,
    allowed: true,
    reason: null,
    mustChangePassword: identity.must_change_password,
    identity,
  }
}

export async function assertActiveCompanyEmployee(
  user: UserData,
  options: { allowPasswordChangePending?: boolean } = {}
): Promise<CompanyEmployeeIdentity> {
  const evaluation = await evaluateCompanyEmployeeAuthentication(user.id, options)
  if (!evaluation.isEmployee) {
    throw new AuthError('Company employee authentication required', 403)
  }
  if (!evaluation.allowed) {
    throw new AuthError(evaluation.reason || 'This account cannot sign in.', 403)
  }
  return evaluation.identity
}

export async function writeCompanyEmployeeAudit(input: {
  identityId: string
  eventType: string
  companyUserId: number
  employeeUserId: number
  actorUserId: number
  payload?: Record<string, unknown>
}): Promise<void> {
  const { error } = await supabase.from('csr_audit_log').insert({
    entity_type: 'company_employee_identity',
    entity_id: input.identityId,
    event_type: input.eventType,
    event_hash: `${input.eventType}:${input.identityId}:${Date.now()}`,
    event_payload: {
      company_user_id: input.companyUserId,
      company_employee_user_id: input.employeeUserId,
      ...(input.payload ?? {}),
    },
    created_by: input.actorUserId,
  })
  if (error) {
    console.error('[company-employee] audit insert failed:', error)
  }
}

export async function createCompanyEmployee(input: {
  companyUserId: number
  actorUserId: number
  name: string
  email: string
  password: string
}): Promise<{
  identity: CompanyEmployeeIdentity
  userId: number
  user: { id: number; name: string | null; email: string }
}> {
  const email = input.email.trim().toLowerCase()
  const name = input.name.trim()
  if (!name || !email || input.password.length < 8) {
    throw new CompanyEmployeeError(
      'Name, email, and a password of at least 8 characters are required.',
      400
    )
  }

  const existingUser = await db.users.findByEmail(email)
  if (existingUser) {
    throw new CompanyEmployeeError('An account with this email already exists.', 409)
  }

  const passwordHash = await hashPassword(input.password)

  let newUser: { id: number; name: string | null; email: string }
  try {
    newUser = await db.users.create({
      name,
      email,
      password: passwordHash,
      user_type: 'individual',
      verification_status: 'verified',
      email_verified: true,
      phone_verified: false,
      ngo_volunteer_capacity: 0,
      profile_data: {
        role: COMPANY_EMPLOYEE_PROFILE_ROLE,
        parent_company_user_id: input.companyUserId,
      },
    })
  } catch (error) {
    console.error('[company-employee] user create failed:', error)
    throw new CompanyEmployeeError('Failed to create employee account.', 500)
  }

  const { data: identityRow, error: identityError } = await supabase
    .from('company_employee_identities')
    .insert({
      user_id: newUser.id,
      company_user_id: input.companyUserId,
      status: 'active',
      permissions: {},
      must_change_password: true,
      created_by: input.actorUserId,
    })
    .select('*')
    .single()

  if (identityError || !identityRow) {
    console.error('[company-employee] identity create failed:', identityError)
    await supabase.from('users').delete().eq('id', newUser.id)
    throw new CompanyEmployeeError('Failed to create employee identity.', 500)
  }

  const identity = mapIdentity(identityRow as Record<string, unknown>)
  await writeCompanyEmployeeAudit({
    identityId: identity.id,
    eventType: 'company_employee_created',
    companyUserId: input.companyUserId,
    employeeUserId: identity.user_id,
    actorUserId: input.actorUserId,
  })

  return { identity, userId: identity.user_id, user: { id: newUser.id, name: newUser.name, email: newUser.email } }
}

export async function resetCompanyEmployeePassword(input: {
  identityId: string
  companyUserId: number
  password: string
  actorUserId: number
}) {
  const existing = await findCompanyEmployeeIdentityForCompany(input.identityId, input.companyUserId)
  if (!existing) throw new CompanyEmployeeError('Employee not found', 404)

  const passwordHash = await hashPassword(input.password)
  const now = new Date().toISOString()
  const { error: userUpdateError } = await supabase
    .from('users')
    .update({ password: passwordHash, updated_at: now })
    .eq('id', existing.user_id)
  if (userUpdateError) throw new CompanyEmployeeError('Failed to reset employee password', 500)

  const { data: updated, error: identityUpdateError } = await supabase
    .from('company_employee_identities')
    .update({ must_change_password: true, updated_at: now })
    .eq('id', input.identityId)
    .eq('company_user_id', input.companyUserId)
    .select('*')
    .single()
  if (identityUpdateError || !updated) {
    throw new CompanyEmployeeError('Failed to reset employee password', 500)
  }

  await writeCompanyEmployeeAudit({
    identityId: input.identityId,
    eventType: 'company_employee_password_reset',
    companyUserId: input.companyUserId,
    employeeUserId: existing.user_id,
    actorUserId: input.actorUserId,
  })

  return mapIdentity(updated as Record<string, unknown>)
}

export async function setCompanyEmployeeStatus(input: {
  identityId: string
  companyUserId: number
  status: 'active' | 'inactive'
  actorUserId: number
}) {
  const existing = await findCompanyEmployeeIdentityForCompany(input.identityId, input.companyUserId)
  if (!existing) throw new CompanyEmployeeError('Employee not found', 404)

  const now = new Date().toISOString()
  const { data: updated, error } = await supabase
    .from('company_employee_identities')
    .update({
      status: input.status,
      deactivated_at: input.status === 'inactive' ? now : null,
      updated_at: now,
    })
    .eq('id', input.identityId)
    .eq('company_user_id', input.companyUserId)
    .select('*')
    .single()
  if (error || !updated) throw new CompanyEmployeeError('Failed to update employee status', 500)

  await writeCompanyEmployeeAudit({
    identityId: input.identityId,
    eventType:
      input.status === 'inactive' ? 'company_employee_deactivated' : 'company_employee_activated',
    companyUserId: input.companyUserId,
    employeeUserId: existing.user_id,
    actorUserId: input.actorUserId,
  })

  return mapIdentity(updated as Record<string, unknown>)
}

const EMPLOYEE_ASSIGNABLE_PROJECT_STATUSES = [
  'planning',
  'active',
  'on-hold',
  'in_progress',
  'submitted',
] as const

const EMPLOYEE_HISTORY_PROJECT_STATUSES = new Set([
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

export function isProjectEligibleForEmployeeAssignment(projectStatus: unknown): boolean {
  const status = String(projectStatus || '')
    .trim()
    .toLowerCase()
  if (!status) return false
  if (EMPLOYEE_HISTORY_PROJECT_STATUSES.has(status)) return false
  return (EMPLOYEE_ASSIGNABLE_PROJECT_STATUSES as readonly string[]).includes(status)
}

export async function findOwnedCsrProjectForCompany(
  projectId: string,
  companyUserId: number
): Promise<{ id: string; title: string; project_status: string; company_user_id: number } | null> {
  const { data, error } = await supabase
    .from('csr_projects')
    .select('id, title, project_status, company_user_id')
    .eq('id', projectId)
    .eq('company_user_id', companyUserId)
    .maybeSingle()
  if (error) throw error
  if (!data) return null
  return {
    id: String(data.id),
    title: String(data.title || ''),
    project_status: String(data.project_status || ''),
    company_user_id: Number(data.company_user_id),
  }
}

export async function assignCompanyEmployeeToProject(input: {
  companyUserId: number
  actorUserId: number
  identityId: string
  projectId: string
}): Promise<{ assignment: CompanyEmployeeProjectAssignment; created: boolean }> {
  const identity = await findCompanyEmployeeIdentityForCompany(input.identityId, input.companyUserId)
  if (!identity) throw new CompanyEmployeeAssignmentError('Employee not found', 404)
  if (identity.status !== 'active') {
    throw new CompanyEmployeeAssignmentError('Only active employees can be assigned to projects', 409)
  }

  const project = await findOwnedCsrProjectForCompany(input.projectId, input.companyUserId)
  if (!project) throw new CompanyEmployeeAssignmentError('Project not found', 404)
  if (!isProjectEligibleForEmployeeAssignment(project.project_status)) {
    throw new CompanyEmployeeAssignmentError('This project is not eligible for employee assignment', 409)
  }

  const { data: existing, error: existingError } = await supabase
    .from('company_employee_project_assignments')
    .select('*')
    .eq('company_employee_identity_id', identity.id)
    .eq('project_id', project.id)
    .eq('company_user_id', input.companyUserId)
    .maybeSingle()
  if (existingError) throw existingError

  const now = new Date().toISOString()
  if (existing) {
    if (String(existing.status).toLowerCase() === 'active') {
      throw new CompanyEmployeeAssignmentError('Project is already assigned to this employee', 409)
    }
    const { data: reactivated, error } = await supabase
      .from('company_employee_project_assignments')
      .update({
        status: 'active',
        deactivated_at: null,
        assigned_by: input.actorUserId,
        assigned_at: now,
        updated_at: now,
      })
      .eq('id', existing.id)
      .select('*')
      .single()
    if (error || !reactivated) throw new CompanyEmployeeAssignmentError('Failed to assign project', 500)
    return { assignment: mapAssignment(reactivated as Record<string, unknown>), created: false }
  }

  const { data: created, error: createError } = await supabase
    .from('company_employee_project_assignments')
    .insert({
      company_employee_identity_id: identity.id,
      company_employee_user_id: identity.user_id,
      company_user_id: input.companyUserId,
      project_id: project.id,
      status: 'active',
      assigned_by: input.actorUserId,
      assigned_at: now,
    })
    .select('*')
    .single()
  if (createError || !created) {
    throw new CompanyEmployeeAssignmentError('Failed to assign project', 500)
  }
  return { assignment: mapAssignment(created as Record<string, unknown>), created: true }
}

export async function setCompanyEmployeeAssignmentStatus(input: {
  companyUserId: number
  identityId: string
  assignmentId: string
  status: 'active' | 'inactive'
  actorUserId: number
}) {
  const identity = await findCompanyEmployeeIdentityForCompany(input.identityId, input.companyUserId)
  if (!identity) throw new CompanyEmployeeAssignmentError('Employee not found', 404)

  const { data: existing, error: existingError } = await supabase
    .from('company_employee_project_assignments')
    .select('*')
    .eq('id', input.assignmentId)
    .eq('company_employee_identity_id', identity.id)
    .eq('company_user_id', input.companyUserId)
    .maybeSingle()
  if (existingError) throw existingError
  if (!existing) throw new CompanyEmployeeAssignmentError('Assignment not found', 404)

  if (input.status === 'active') {
    const project = await findOwnedCsrProjectForCompany(String(existing.project_id), input.companyUserId)
    if (!project || !isProjectEligibleForEmployeeAssignment(project.project_status)) {
      throw new CompanyEmployeeAssignmentError('This project is not eligible for employee assignment', 409)
    }
    if (identity.status !== 'active') {
      throw new CompanyEmployeeAssignmentError('Only active employees can hold active assignments', 409)
    }
  }

  const now = new Date().toISOString()
  const { data: updated, error } = await supabase
    .from('company_employee_project_assignments')
    .update({
      status: input.status,
      deactivated_at: input.status === 'inactive' ? now : null,
      updated_at: now,
    })
    .eq('id', input.assignmentId)
    .select('*')
    .single()
  if (error || !updated) throw new CompanyEmployeeAssignmentError('Failed to update assignment', 500)
  return mapAssignment(updated as Record<string, unknown>)
}

export async function listAuthorizedEmployeeProjects(
  identity: CompanyEmployeeIdentity,
  projectId?: string
) {
  // Requests already past this check may finish after a subsequent revocation.
  let query = supabase
    .from('company_employee_project_assignments')
    .select(`
      id, project_id, assigned_at,
      project:project_id!inner (
        id, title, project_status, region, start_date, end_date,
        ngo_user_id, company_user_id
      )
    `)
    .eq('company_employee_identity_id', identity.id)
    .eq('company_employee_user_id', identity.user_id)
    .eq('company_user_id', identity.company_user_id)
    .eq('status', 'active')
    .eq('project.company_user_id', identity.company_user_id)
    .order('assigned_at', { ascending: false })
  if (projectId) query = query.eq('project_id', projectId)

  const { data, error } = await query
  if (error) {
    console.error('Employee project authorization lookup failed')
    throw new AuthError('Authorization service temporarily unavailable', 503)
  }
  return data ?? []
}

export async function assertEmployeeAssignedToCompanyProject(input: {
  identity: CompanyEmployeeIdentity
  projectId: string
}): Promise<void> {
  const assignments = await listAuthorizedEmployeeProjects(input.identity, input.projectId)
  if (assignments.length !== 1) throw new CompanyEmployeeError('Project not found', 404)
}

export async function touchCompanyEmployeeLastLogin(identityId: string): Promise<void> {
  const { error } = await supabase
    .from('company_employee_identities')
    .update({
      last_login_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', identityId)
  if (error) {
    console.error('[company-employee] failed to update last_login_at:', error)
  }
}
