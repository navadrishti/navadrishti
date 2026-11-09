import { describe, expect, it } from 'vitest'
import { getHeaderNavItems, getDashboardLink, getAccountLinks } from '@/components/header/nav-config'
import type { User } from '@/lib/auth-context'

const individual = { id: 3, user_type: 'individual', name: 'Indi' } as User
const company = { id: 1, user_type: 'company', name: 'Co' } as User
const ngo = { id: 2, user_type: 'ngo', name: 'NGO' } as User
const employee = {
  id: 13,
  user_type: 'individual',
  name: 'Emp',
  is_company_employee: true,
} as User

describe('header nav config', () => {
  it('keeps marketplace-only nav for guests', () => {
    const items = getHeaderNavItems(null, true)
    expect(items.map((item) => item.label)).toEqual([
      'NGO Network',
      'NGO Requests',
      'Capability Offers',
      'CSR Campaigns',
    ])
  })

  it('prepends the role dashboard for signed-in users after mount', () => {
    expect(getHeaderNavItems(individual, true)[0]).toMatchObject({
      label: 'Dashboard',
      href: '/individuals/dashboard',
    })
    expect(getHeaderNavItems(company, true)[0]).toMatchObject({
      label: 'Dashboard',
      href: '/companies/dashboard',
    })
    expect(getHeaderNavItems(ngo, true)[0]).toMatchObject({
      label: 'Dashboard',
      href: '/ngos/dashboard',
    })
  })

  it('uses a dedicated employee nav without marketplace links', () => {
    const items = getHeaderNavItems(employee, true)
    expect(items.map((item) => item.label)).toEqual(['Overview', 'Change Password'])
    expect(items.some((item) => item.href.includes('service-'))).toBe(false)
    expect(getAccountLinks(employee)).toEqual([
      { label: 'Change Password', href: '/employees/change-password' },
    ])
  })

  it('avoids dashboard hydration mismatch before mount', () => {
    const items = getHeaderNavItems(individual, false)
    expect(items[0]?.label).toBe('NGO Network')
    expect(items.some((item) => item.label === 'Dashboard')).toBe(false)
  })

  it('resolves dashboard links by role', () => {
    expect(getDashboardLink(individual)).toBe('/individuals/dashboard')
    expect(getDashboardLink(employee)).toBe('/employees/dashboard')
    expect(getDashboardLink(null)).toBe('/')
  })
})
