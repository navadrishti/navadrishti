"use client"

import Link from "next/link"
import { ChevronRight } from "lucide-react"
import type { User } from "@/lib/auth-context"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Skeleton } from "@/components/ui/skeleton"
import { VerificationBadge } from "@/components/verification-badge"
import { getGramAvatarFallbackStyle } from "@/lib/gram-avatar"
import { getAccountLinks, getInitials } from "./nav-config"
import { useProfileMenu } from "./use-profile-menu"

export function SidebarAccount({
  user,
  isLoading,
  onLogout,
}: {
  user: User | null
  isLoading: boolean
  onLogout: () => void
}) {
  const { isProfileMenuOpen, openProfileMenu, closeProfileMenuWithDelay } = useProfileMenu()
  const profileTriggerLabel = user?.name || 'Profile'

  return (
    <div className="shrink-0 border-t border-white/15 p-3">
      {isLoading ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-10 w-full rounded-md bg-white/40" />
          <Skeleton className="h-10 w-full rounded-md bg-udaan-orange/60" />
        </div>
      ) : user ? (
        <div
          onMouseEnter={openProfileMenu}
          onMouseLeave={() => closeProfileMenuWithDelay()}
          className="relative shrink-0"
        >
          <button
            type="button"
            className="inline-flex h-10 w-full shrink-0 items-center gap-2 rounded-md bg-transparent px-2 text-white"
            onMouseDown={(e) => e.preventDefault()}
            onClick={(e) => e.preventDefault()}
            title={profileTriggerLabel}
          >
            <Avatar className="h-9 w-9 shrink-0">
              {user.profile_image && <AvatarImage src={user.profile_image} alt={user.name} />}
              <AvatarFallback style={getGramAvatarFallbackStyle(user.name)}>
                {getInitials(user.name)}
              </AvatarFallback>
            </Avatar>
            <span className="max-w-[148px] truncate text-sm font-medium">
              {profileTriggerLabel}
            </span>
            <ChevronRight className={`ml-auto h-4 w-4 shrink-0 opacity-80 transition-transform ${isProfileMenuOpen ? "rotate-180" : "rotate-0"}`} />
          </button>

          {isProfileMenuOpen && (
            <div className="absolute left-full bottom-0 z-50 ml-2 w-56 overflow-hidden rounded-md border bg-white p-1 text-black shadow-lg">
              <div className="truncate px-2 py-1.5 text-sm font-semibold leading-5 text-gray-900">{user.name}</div>
              <div className="px-2 py-1 text-xs text-muted-foreground">
                <span className="block truncate">{user.email} • {user.user_type.charAt(0).toUpperCase() + user.user_type.slice(1)}</span>
              </div>
              {user.verification_status === 'verified' ? (
                <div className="min-w-0 overflow-hidden px-2 pb-1.5">
                  <VerificationBadge
                    status="verified"
                    size="readable"
                    showText={false}
                    badgeNumber={null}
                    className="max-w-full min-w-0"
                  />
                </div>
              ) : null}
              <div className="my-1 h-px bg-gray-200" />
              {getAccountLinks(user).map((link) => (
                <Link key={link.label} href={link.href} className="block rounded px-2 py-2 text-sm text-gray-800 hover:bg-gray-100">{link.label}</Link>
              ))}
              <div className="my-1 h-px bg-gray-200" />
              <button
                type="button"
                className="block w-full rounded px-2 py-2 text-left text-sm text-red-600 hover:bg-red-50"
                onClick={onLogout}
              >
                Log out
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <Link href="/login">
            <Button variant="ghost" className="flex w-full items-center justify-center gap-2 text-white hover:text-udaan-orange hover:bg-white/10">
              Sign In
            </Button>
          </Link>
          <Link href="/register">
            <Button className="w-full bg-udaan-orange hover:bg-udaan-orange/90 border-none text-white">Get Started</Button>
          </Link>
        </div>
      )}
    </div>
  )
}
