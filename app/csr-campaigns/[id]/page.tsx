"use client"

import { useParams, useRouter } from "next/navigation"
import { Header } from "@/components/header"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { ArrowLeft, CheckCircle2 } from "lucide-react"
import { useCampaignDetail } from "./use-campaign-detail"
import { CampaignDetailSkeleton } from "./campaign-detail-skeleton"
import { CampaignDetailFields } from "./campaign-detail-fields"
import { CompanyOwnerSection } from "./company-owner-section"

export default function CSRCampaignDetailPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const campaignId = String(params?.id || "")
  const {
    user,
    campaign,
    loading,
    error,
    accepting,
    volunteerState,
    canShowVolunteerAction,
    isDraft,
    hasPendingLeadInvite,
    acceptedDraftLead,
    volunteer,
    acceptLeadRole,
  } = useCampaignDetail(campaignId)

  return (
    <div className="min-h-screen overflow-x-hidden bg-background">
      <Header />
      <div className="mx-auto max-w-7xl px-4 py-8">
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Button
            variant="ghost"
            onClick={() => router.back()}
            className="w-full justify-start px-0 text-udaan-blue hover:text-gram-ink hover:bg-transparent active:bg-transparent focus-visible:bg-transparent focus-visible:ring-0 sm:w-auto"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
          {canShowVolunteerAction && user && campaign ? (
            volunteerState.label === 'Applied' ? (
              <Button disabled variant="outline" className="w-full gap-1 text-emerald-600 sm:w-auto">
                <CheckCircle2 className="h-4 w-4" />
                Applied
              </Button>
            ) : (
              <Button
                onClick={volunteer}
                disabled={!volunteerState.canApply}
                className="w-full sm:w-auto"
              >
                {volunteerState.label}
              </Button>
            )
          ) : isDraft && campaign ? (
            <span className="self-start rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-600 sm:self-auto">
              Draft – not launched yet
            </span>
          ) : null}
        </div>

        {loading ? (
          <CampaignDetailSkeleton />
        ) : error || !campaign ? (
          <Alert>
            <AlertDescription>{error || 'Campaign not found.'}</AlertDescription>
          </Alert>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            <div className="lg:col-span-12 min-w-0">
              <Card>
                <CardContent className="pt-6">
                  <Tabs defaultValue="details" className="w-full">
                    <TabsList className="flex w-full gap-2 overflow-x-auto pb-1">
                      <TabsTrigger value="details" className="shrink-0 whitespace-nowrap">Campaign Details</TabsTrigger>
                      <TabsTrigger value="owner" className="shrink-0 whitespace-nowrap">Company Owner</TabsTrigger>
                    </TabsList>

                    <TabsContent value="details" className="mt-4 space-y-4">
                      <CampaignDetailFields campaign={campaign} />

                      {hasPendingLeadInvite ? (
                        <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-4">
                          <p className="text-sm text-muted-foreground mb-3">
                            You have been invited as the lead NGO for this campaign.
                          </p>
                          <Button onClick={acceptLeadRole} disabled={accepting}>
                            {accepting ? 'Accepting…' : 'Accept Lead Role'}
                          </Button>
                        </div>
                      ) : acceptedDraftLead ? (
                        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
                          You accepted the lead NGO role. The company will launch the campaign once its draft is finalised.
                        </div>
                      ) : null}
                    </TabsContent>

                    <TabsContent value="owner" className="mt-4 space-y-4">
                      <CompanyOwnerSection campaign={campaign} />
                    </TabsContent>
                  </Tabs>
                </CardContent>
              </Card>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
