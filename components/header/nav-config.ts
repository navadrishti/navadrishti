import type { User } from "@/lib/auth-context"
import { getLaunchHeaderNavItems } from "@/lib/access-control"

export function getInitials(name: string) {
  if (!name) return "U"
  const names = name.split(' ')
  if (names.length === 1) return names[0].charAt(0).toUpperCase()
  return (names[0].charAt(0) + names[names.length - 1].charAt(0)).toUpperCase()
}

export function getDashboardLink(user: User | null) {
  if (!user) return '/'

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
  return [
    { label: 'Dashboard', href: getDashboardLink(user) },
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

/** Descriptions stay generic until mount so server and first client render match. */
export function getHeaderNavItems(user: User | null, mounted: boolean) {
  return getLaunchHeaderNavItems([
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
      description: 'Browse active initiatives'
    }
  ])
}
