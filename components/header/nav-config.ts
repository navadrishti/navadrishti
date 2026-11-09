import type { User } from "@/lib/auth-context"
import {
  getLaunchHeaderNavItems,
  isCompanyEmployeeUserClient,
} from "@/lib/access-control"
import {
  COMPANY_EMPLOYEE_CHANGE_PASSWORD,
  COMPANY_EMPLOYEE_HOME,
} from "@/lib/company-employee-access"

export function getInitials(name: string) {
  if (!name) return "U"
  const names = name.split(' ')
  if (names.length === 1) return names[0].charAt(0).toUpperCase()
  return (names[0].charAt(0) + names[names.length - 1].charAt(0)).toUpperCase()
}

export function getDashboardLink(user: User | null) {
  if (!user) return '/'

  if (isCompanyEmployeeUserClient(user)) {
    return user.must_change_password ? COMPANY_EMPLOYEE_CHANGE_PASSWORD : COMPANY_EMPLOYEE_HOME
  }

  switch (user.user_type) {
    case 'ngo':
      return '/ngos/dashboard'
    case 'company':
      return '/companies/dashboard'
    case 'individual':
      return '/individuals/dashboard'
    default:
      return '/'
  }
}

export function getAccountLinks(user: User | null) {
  if (isCompanyEmployeeUserClient(user)) {
    return [{ label: 'Change Password', href: COMPANY_EMPLOYEE_CHANGE_PASSWORD }]
  }
  // Dashboard stays in the primary navbar only — avoid duplicating it here.
  return [
    { label: 'Help & Support', href: '/help-support' },
    { label: 'Settings', href: '/settings' },
  ]
}

function serviceRequestDescription(user: User | null, mounted: boolean) {
  if (!mounted || !user) return 'Browse NGO needs and CSR projects'
  if (user.user_type === 'individual') return 'Volunteer for NGO needs'
  if (user.user_type === 'company') return 'Browse CSR projects and needs'
  return 'Manage your needs and CSR projects'
}

function serviceOfferDescription(user: User | null, mounted: boolean) {
  if (!mounted || !user) return 'Browse capability offers'
  if (user.user_type === 'individual') return 'Browse & post your skills/services'
  if (user.user_type === 'company') return 'Browse & post your capabilities'
  return 'Browse & post capability offers'
}

function csrCampaignDescription(user: User | null, mounted: boolean) {
  if (!mounted || !user) return 'Browse active initiatives'
  if (user.user_type === 'company') return 'Browse and create CSR campaigns'
  if (user.user_type === 'individual') return 'Find volunteer CSR campaigns'
  if (user.user_type === 'ngo') return 'Track CSR campaign participation'
  return 'Browse active initiatives'
}

/** Descriptions stay generic until mount so server and first client render match. */
export function getHeaderNavItems(user: User | null, mounted: boolean) {
  // Company Employees: dedicated monitoring nav only (server role flags on the user object).
  if (mounted && user && isCompanyEmployeeUserClient(user)) {
    if (user.must_change_password) {
      return getLaunchHeaderNavItems([
        {
          label: 'Change Password',
          href: COMPANY_EMPLOYEE_CHANGE_PASSWORD,
          description: 'Required before monitoring access',
        },
      ])
    }
    return getLaunchHeaderNavItems([
      {
        label: 'Overview',
        href: COMPANY_EMPLOYEE_HOME,
        description: 'Assigned CSR project monitoring',
      },
      {
        label: 'Change Password',
        href: COMPANY_EMPLOYEE_CHANGE_PASSWORD,
        description: 'Update your account password',
      },
    ])
  }

  const marketplace = [
    {
      label: 'NGO Network',
      href: '/ngo-network',
      description: 'Browse verified NGOs'
    },
    {
      label: 'NGO Requests',
      href: '/service-requests',
      description: serviceRequestDescription(user, mounted)
    },
    {
      label: 'Capability Offers',
      href: '/service-offers',
      description: serviceOfferDescription(user, mounted)
    },
    {
      label: 'CSR Campaigns',
      href: '/csr-campaigns',
      description: csrCampaignDescription(user, mounted)
    }
  ]

  // Logged-in users need a direct path into their role dashboard from the primary nav.
  if (mounted && user) {
    return getLaunchHeaderNavItems([
      {
        label: 'Dashboard',
        href: getDashboardLink(user),
        description: 'Your role workspace'
      },
      ...marketplace
    ])
  }

  return getLaunchHeaderNavItems(marketplace)
}
