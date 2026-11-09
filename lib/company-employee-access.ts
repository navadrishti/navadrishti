/**
 * Server-authoritative Company Employee surface boundaries.
 * Client nav hiding is not sufficient — proxy + canAccessRoute use these helpers.
 */

export const COMPANY_EMPLOYEE_HOME = '/employees/dashboard'
export const COMPANY_EMPLOYEE_CHANGE_PASSWORD = '/employees/change-password'

/** Page prefixes an active employee may open (after first-login password change). */
export const COMPANY_EMPLOYEE_ALLOWED_PAGE_PREFIXES = [
  '/employees/dashboard',
  '/employees/change-password',
] as const

/** Narrower surface while must_change_password is set. */
export const COMPANY_EMPLOYEE_PASSWORD_CHANGE_ALLOWED_PAGE_PREFIXES = [
  '/employees/change-password',
] as const

export const COMPANY_EMPLOYEE_ALLOWED_API_PREFIXES = [
  '/api/auth/logout',
  '/api/auth/me',
  '/api/employee',
] as const

export const COMPANY_EMPLOYEE_PASSWORD_CHANGE_ALLOWED_API_PREFIXES = [
  '/api/auth/logout',
  '/api/auth/me',
  '/api/employee/change-password',
] as const

function matchesPrefix(pathname: string, prefixes: readonly string[]): boolean {
  return prefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))
}

export function isCompanyEmployeePageAllowed(
  pathname: string,
  options: { mustChangePassword?: boolean } = {}
): boolean {
  const prefixes = options.mustChangePassword
    ? COMPANY_EMPLOYEE_PASSWORD_CHANGE_ALLOWED_PAGE_PREFIXES
    : COMPANY_EMPLOYEE_ALLOWED_PAGE_PREFIXES
  return matchesPrefix(pathname, prefixes)
}

export function isCompanyEmployeeApiAllowed(
  pathname: string,
  options: { mustChangePassword?: boolean } = {}
): boolean {
  const prefixes = options.mustChangePassword
    ? COMPANY_EMPLOYEE_PASSWORD_CHANGE_ALLOWED_API_PREFIXES
    : COMPANY_EMPLOYEE_ALLOWED_API_PREFIXES
  return matchesPrefix(pathname, prefixes)
}

export function companyEmployeeRedirectPath(options: { mustChangePassword?: boolean } = {}): string {
  return options.mustChangePassword ? COMPANY_EMPLOYEE_CHANGE_PASSWORD : COMPANY_EMPLOYEE_HOME
}

/** Milestone statuses counted as complete for employee progress meters. */
export const EMPLOYEE_MILESTONE_COMPLETED_STATUSES = new Set([
  'completed',
  'paid',
  'approved',
])

/** Milestone statuses counted as pending review. */
export const EMPLOYEE_MILESTONE_PENDING_REVIEW_STATUSES = new Set([
  'submitted',
  'under_review',
  'pending_review',
  'in_review',
])

/** Milestone statuses that need attention after rejection. */
export const EMPLOYEE_MILESTONE_REJECTED_STATUSES = new Set([
  'rejected',
  'needs_revision',
  'revision_required',
])

/**
 * Overall milestone completion = completedStatuses / total milestones.
 * Returns null when total is 0 (metric unavailable — do not show 0% bars).
 */
export function employeeMilestoneCompletionPercent(
  completed: number,
  total: number
): number | null {
  if (!(total > 0) || !Number.isFinite(completed) || !Number.isFinite(total)) return null
  return Math.min(100, Math.max(0, Math.round((completed / total) * 100)))
}
