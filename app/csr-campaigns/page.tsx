"use client"

import { useIsClient } from "@/hooks/use-is-client"
import { isFullyVerifiedAccount } from "@/lib/auth"
import { Header } from "@/components/header"
import { Button } from "@/components/ui/button"
import { SkeletonCampaignCard } from "@/components/ui/skeleton"
import { useAuth } from "@/lib/auth-context"
import { isCampaignStarted, isVolunteerRegistrationPastDeadline } from "@/lib/format-date"
import { getVolunteerButtonState } from "@/lib/campaign-schema"
import { isCampaignLeadNgo } from "@/lib/campaign-volunteer-attendance"
import type { Campaign } from "./types"
import { useCampaigns } from "./use-campaigns"
import { useCampaignFilters } from "./use-campaign-filters"
import { CatalystCta, CatalystCtaSkeleton } from "./catalyst-cta"
import { CampaignFilters } from "./campaign-filters"
import { CampaignCard } from "./campaign-card"

export default function CSRCampaignsPage() {
  const { user } = useAuth()
  const allVerified = isFullyVerifiedAccount(user)
  const isHydrated = useIsClient()

  const effectiveUserType = isHydrated ? user?.user_type : undefined
  const isCompany = effectiveUserType === 'company'
  const canShowVolunteerAction = effectiveUserType === 'ngo' || effectiveUserType === 'individual'
  const currentUserId = Number(user?.id || 0)
  const isCompanyOwner = (campaignCompanyId?: number | null) => isCompany && Number(campaignCompanyId || 0) === currentUserId

  const {
    campaigns,
    loading,
    deletingCampaignId,
    applyingCampaignId,
    volunteerForCampaign,
    deleteCampaign,
  } = useCampaigns(currentUserId, user?.user_type)
  const filters = useCampaignFilters()

  const filteredCampaigns = campaigns.filter((campaign) => {
    const isDraftHiddenFromPublic = String(campaign.status || '').toLowerCase() === 'draft' && !isCompanyOwner(campaign.companyId)
    return filters.matchesFilters(campaign) && !isDraftHiddenFromPublic
  })

  const volunteerStateFor = (campaign: Campaign) => {
    const isLeadNgoForCampaign =
      currentUserId > 0 &&
      isCampaignLeadNgo({ lead_ngo_user_id: campaign.selectedLeadNgoId }, currentUserId)
    if (!canShowVolunteerAction || !user || isLeadNgoForCampaign) return null

    return getVolunteerButtonState({
      status: campaign.status,
      startDate: campaign.start_date,
      leadNgoAccepted: campaign.leadNgoAccepted,
      volunteerCount: campaign.volunteerCount,
      volunteerLimit: campaign.volunteerLimit,
      userType: effectiveUserType,
      allVerified,
      applied: Boolean(campaign.appliedByCurrentUser),
      applying: applyingCampaignId === campaign.id,
      isVolunteerRegistrationPastDeadline,
      isCampaignStarted,
    })
  }

  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="flex-1 px-6 py-8 md:px-10">
        <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">CSR Campaigns</h1>
            <p className="text-muted-foreground">Discover and participate in corporate social responsibility initiatives</p>
          </div>
        </div>

        {isCompany ? (loading ? <CatalystCtaSkeleton /> : <CatalystCta />) : null}

        <CampaignFilters filters={filters} loading={loading} resultCount={filteredCampaigns.length} />

        <div className="min-h-[400px]">
          {loading ? (
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <SkeletonCampaignCard key={i} />
              ))}
            </div>
          ) : filteredCampaigns.length > 0 ? (
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {filteredCampaigns.map((campaign) => (
                <CampaignCard
                  key={campaign.id}
                  campaign={campaign}
                  isOwner={isCompanyOwner(campaign.companyId)}
                  isDeleting={deletingCampaignId === campaign.id}
                  volunteerState={volunteerStateFor(campaign)}
                  onVolunteer={volunteerForCampaign}
                  onDelete={deleteCampaign}
                />
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center p-8 text-center">
              <h3 className="mb-1 text-lg font-semibold">No campaigns found</h3>
              <p className="mb-4 text-muted-foreground">No campaigns match your current search or filters.</p>
              <Button
                variant="outline"
                onClick={filters.clearFilters}
              >
                Clear Filters
              </Button>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
