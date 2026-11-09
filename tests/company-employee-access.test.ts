import { describe, expect, it } from 'vitest'
import {
  companyEmployeeRedirectPath,
  employeeMilestoneCompletionPercent,
  isCompanyEmployeeApiAllowed,
  isCompanyEmployeePageAllowed,
} from '@/lib/company-employee-access'

describe('company employee access helpers', () => {
  it('allows only employee pages after password change', () => {
    expect(isCompanyEmployeePageAllowed('/employees/dashboard')).toBe(true)
    expect(isCompanyEmployeePageAllowed('/employees/change-password')).toBe(true)
    expect(isCompanyEmployeePageAllowed('/')).toBe(false)
    expect(isCompanyEmployeePageAllowed('/companies/dashboard')).toBe(false)
    expect(isCompanyEmployeePageAllowed('/service-offers')).toBe(false)
  })

  it('restricts to change-password while must_change_password is set', () => {
    expect(
      isCompanyEmployeePageAllowed('/employees/change-password', { mustChangePassword: true })
    ).toBe(true)
    expect(
      isCompanyEmployeePageAllowed('/employees/dashboard', { mustChangePassword: true })
    ).toBe(false)
    expect(companyEmployeeRedirectPath({ mustChangePassword: true })).toBe(
      '/employees/change-password'
    )
  })

  it('allows only employee APIs', () => {
    expect(isCompanyEmployeeApiAllowed('/api/employee/projects')).toBe(true)
    expect(isCompanyEmployeeApiAllowed('/api/auth/me')).toBe(true)
    expect(isCompanyEmployeeApiAllowed('/api/csr-projects')).toBe(false)
    expect(
      isCompanyEmployeeApiAllowed('/api/employee/projects', { mustChangePassword: true })
    ).toBe(false)
  })

  it('computes milestone completion only when totals exist', () => {
    expect(employeeMilestoneCompletionPercent(2, 4)).toBe(50)
    expect(employeeMilestoneCompletionPercent(0, 0)).toBeNull()
    expect(employeeMilestoneCompletionPercent(1, 0)).toBeNull()
  })
})
