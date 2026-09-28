"use client"

import Link from "next/link"
import { Calendar, Lock, MapPin, Mail, Phone } from "lucide-react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { NgoComplianceBadges, VerificationBadge } from "@/components/verification-badge"
import { ProfileCoverMedia } from "@/components/profile-card"
import { getGramAvatarFallbackStyle } from "@/lib/gram-avatar"
import { formatMonthYear, getInitials } from "./helpers"
import type { UserProfile } from "./types"

export type PayActionState = "pay" | "verification-required" | "csr1-required" | "payout-not-connected" | "sign-in"

interface ProfileHeaderCardProps {
  profile: UserProfile
  allVerified: boolean
  isNgo: boolean
  payAction: PayActionState | null
  showContactLoginHint: boolean
  onPay: () => void
}

function PayActionButton({ state, onPay }: { state: PayActionState; onPay: () => void }) {
  if (state === "pay") {
    return (
      <Button
        size="sm"
        variant="outline"
        onClick={onPay}
      >
        Pay
      </Button>
    )
  }
  if (state === "sign-in") {
    return (
      <Button asChild size="sm" variant="outline">
        <Link href="/login">
          Sign in to pay
        </Link>
      </Button>
    )
  }
  const label =
    state === "verification-required"
      ? "Verification required"
      : state === "csr1-required"
        ? "CSR-1 required"
        : "Payout not connected"
  return (
    <Button size="sm" variant="outline" disabled>
      {label}
    </Button>
  )
}

export function ProfileHeaderCard({
  profile,
  allVerified,
  isNgo,
  payAction,
  showContactLoginHint,
  onPay,
}: ProfileHeaderCardProps) {
  const ngo = profile.ngo_public
  const bio = profile.bio || profile.profile_data?.bio || ""

  return (
    <Card className="mb-8 overflow-hidden">
      <ProfileCoverMedia src={profile.cover_image} className="h-36 w-full sm:h-48" alt="" />
      <CardContent className="pt-0">
        <div className="flex flex-col gap-6 md:flex-row">
          <Avatar className="z-10 -mt-12 h-28 w-28 border-4 border-white shadow-sm sm:h-32 sm:w-32">
            <AvatarImage src={profile.profile_image} />
            <AvatarFallback
              className="text-3xl"
              style={getGramAvatarFallbackStyle(profile.name)}
            >
              {getInitials(profile.name)}
            </AvatarFallback>
          </Avatar>

          <div className="min-w-0 flex-1 md:pt-4">
            <div className="mb-4 flex flex-col gap-3">
              <div className="flex flex-col items-start gap-2 sm:flex-row sm:flex-wrap sm:items-center">
                <h1 className="min-w-0 break-words text-3xl font-bold text-gray-900">{profile.name}</h1>
                {allVerified ? (
                  <VerificationBadge
                    status="verified"
                    size="xl"
                    showText={false}
                    badgeNumber={null}
                    className="max-w-full"
                  />
                ) : null}
              </div>
              {isNgo ? (
                <NgoComplianceBadges
                  tags={ngo?.ca_compliance_tags}
                  registrationType={ngo?.registration_type}
                  size="lg"
                  className="max-w-full"
                />
              ) : null}

              {payAction ? (
                <div className="flex flex-wrap items-center gap-2">
                  <PayActionButton state={payAction} onPay={onPay} />
                </div>
              ) : null}

              {profile.email ? (
                <p className="flex items-start gap-1.5 text-sm text-gray-600">
                  <Mail className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
                  <a href={`mailto:${profile.email}`} className="break-all hover:text-emerald-700 hover:underline">
                    {profile.email}
                  </a>
                </p>
              ) : null}

              {profile.phone ? (
                <p className="flex items-start gap-1.5 text-sm text-gray-600">
                  <Phone className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
                  <a
                    href={`tel:${profile.phone.replace(/\s+/g, "")}`}
                    className="break-all hover:text-emerald-700 hover:underline"
                  >
                    {profile.phone}
                  </a>
                </p>
              ) : null}

              {showContactLoginHint ? (
                <p className="flex items-start gap-1.5 text-sm text-gray-600">
                  <Lock className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
                  <Link href="/login" className="hover:text-emerald-700 hover:underline">
                    Log in to see contact details
                  </Link>
                </p>
              ) : null}

              <div className="flex flex-col gap-2 text-sm text-gray-600 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-4">
                {(profile.city || profile.location) && !isNgo ? (
                  <span className="flex items-center gap-1">
                    <MapPin className="h-4 w-4" />
                    {profile.city || profile.location}
                  </span>
                ) : null}
                <span className="flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  Joined {formatMonthYear(profile.created_at)}
                </span>
              </div>

              <div className="mt-2">
                <p className="mb-1 text-sm font-medium text-gray-500">About</p>
                <p className="whitespace-pre-wrap text-gray-700">{bio || "Not set"}</p>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
