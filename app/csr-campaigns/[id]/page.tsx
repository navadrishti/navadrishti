"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import { Header } from "@/components/header"
import { DetailField, DetailSection, displayValue } from "@/components/detail-fields"
import { formatDetailDate } from "@/lib/format-date"
import { Badge } from "@/components/ui/badge"
import { readCampaignCategory, readCampaignDuration, readCampaignLocation } from "@/lib/campaign-schema"
import { useAuth } from '@/lib/auth-context'
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { ArrowLeft, CheckCircle2 } from "lucide-react"
import { formatDisplayDate, isCampaignStarted, isVolunteerRegistrationPastDeadline } from "@/lib/format-date"
import { getVolunteerButtonState, sumVolunteerApplicationCount } from '@/lib/campaign-volunteer-utils'

interface Campaign {
  id: string
  title: string | null
  description: string | null
  category: string | null
  location: string | null
  budget_inr: number | null
  budget_breakdown: Record<string, number> | null
  schedule_vii: string | null
  sdg_alignment: number[] | null
  impact_metrics: Record<string, any> | null
  milestones: Array<Record<string, any>> | null
  created_at: string
  updated_at: string
  start_date: string | null
  end_date: string | null
  company_id: number | null
  status?: string | null
}

type CampaignRecord = {
  id?: string
  title?: string | null
  description?: string | null
  category?: string | null
  location?: string | null
  budget_inr?: number | null
  budget_breakdown?: Record<string, number> | null
  schedule_vii?: string | null
  sdg_alignment?: number[] | null
  impact_metrics?: Record<string, unknown> | null
  milestones?: Array<Record<string, unknown>> | null
  start_date?: string | null
  end_date?: string | null
  company_id?: number | null
  status?: string | null
}

function formatCurrency(amount: number | null | undefined) {
  const value = Number(amount || 0)
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(value)
}

function parseCityState(location: string, impact: Record<string, unknown>) {
  const city = String(impact.city || '').trim()
  const state = String(impact.state || impact.state_province || '').trim()
  if (city || state) {
    return { city: city || 'Not set', state: state || 'Not set' }
  }

  const parts = location.split(',').map((part) => part.trim()).filter(Boolean)
  if (parts.length >= 2) {
    return { city: parts[0], state: parts.slice(1).join(', ') }
  }
  if (parts.length === 1) {
    return { city: parts[0], state: 'Not set' }
  }
  return { city: 'Not set', state: 'Not set' }
}

function labelForBudgetKey(key: string) {
  return key.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase())
}

function CampaignDetailFields({ campaign }: { campaign: CampaignRecord }) {
  const impact = campaign.impact_metrics && typeof campaign.impact_metrics === 'object'
    ? campaign.impact_metrics
    : {}
  const location = readCampaignLocation(campaign)
  const { city, state } = parseCityState(location, impact)
  const volunteerRequirement = String(impact.volunteer_requirement || impact.volunteerRequirement || '')
  const beneficiaries = impact.beneficiaries ?? impact.impact_reach
  const duration = readCampaignDuration(campaign)
  const selectedLeadNgoName = String(impact.selected_lead_ngo_name || '')
  const selectedLeadNgoId = Number(impact.selected_lead_ngo_id || 0)
  const invitedOfferIds = Array.isArray(impact.invited_offer_ids) ? impact.invited_offer_ids : []
  const sdgAlignment = Array.isArray(campaign.sdg_alignment) ? campaign.sdg_alignment : []
  const budgetParts = Object.entries(campaign.budget_breakdown || {})
    .map(([label, value]) => ({ label, value: Number(value) || 0 }))
    .filter((entry) => entry.value > 0)
  const milestones = Array.isArray(campaign.milestones) ? campaign.milestones : []

  return (
    <div className="space-y-6">
      <section className="space-y-6">
        <h3 className="text-sm font-medium text-gray-500">Campaign Details</h3>

        <div>
          <p className="text-sm text-gray-500">Campaign Name</p>
          <p className="text-sm font-medium text-slate-800">{campaign.title || readCampaignCategory(campaign) || 'Not set'}</p>
        </div>

        <section className="space-y-3">
          <h4 className="text-sm font-medium text-gray-500">Description</h4>
          <p className="whitespace-pre-wrap break-words text-sm text-muted-foreground">
            {displayValue(campaign.description)}
          </p>
        </section>

        <div className="grid grid-cols-1 gap-x-12 gap-y-6 md:grid-cols-2">
          <DetailField label="Category (Schedule VII)" value={displayValue(campaign.category || campaign.schedule_vii)} />
          <DetailField label="City" value={city} />
          <DetailField label="State / Province" value={state} />
          <DetailField label="Budget (INR)" value={formatCurrency(campaign.budget_inr)} />
          <DetailField label="Volunteer Requirement" value={displayValue(volunteerRequirement)} />
          <DetailField label="Start Date" value={formatDisplayDate(campaign.start_date) || formatDetailDate(campaign.start_date)} />
          <DetailField label="End Date" value={formatDisplayDate(campaign.end_date) || formatDetailDate(campaign.end_date)} />
        </div>
      </section>

      <DetailSection title="Impact & Alignment">
        <DetailField
          label="Expected Beneficiaries"
          value={
            beneficiaries != null && Number(beneficiaries) > 0
              ? Number(beneficiaries).toLocaleString('en-IN')
              : 'Not set'
          }
        />
        <DetailField label="Duration" value={displayValue(duration)} />
        <div className="md:col-span-2">
          <p className="text-sm text-gray-500">SDG Alignment</p>
          {sdgAlignment.length > 0 ? (
            <div className="mt-1 flex flex-wrap gap-2">
              {sdgAlignment.map((sdg) => (
                <Badge key={sdg} variant="secondary" className="border-gray-200 bg-gray-100 text-gray-700">
                  SDG {sdg}
                </Badge>
              ))}
            </div>
          ) : (
            <p className="mt-1 text-sm font-medium text-slate-800">Not set</p>
          )}
        </div>
      </DetailSection>

      <DetailSection title="Budget Breakdown">
        {budgetParts.length > 0 ? (
          budgetParts.map((part) => (
            <DetailField key={part.label} label={labelForBudgetKey(part.label)} value={formatCurrency(part.value)} />
          ))
        ) : (
          <div className="md:col-span-2">
            <p className="text-sm font-medium text-slate-800">Not set</p>
          </div>
        )}
      </DetailSection>

      <DetailSection title="Lead NGO & Offers">
        <DetailField
          label="Lead NGO"
          value={
            selectedLeadNgoName
              ? selectedLeadNgoName
              : selectedLeadNgoId > 0
                ? `NGO #${selectedLeadNgoId}`
                : 'Not selected'
          }
        />
        <DetailField
          label="Invited Offers"
          value={invitedOfferIds.length > 0 ? `${invitedOfferIds.length} invited` : 'None yet'}
        />
      </DetailSection>

      <section className="space-y-4">
        <h3 className="text-sm font-medium text-gray-500">Milestones</h3>
        {milestones.length > 0 ? (
          <div className="space-y-4">
            {milestones.map((milestone, index) => {
              const title = String(milestone.title || `Milestone ${index + 1}`)
              const description = String(milestone.description || '')
              const startDate = formatDisplayDate(String(milestone.start_date || milestone.startDate || ''))
              const endDate = formatDisplayDate(String(milestone.end_date || milestone.endDate || ''))
              const budgetTarget = Number(milestone.budget_allocated ?? milestone.budgetTarget ?? 0)
              const deliverables = Array.isArray(milestone.deliverables)
                ? milestone.deliverables.map(String).filter(Boolean)
                : milestone.deliverables
                  ? [String(milestone.deliverables)]
                  : []

              return (
                <div key={`${campaign.id || 'campaign'}-milestone-${index}`} className="rounded-lg border border-slate-200 p-4 space-y-3">
                  <div>
                    <p className="text-sm text-gray-500">Title</p>
                    <p className="text-sm font-medium text-slate-800">{title}</p>
                  </div>
                  {description ? (
                    <div>
                      <p className="text-sm text-gray-500">Description</p>
                      <p className="whitespace-pre-wrap break-words text-sm text-muted-foreground">{description}</p>
                    </div>
                  ) : null}
                  <div className="grid grid-cols-1 gap-x-12 gap-y-4 md:grid-cols-2">
                    <DetailField label="Start Date" value={startDate || 'Not set'} />
                    <DetailField label="End Date" value={endDate || 'Not set'} />
                    <DetailField label="Budget Target" value={budgetTarget > 0 ? formatCurrency(budgetTarget) : 'Not set'} />
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Deliverables</p>
                    {deliverables.length > 0 ? (
                      <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-slate-800">
                        {deliverables.map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mt-1 text-sm font-medium text-slate-800">Not set</p>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <p className="text-sm font-medium text-slate-800">Not set</p>
        )}
      </section>
    </div>
  )
}

function CSRCampaignDetailSkeleton() {
  return (
    <Card>
      <CardContent className="pt-6 space-y-4">
        <div className="grid w-full grid-cols-2 gap-2">
          <Skeleton className="h-10 rounded-md" />
          <Skeleton className="h-10 rounded-md" />
        </div>
        <div className="space-y-3">
          <Skeleton className="h-5 w-48 rounded-md" />
          <Skeleton className="h-4 w-full rounded-md" />
          <Skeleton className="h-4 w-11/12 rounded-md" />
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="rounded-md border border-slate-200 p-4 space-y-2">
                <Skeleton className="h-3 w-24 rounded-md" />
                <Skeleton className="h-5 w-4/5 rounded-md" />
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

export default function CSRCampaignDetailPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const campaignId = String(params?.id || "")
  const [campaign, setCampaign] = useState<Campaign | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [currentUserId, setCurrentUserId] = useState<number | null>(null)
  const [currentUserType, setCurrentUserType] = useState<string | null>(null)
  const { user } = useAuth()
  const canShowVolunteerAction = user?.user_type === 'ngo' || user?.user_type === 'individual'
  const allVerified = Boolean(user?.email_verified && user?.phone_verified && user?.verification_status === 'verified')
  const [accepting, setAccepting] = useState(false)
  const [applying, setApplying] = useState(false)

  const effectiveUserId = Number(user?.id || currentUserId || 0)

  const loadCampaign = async () => {
    setLoading(true)
    setError(null)
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null
      const response = await fetch('/api/campaigns', {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      })
      const payload = await response.json().catch(() => null)
      const rows: Campaign[] = Array.isArray(payload?.data) ? payload.data : []
      const match = rows.find((item) => String(item.id) === campaignId) || null
      setCampaign(match)
      if (!match) setError('Campaign not found')
    } catch {
      setError('Failed to load campaign details')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!campaignId) return
    void loadCampaign()
  }, [campaignId, effectiveUserId])

  useEffect(() => {
    let cancelled = false
    const loadMe = async () => {
      try {
        const res = await fetch('/api/auth/me')
        const payload = await res.json().catch(() => null)
        if (!cancelled && payload?.success && payload?.data) {
          setCurrentUserId(Number(payload.data.id || null))
          setCurrentUserType(String(payload.data.user_type || null))
        }
      } catch {
        // ignore
      }
    }
    void loadMe()
    return () => { cancelled = true }
  }, [])

  const appliedByCurrentUser = (() => {
    try {
      const impact = campaign?.impact_metrics || {}
      const apps = Array.isArray(impact.volunteer_applications) ? impact.volunteer_applications : []
      return effectiveUserId > 0
        ? apps.some((a: any) => Number(a?.user_id || 0) === effectiveUserId)
        : false
    } catch {
      return false
    }
  })()

  const volunteerLimit = Number(campaign?.impact_metrics?.volunteer_requirement ?? campaign?.impact_metrics?.volunteer_limit ?? 0) || 0
  const volunteerCount = sumVolunteerApplicationCount(
    Array.isArray(campaign?.impact_metrics?.volunteer_applications)
      ? campaign?.impact_metrics?.volunteer_applications
      : []
  )

  const volunteerState = getVolunteerButtonState({
    status: campaign?.status,
    startDate: campaign?.start_date,
    leadNgoAccepted: campaign?.impact_metrics?.lead_ngo_accepted,
    volunteerCount,
    volunteerLimit,
    userType: currentUserType ?? user?.user_type,
    allVerified,
    applied: appliedByCurrentUser,
    applying,
    isVolunteerRegistrationPastDeadline,
    isCampaignStarted,
  })

  const handleVolunteerClick = async () => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null
    if (!token) {
      alert('Please sign in to volunteer')
      return
    }
    if (applying) return
    try {
      setApplying(true)
      const res = await fetch(`/api/campaigns/${campaignId}/volunteer`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      })
      const payload = await res.json().catch(() => null)
      if (!res.ok || !payload?.success) {
        alert(payload?.error || 'Failed to volunteer')
      } else {
        await loadCampaign()
        alert('Applied to volunteer')
      }
    } catch (e) {
      console.error(e)
      alert('Failed to volunteer')
    } finally {
      setApplying(false)
    }
  }

  const selectedLeadNgoId = campaign?.impact_metrics?.selected_lead_ngo_id
  const ownerName = campaign?.company_id ? `Company #${campaign.company_id}` : 'Company not set'

  return (
    <div className="min-h-screen overflow-x-hidden bg-gradient-to-br from-blue-50 to-indigo-100">
      <Header />
      <div className="mx-auto max-w-7xl px-4 py-8">
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Button
            variant="ghost"
            onClick={() => router.back()}
            className="w-full justify-start px-0 text-blue-600 hover:text-blue-800 hover:bg-transparent active:bg-transparent focus-visible:bg-transparent focus-visible:ring-0 sm:w-auto"
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
                onClick={handleVolunteerClick}
                disabled={!volunteerState.canApply}
                className="w-full sm:w-auto"
              >
                {volunteerState.label}
              </Button>
            )
          ) : null}
        </div>

        {loading ? (
          <CSRCampaignDetailSkeleton />
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

                      {currentUserId && Number(selectedLeadNgoId) === Number(currentUserId) && campaign.status !== 'active' ? (
                        <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-4">
                          <p className="text-sm text-muted-foreground mb-3">
                            You have been invited as the lead NGO for this campaign.
                          </p>
                          <Button
                            onClick={async () => {
                              if (!campaignId) return
                              try {
                                setAccepting(true)
                                const res = await fetch('/api/campaigns/accept-lead', {
                                  method: 'POST',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ campaign_id: campaignId })
                                })
                                const payload = await res.json().catch(() => null)
                                if (!res.ok || !payload?.success) {
                                  alert(payload?.error || 'Failed to accept lead role')
                                } else {
                                  setCampaign(payload.data)
                                  alert('Accepted lead role. Volunteer gap calculated and campaign activated.')
                                }
                              } catch {
                                alert('Failed to accept lead role')
                              } finally {
                                setAccepting(false)
                              }
                            }}
                            disabled={accepting}
                          >
                            {accepting ? 'Accepting…' : 'Accept Lead Role'}
                          </Button>
                        </div>
                      ) : null}
                    </TabsContent>

                    <TabsContent value="owner" className="mt-4 space-y-4">
                      <DetailSection title="Company Owner">
                        <DetailField label="Owner Name" value={ownerName} />
                        <DetailField label="Owner Type" value="Company" />
                        <DetailField label="Company ID" value={campaign.company_id || 'Not set'} />
                        <DetailField label="Campaign Status" value={campaign.status || 'draft'} />
                        <DetailField
                          label="Campaign Timeline"
                          value={`${formatDisplayDate(campaign.start_date) || 'Not set'} to ${formatDisplayDate(campaign.end_date) || 'Not set'}`}
                        />
                      </DetailSection>
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
