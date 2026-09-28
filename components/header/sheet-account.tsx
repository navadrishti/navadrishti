"use client"

import Link from "next/link"
import type { User } from "@/lib/auth-context"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Skeleton } from "@/components/ui/skeleton"
import { VerifiedAccountName } from "@/components/verification-badge"
import { getGramAvatarFallbackStyle } from "@/lib/gram-avatar"
import { getAccountLinks, getInitials } from "./nav-config"

export function SheetAccount({
  user,
  isLoading,
  onLogout,
}: {
  user: User | null
  isLoading: boolean
  onLogout: () => void
}) {
  return (
    <div className="border-t border-white/20 pt-6">
      {isLoading ? (
        <div className="space-y-3 pb-8">
          <div className="mb-6 flex items-center gap-4">
            <Skeleton className="h-12 w-12 rounded-full bg-white/40" />
            <div className="grid flex-1 gap-2">
              <Skeleton className="h-5 w-36 bg-white/40" />
              <Skeleton className="h-4 w-44 bg-white/30" />
            </div>
          </div>
          <Skeleton className="h-12 w-full rounded-md bg-white/40" />
          <Skeleton className="h-12 w-full rounded-md bg-white/40" />
        </div>
      ) : user ? (
        <div>
          <div className="mb-6 flex min-w-0 items-center gap-4">
            <Avatar className="h-12 w-12">
              {user.profile_image && <AvatarImage src={user.profile_image} alt={user.name} />}
              <AvatarFallback
                className="text-lg font-semibold"
                style={getGramAvatarFallbackStyle(user.name)}
              >
                {getInitials(user.name)}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 grid gap-1">
              <VerifiedAccountName
                name={user.name}
                status={user.verification_status}
                size="sm"
                nameClassName="truncate text-lg font-medium text-white"
              />
              <p className="truncate text-sm text-white/80">{user.email}</p>
            </div>
          </div>

          <div className="space-y-3 pb-8">
            {getAccountLinks(user).map((link) => (
              <Link key={link.label} href={link.href}>
                <Button variant="outline" className="w-full h-12 text-udaan-navy border-udaan-navy bg-white hover:bg-udaan-orange hover:border-udaan-orange hover:text-white transition-colors">
                  {link.label}
                </Button>
              </Link>
            ))}
            <Button
              variant="outline"
              className="w-full h-12 text-white border-red-500 bg-red-500 hover:bg-red-600 hover:border-red-600 hover:text-white transition-colors"
              onClick={onLogout}
            >
              Log out
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-3 pb-8">
          <Link href="/login">
            <Button variant="outline" className="w-full h-12 text-udaan-navy border-udaan-navy bg-white hover:bg-udaan-navy hover:text-white transition-colors">
              Sign In
            </Button>
          </Link>
          <Link href="/register">
            <Button className="w-full h-12 bg-udaan-orange hover:bg-udaan-orange/90 border-none text-white transition-colors">
              Get Started
            </Button>
          </Link>
        </div>
      )}
    </div>
  )
}
