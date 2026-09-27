"use client"

import { useState } from "react"
import { useParams } from "next/navigation"
import { Header } from "@/components/header"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { PHONE_VERIFICATION_ENABLED, isCaVerifiedAccount, visibleCaBadgeNumber } from "@/lib/auth"
import { useAuth } from "@/lib/auth-context"
import { NgoPayDialog } from "@/components/ngo-pay-dialog"
import { InfoRow, VerificationStatusRow } from "./profile-fields"
import { NgoProfileSections } from "./ngo-profile-sections"
import { ProfileErrorView, ProfileLoadingView } from "./profile-status-views"
import { ProfileHeaderCard, type PayActionState } from "./profile-header-card"
import { VolunteeringHistorySection } from "./volunteering-history-section"
import { formatMonthYear, formatUserType } from "./helpers"
import { usePublicProfile } from "./use-public-profile"

export default function ImpactProfilePage() {
  const params = useParams<{ id: string }>()
  const id = String(params?.id || "")
  const { user } = useAuth()
  const { profile, loading, error, viewingDoc, setViewingDoc } = usePublicProfile(id)
  const [payDialogOpen, setPayDialogOpen] = useState(false)

  const allVerified = Boolean(
    profile?.email_verified &&
      (PHONE_VERIFICATION_ENABLED ? profile?.phone_verified : true) &&
      profile?.verification_status === "verified"
  )
  const caBadgeNumber =
    visibleCaBadgeNumber(profile?.verification_status, profile?.profile_data) ||
    (allVerified ? profile?.ca_badge_number || null : null)
  const isNgo = profile?.user_type === "ngo"
  const ngo = profile?.ngo_public
  const canPay = user?.user_type === "individual" || user?.user_type === "company"
  const isNgoViewer = user?.user_type === "ngo"
  const payerCaVerified = isCaVerifiedAccount(user?.verification_status)
  const hasCsr1 = Boolean(ngo?.csr_eligible || ngo?.ca_compliance_tags?.includes("csr1"))
  const acceptsPayments = Boolean(ngo?.accepts_payments)
  const canPayThisNgo =
    Boolean(isNgo) &&
    canPay &&
    payerCaVerified &&
    acceptsPayments &&
    (user?.user_type !== "company" || hasCsr1)
  const showPayActions = isNgo && !isNgoViewer

  let payAction: PayActionState | null = null
  if (showPayActions) {
    if (canPayThisNgo) payAction = "pay"
    else if (canPay && !payerCaVerified) payAction = "verification-required"
    else if (canPay && user?.user_type === "company" && !hasCsr1) payAction = "csr1-required"
    else if (canPay) payAction = "payout-not-connected"
    else payAction = "sign-in"
  }

  if (loading) {
    return <ProfileLoadingView />
  }

  if (error || !profile) {
    return <ProfileErrorView message={error || "Profile not found"} />
  }

  return (
    <>
      <Header />
      <div className="container mx-auto px-4 py-8">
        <ProfileHeaderCard
          profile={profile}
          allVerified={allVerified}
          isNgo={isNgo}
          payAction={payAction}
          onPay={() => setPayDialogOpen(true)}
        />

        <Card>
          <CardHeader>
            <CardTitle>{isNgo ? "Organization Profile" : "Profile Information"}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-8">
            {isNgo ? (
              <NgoProfileSections
                profile={profile}
                allVerified={allVerified}
                caBadgeNumber={caBadgeNumber}
                viewingDoc={viewingDoc}
                onViewDoc={setViewingDoc}
              />
            ) : (
              <div className="space-y-8">
                <div className="grid gap-4 md:grid-cols-2">
                  <InfoRow label="User type" value={formatUserType(profile.user_type)} />
                  {profile.email ? (
                    <>
                      <InfoRow label="Contact email" value={profile.email} />
                      <InfoRow label="Contact phone" value={profile.phone || undefined} />
                    </>
                  ) : null}
                  <InfoRow label="Member since" value={formatMonthYear(profile.created_at)} />
                  <InfoRow label="Location" value={profile.city || profile.location || undefined} />
                  <VerificationStatusRow
                    allVerified={allVerified}
                    emailVerified={Boolean(profile.email_verified)}
                    phoneVerified={Boolean(profile.phone_verified)}
                    badgeNumber={caBadgeNumber}
                  />
                  {profile.website ? <InfoRow label="Website" value={profile.website} /> : null}
                </div>

                <VolunteeringHistorySection history={profile.volunteering_history} />
              </div>
            )}
          </CardContent>
        </Card>
      </div>
      {showPayActions ? (
        <NgoPayDialog
          ngo={{ id: profile.id, name: profile.name, email: profile.email }}
          open={payDialogOpen}
          onOpenChange={setPayDialogOpen}
        />
      ) : null}
    </>
  )
}
