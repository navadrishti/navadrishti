export type FieldOfficerPermissions = {
  can_submit_field_evidence: boolean
}

export type FieldOfficerUser = {
  id: number
  name: string | null
  email: string | null
}

export type FieldOfficerActivityItem = {
  id: string
  event_type: string
  event_payload: Record<string, unknown> | null
  created_at: string | null
  created_by: number | null
}

export type FieldOfficerIdentity = {
  id: string
  user_id: number
  ngo_user_id: number
  status: string
  permissions: FieldOfficerPermissions | Record<string, unknown> | null
  must_change_password: boolean | null
  created_by: number | null
  created_at: string | null
  updated_at: string | null
  last_login_at: string | null
  deactivated_at: string | null
  users?: FieldOfficerUser | FieldOfficerUser[] | null
  activity?: FieldOfficerActivityItem[]
}

export type FieldOfficerForm = {
  name: string
  email: string
  password: string
}

export type FieldAssignmentLockInfo = {
  startDate: string | null
  startAt: string | null
  lockAt: string | null
  locked: boolean
  timeZone: string
}

export type FieldOfficerStatusFilter = 'all' | 'active' | 'inactive'
export type FieldOfficerPasswordFilter = 'all' | 'required' | 'configured'
export type FieldOfficerAssignmentStatusFilter = 'all' | 'active' | 'inactive'

export type EligibleFieldProject = {
  id: string
  title: string
  project_status: string
  region?: string | null
  start_date?: string | null
  end_date?: string | null
  assignment_lock?: FieldAssignmentLockInfo
  assignment_editable?: boolean
}

export type FieldOfficerProjectAssignment = {
  id: string
  field_officer_identity_id: string
  field_officer_user_id: number
  ngo_user_id: number
  project_id: string
  status: string
  assigned_by: number | null
  assigned_at: string | null
  deactivated_at: string | null
  created_at: string | null
  updated_at: string | null
  assignment_lock?: FieldAssignmentLockInfo
  assignment_editable?: boolean
  project?:
    | {
        id: string
        title: string | null
        project_status: string | null
        region?: string | null
        start_date?: string | null
        end_date?: string | null
      }
    | Array<{
        id: string
        title: string | null
        project_status: string | null
        region?: string | null
        start_date?: string | null
        end_date?: string | null
      }>
    | null
}

export function normalizeOfficerPermissions(
  value: FieldOfficerIdentity['permissions']
): FieldOfficerPermissions {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { can_submit_field_evidence: false }
  }
  const record = value as Record<string, unknown>
  return {
    can_submit_field_evidence: record.can_submit_field_evidence === true,
  }
}

export function officerDisplayName(officer: FieldOfficerIdentity): string {
  const user = Array.isArray(officer.users) ? officer.users[0] : officer.users
  return user?.name?.trim() || 'Field Officer'
}

export function officerEmail(officer: FieldOfficerIdentity): string {
  const user = Array.isArray(officer.users) ? officer.users[0] : officer.users
  return user?.email?.trim() || 'No email'
}

export function formatOfficerActivityLabel(eventType: string): string {
  switch (eventType) {
    case 'ngo_field_officer_created':
      return 'Account created'
    case 'ngo_field_officer_activated':
      return 'Account activated'
    case 'ngo_field_officer_deactivated':
      return 'Account deactivated'
    case 'ngo_field_officer_profile_updated':
      return 'Profile updated'
    case 'ngo_field_officer_password_reset':
      return 'Password reset by NGO administrator'
    case 'ngo_field_officer_permissions_updated':
      return 'Permissions updated'
    case 'ngo_field_officer_project_assigned':
      return 'Assigned to project'
    case 'ngo_field_officer_project_assignment_deactivated':
      return 'Project assignment deactivated'
    case 'ngo_field_officer_project_assignment_reactivated':
      return 'Project assignment reactivated'
    case 'ngo_field_officer_device_bound':
      return 'Device bound'
    case 'ngo_field_officer_device_reassigned':
      return 'Device reassigned'
    default:
      return eventType.replace(/^ngo_field_officer_/, '').replaceAll('_', ' ')
  }
}

export function assignmentProject(
  assignment: FieldOfficerProjectAssignment
): {
  id: string
  title: string
  project_status: string
  region?: string | null
  start_date?: string | null
} | null {
  const project = Array.isArray(assignment.project) ? assignment.project[0] : assignment.project
  if (!project?.id) return null
  return {
    id: String(project.id),
    title: String(project.title || 'Untitled project'),
    project_status: String(project.project_status || 'unknown'),
    region: project.region,
    start_date: project.start_date ?? null,
  }
}

export function formatLockWhen(iso: string | null | undefined) {
  if (!iso) return '—'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}
