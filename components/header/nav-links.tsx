"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import {
  getPwaAppUrl,
  NAVADRISHTI_ABOUT_URL,
  NAVADRISHTI_CONTACT_HREF,
  shouldShowRootSubNavbar,
  type LaunchHeaderNavItem,
} from "@/lib/access-control"

const rootSubnavItems: LaunchHeaderNavItem[] = [
  {
    label: 'About Us',
    href: NAVADRISHTI_ABOUT_URL,
    description: 'About GRAM',
    external: true,
  },
  {
    label: 'Contact Us',
    href: NAVADRISHTI_CONTACT_HREF,
    description: 'Contact GRAM',
  },
]

export function HeaderNavLink({
  item,
  className,
}: {
  item: LaunchHeaderNavItem
  className: string
}) {
  const pathname = usePathname()
  const isActive =
    !item.external &&
    (pathname === item.href || (item.href !== '/' && pathname.startsWith(`${item.href}/`)))

  const resolvedClassName = cn(
    className,
    isActive && 'sidebar-nav-active'
  )

  if (item.external) {
    return (
      <a
        href={item.href}
        target={item.href.startsWith('mailto:') ? undefined : '_blank'}
        rel={item.href.startsWith('mailto:') ? undefined : 'noopener noreferrer'}
        className={resolvedClassName}
        title={item.description}
      >
        {item.label}
      </a>
    )
  }

  return (
    <Link href={item.href} className={resolvedClassName} title={item.description}>
      {item.label}
    </Link>
  )
}

export function PrimaryNavLinks({
  items,
  isLoading,
  keyPrefix,
  className,
  linkClassName,
  skeletonClassName,
}: {
  items: LaunchHeaderNavItem[]
  isLoading: boolean
  keyPrefix: string
  className: string
  linkClassName: string
  skeletonClassName: string
}) {
  return (
    <nav className={className}>
      {isLoading
        ? Array.from({ length: items.length }).map((_, index) => (
            <Skeleton key={`${keyPrefix}-skeleton-${index}`} className={skeletonClassName} />
          ))
        : items.map((item) => (
            <HeaderNavLink key={`${keyPrefix}-${item.href}`} item={item} className={linkClassName} />
          ))}
    </nav>
  )
}

export function SidebarUtilityNav({
  linkClassName,
  buttonClassName,
  className = '',
  isLoading = false,
}: {
  linkClassName: string
  buttonClassName: string
  className?: string
  isLoading?: boolean
}) {
  if (!shouldShowRootSubNavbar()) return null

  const pwaUrl = getPwaAppUrl()

  if (isLoading) {
    return (
      <div className={className}>
        <div className="mb-3 shrink-0">
          <Skeleton className="h-8 w-full rounded-md bg-white/40" />
        </div>
        <nav className="flex flex-col gap-1">
          {rootSubnavItems.map((item) => (
            <Skeleton key={`subnav-skeleton-${item.href}`} className="h-9 w-full rounded-md bg-white/40" />
          ))}
        </nav>
      </div>
    )
  }

  return (
    <div className={className}>
      <div className="relative z-10 mb-3 shrink-0">
        {pwaUrl ? (
          <a
            href={pwaUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Download the GRAM App"
            className={buttonClassName}
          >
            Download the GRAM App
          </a>
        ) : (
          <button
            type="button"
            disabled
            title="Set NEXT_PUBLIC_PWA_URL to enable the GRAM App download link"
            aria-label="Download the GRAM App (not configured)"
            className={buttonClassName}
          >
            Download the GRAM App
          </button>
        )}
      </div>
      <nav className="relative z-0 flex flex-col gap-1">
        {rootSubnavItems.map((item) => (
          <HeaderNavLink
            key={`subnav-${item.href}`}
            item={item}
            className={linkClassName}
          />
        ))}
      </nav>
    </div>
  )
}
