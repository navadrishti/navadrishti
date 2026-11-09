export type CompanyEmployeeIdentity = {
  id: string
  user_id: number
  company_user_id: number
  status: string
  must_change_password: boolean
  created_at: string
  updated_at: string
  last_login_at: string | null
  deactivated_at: string | null
  users?: { id: number; name: string | null; email: string | null } | null
  assignments?: CompanyEmployeeAssignment[]
  activity?: Array<{
    id: string
    event_type: string
    event_payload: Record<string, unknown> | null
    created_at: string
  }>
}

export type CompanyEmployeeAssignment = {
  id: string
  company_employee_identity_id: string
  project_id: string
  status: string
  assigned_at: string
  deactivated_at: string | null
  project?: {
    id: string
    title: string | null
    project_status: string | null
    region?: string | null
    start_date?: string | null
    end_date?: string | null
  } | null
}

export type EligibleEmployeeProject = {
  id: string
  title: string
  project_status: string
  region: string | null
  start_date: string | null
  end_date: string | null
}
