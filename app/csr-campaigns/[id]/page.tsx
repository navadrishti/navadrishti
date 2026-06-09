"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { Header } from "@/components/header"
import { useAuth } from '@/lib/auth-context'
import { Button } from "@/components/ui/button"
// Badge removed: tags removed from CSR detail page
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ArrowLeft, Building2, Calendar, MapPin, Users } from "lucide-react"

function CSRCampaignDetailSkeleton() {
  return (
    <div className="space-y-6">
      <Card className="overflow-hidden border-slate-200 bg-white shadow-sm">
        <CardHeader className="border-b border-slate-100 bg-gradient-to-r from-white to-slate-50/80">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Skeleton className="h-5 w-20 rounded-full" />
                <Skeleton className="h-5 w-28 rounded-full" />
              </div>
              <Skeleton className="h-8 w-80 max-w-full" />
              <Skeleton className="h-4 w-[30rem] max-w-full" />
              <Skeleton className="h-4 w-[24rem] max-w-full" />
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-right shadow-sm">
              <Skeleton className="h-3 w-14 ml-auto" />
              <Skeleton className="mt-2 h-7 w-24 ml-auto" />
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-5">
          <div className="grid gap-3 md:grid-cols-3">
            <Skeleton className="h-20 rounded-2xl" />
            <Skeleton className="h-20 rounded-2xl" />
            <Skeleton className="h-20 rounded-2xl" />
          </div>
        </CardContent>
      </Card>

      <Skeleton className="h-10 w-full rounded-md" />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="border-slate-200 bg-white shadow-sm">
          <CardHeader>
            <Skeleton className="h-6 w-48" />
          </CardHeader>
          <CardContent className="space-y-3">
            <Skeleton className="h-12 rounded-xl" />
            <Skeleton className="h-12 rounded-xl" />
            <Skeleton className="h-12 rounded-xl" />
            <Skeleton className="h-12 rounded-xl" />
          </CardContent>
        </Card>
        <Card className="border-slate-200 bg-white shadow-sm">
          <CardHeader>
            <Skeleton className="h-6 w-40" />
          </CardHeader>
          <CardContent className="space-y-3">
            <Skeleton className="h-12 rounded-xl" />
            <Skeleton className="h-12 rounded-xl" />
            <Skeleton className="h-12 rounded-xl" />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

interface Campaign {
  id: string
  title: string | null
  description: string | null
  cause: string
  region: string
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

export default function CSRCampaignDetailPage() {
  const params = useParams<{ id: string }>()
  const campaignId = String(params?.id || "")
  const [campaign, setCampaign] = useState<Campaign | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [currentUserId, setCurrentUserId] = useState<number | null>(null)
  const [currentUserType, setCurrentUserType] = useState<string | null>(null)
  const { user } = useAuth()
  const isCompany = user?.user_type === 'company'
  const allVerified = Boolean(user?.email_verified && user?.phone_verified && user?.verification_status === 'verified')
  const [accepting, setAccepting] = useState(false)
  const [applying, setApplying] = useState(false)
  const [activeTab, setActiveTab] = useState<'overview' | 'owner' | 'milestones'>('overview')

  useEffect(() => {
    if (!campaignId) return

    let cancelled = false
    const loadCampaign = async () => {
      setLoading(true)
      setError(null)
      try {
        const response = await fetch('/api/campaigns')
        const payload = await response.json().catch(() => null)
        const rows: Campaign[] = Array.isArray(payload?.data) ? payload.data : []
        const match = rows.find((item) => String(item.id) === campaignId) || null
        if (!cancelled) {
          setCampaign(match)
          if (!match) setError('Campaign not found')
        }
      } catch {
        if (!cancelled) setError('Failed to load campaign details')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void loadCampaign()
    return () => {
      cancelled = true
    }
  }, [campaignId])

  const appliedByCurrentUser = (() => {
    try {
      const impact = (campaign as any)?.impact_metrics || {}
      const apps = Array.isArray(impact.volunteer_applications) ? impact.volunteer_applications : []
      return apps.some((a: any) => Number(a?.user_id || 0) === Number(currentUserId))
    } catch (e) { return false }
  })()

  const volunteerLimit = (() => {
    try {
      const impact = (campaign as any)?.impact_metrics || {}
      return Number(impact.volunteer_requirement ?? impact.volunteer_limit ?? 0) || 0
    } catch (e) { return 0 }
  })()

  const volunteerCount = (() => {
    try {
      const impact = (campaign as any)?.impact_metrics || {}
      const apps = Array.isArray(impact.volunteer_applications) ? impact.volunteer_applications : []
      return apps.reduce((sum: number, item: any) => sum + Number(item?.capacity || 1), 0)
    } catch (e) { return 0 }
  })()

  const isVolunteerClosed = (() => {
    try {
      if (!campaign?.start_date) return false
      const start = new Date(String(campaign.start_date))
      const allowedUntil = new Date(start)
      allowedUntil.setDate(start.getDate() - 1)
      allowedUntil.setHours(23, 59, 59, 999)
      return new Date() > allowedUntil
    } catch (e) { return false }
  })()

  const handleVolunteerClick = async () => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null
    if (!token) { alert('Please sign in to volunteer'); return }
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
        // reload campaign
        const response = await fetch('/api/campaigns')
        const payload2 = await response.json().catch(() => null)
        const rows = Array.isArray(payload2?.data) ? payload2.data : []
        const match = rows.find((item: any) => String(item.id) === campaignId) || null
        setCampaign(match)
        alert('Registered to volunteer')
      }
    } catch (e) {
      console.error(e)
      alert('Failed to volunteer')
    } finally {
      setApplying(false)
    }
  }

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
      } catch (e) {
        // ignore
      }
    }
    void loadMe()
    return () => { cancelled = true }
  }, [])

  const budgetParts = useMemo(() => {
    const breakdown = campaign?.budget_breakdown || {}
    return Object.entries(breakdown)
      .map(([label, value]) => ({ label, value: Number(value) || 0 }))
      .filter((entry) => entry.value > 0)
  }, [campaign?.budget_breakdown])

  const formatCurrency = (amount: number | null | undefined) => {
    const value = Number(amount || 0)
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(value)
  }

  const volunteerRequirement = String(campaign?.impact_metrics?.volunteer_requirement || '')
  const invitedOfferIds = Array.isArray(campaign?.impact_metrics?.invited_offer_ids) ? campaign?.impact_metrics?.invited_offer_ids : []
  const selectedLeadNgoId = campaign?.impact_metrics?.selected_lead_ngo_id
  const impactReach = campaign?.impact_metrics?.beneficiaries
  const selectedLeadNgoName = campaign?.impact_metrics?.selected_lead_ngo_name
  const ownerName = campaign?.company_id ? `Company #${campaign.company_id}` : 'Company not set'

  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <Header />
      <main className="flex-1 px-6 py-8 md:px-10">
        <div className="mb-6 flex items-center justify-between gap-4">
          <Button asChild variant="ghost" className="gap-2 text-slate-700 hover:text-slate-950">
            <Link href="/csr-campaigns">
              <ArrowLeft className="h-4 w-4" />
              Back to campaigns
            </Link>
          </Button>
        </div>

        {loading ? (
          <CSRCampaignDetailSkeleton />
        ) : error || !campaign ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-8 text-sm text-slate-600">{error || 'Campaign not found.'}</div>
        ) : (
          <div className="space-y-6">
            <Card className="overflow-hidden border-slate-200 bg-white shadow-sm">
              <CardHeader className="border-b border-slate-100 bg-gradient-to-r from-white to-slate-50/80">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="space-y-2">
                    {/* tags removed per request */}
                    <CardTitle className="text-2xl text-slate-950">{campaign.title || campaign.cause}</CardTitle>
                    <p className="max-w-3xl text-sm leading-6 text-slate-600">{campaign.description || 'No campaign description provided.'}</p>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-right shadow-sm">
                    <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Budget</p>
                    <p className="text-xl font-semibold text-slate-950">{formatCurrency(campaign.budget_inr)}</p>
                  </div>
                  {!isCompany && user && (
                    <div className="mt-2 text-right">
                      {appliedByCurrentUser ? (
                        <Button disabled variant="ghost" className="h-9 px-3 text-sm font-medium text-emerald-600">Registered</Button>
                      ) : (
                        <Button onClick={handleVolunteerClick} disabled={applying || !allVerified || isVolunteerClosed || (volunteerLimit > 0 && volunteerCount >= volunteerLimit)} className="h-9 px-3 text-sm font-medium">
                          {applying ? 'Registering…' : (!allVerified ? 'Verify to apply' : isVolunteerClosed ? 'Registration closed' : (volunteerLimit > 0 && volunteerCount >= volunteerLimit) ? 'Full' : 'Register to Volunteer')}
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              </CardHeader>
              <CardContent className="p-5">
                <div className="grid gap-3 md:grid-cols-3">
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500"><MapPin className="h-3.5 w-3.5" />Region</div>
                    <p className="mt-2 text-sm font-semibold text-slate-950">{campaign.region}</p>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500"><Calendar className="h-3.5 w-3.5" />Timeline</div>
                    <p className="mt-2 text-sm font-semibold text-slate-950">{campaign.start_date || 'Start TBD'} → {campaign.end_date || 'End TBD'}</p>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500"><Building2 className="h-3.5 w-3.5" />Company</div>
                    <p className="mt-2 text-sm font-semibold text-slate-950">Company #{campaign.company_id || 'TBD'}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as 'overview' | 'owner' | 'milestones')} className="space-y-4">
              <TabsList className="grid w-full grid-cols-3 bg-slate-100">
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="owner">Owner Details</TabsTrigger>
                <TabsTrigger value="milestones">Milestones</TabsTrigger>
              </TabsList>

              <TabsContent value="overview" className="space-y-6">
                <div className="grid gap-6 lg:grid-cols-2">
                  <Card className="border-slate-200 bg-white shadow-sm">
                    <CardHeader>
                      <CardTitle className="text-slate-950">Campaign details</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3 text-sm text-slate-700">
                      <div className="flex items-start justify-between gap-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                        <span className="text-slate-500">Schedule VII</span>
                        <span className="font-semibold text-slate-950">{campaign.schedule_vii || campaign.cause}</span>
                      </div>
                      <div className="flex items-start justify-between gap-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                        <span className="text-slate-500">Volunteer requirement</span>
                        <span className="max-w-[60%] text-right font-semibold text-slate-950">{volunteerRequirement || 'Not specified'}</span>
                      </div>
                      <div className="flex items-start justify-between gap-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                        <span className="text-slate-500">Lead NGO</span>
                        <span className="font-semibold text-slate-950">{selectedLeadNgoName || (selectedLeadNgoId ? `NGO #${selectedLeadNgoId}` : 'Not selected')}</span>
                      </div>
                      <div className="flex items-start justify-between gap-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                        <span className="text-slate-500">Impact reach</span>
                        <span className="font-semibold text-slate-950">{Number(impactReach || 0).toLocaleString('en-IN')}</span>
                      </div>
                      {currentUserId && Number(selectedLeadNgoId) === Number(currentUserId) && campaign?.status !== 'active' && (
                        <div className="mt-3">
                          <Button onClick={async () => {
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
                            } catch (e) {
                              alert('Failed to accept lead role')
                            } finally {
                              setAccepting(false)
                            }
                          }} disabled={accepting}>{accepting ? 'Accepting…' : 'Accept Lead Role'}</Button>
                        </div>
                      )}
                      <div className="flex items-start justify-between gap-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                        <span className="text-slate-500">Invited offers</span>
                        <span className="font-semibold text-slate-950">{invitedOfferIds.length > 0 ? `${invitedOfferIds.length} invited` : 'None yet'}</span>
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="border-slate-200 bg-white shadow-sm">
                    <CardHeader>
                      <CardTitle className="text-slate-950">Attached offers</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {budgetParts.length > 0 ? budgetParts.map((part) => (
                        <div key={part.label} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                          <div className="flex items-center justify-between gap-4">
                            <p className="text-sm font-semibold text-slate-950">{part.label}</p>
                            <p className="text-sm font-semibold text-slate-950">{formatCurrency(part.value)}</p>
                          </div>
                        </div>
                      )) : (
                        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">No budget breakdown attached yet.</div>
                      )}
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>

              <TabsContent value="owner" className="space-y-6">
                <Card className="border-slate-200 bg-white shadow-sm">
                  <CardHeader>
                    <CardTitle className="text-slate-950">CSR Owner Details</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm text-slate-700">
                    <div className="flex items-center justify-between gap-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                      <span className="text-slate-500">Owner name</span>
                      <span className="font-semibold text-slate-950">{ownerName}</span>
                    </div>
                    <div className="flex items-center justify-between gap-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                      <span className="text-slate-500">Owner type</span>
                      <span className="font-semibold text-slate-950">Company</span>
                    </div>
                    <div className="flex items-center justify-between gap-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                      <span className="text-slate-500">Company ID</span>
                      <span className="font-semibold text-slate-950">{campaign.company_id || 'Not set'}</span>
                    </div>
                    <div className="flex items-center justify-between gap-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                      <span className="text-slate-500">Campaign status</span>
                      <span className="font-semibold text-slate-950">{campaign.status || 'draft'}</span>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="milestones" className="space-y-6">
                <Card className="border-slate-200 bg-white shadow-sm">
                  <CardHeader>
                    <CardTitle className="text-slate-950">Milestones</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {(campaign.milestones || []).length > 0 ? campaign.milestones!.map((milestone, index) => (
                      <div key={`${campaign.id}-milestone-${index}`} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <p className="text-sm font-semibold text-slate-950">{index + 1}. {String(milestone.title || `Milestone ${index + 1}`)}</p>
                          <p className="text-xs text-slate-500">{String(milestone.start_date || milestone.startDate || '')}{(milestone.start_date || milestone.startDate) && (milestone.end_date || milestone.endDate) ? ` — ${String(milestone.end_date || milestone.endDate)}` : ''}</p>
                        </div>
                        <p className="mt-2 text-sm text-slate-700">{String(milestone.description || '')}</p>
                        <p className="mt-2 text-xs font-medium text-slate-500">Budget: {formatCurrency(Number(milestone.budget_allocated || 0))}</p>
                      </div>
                    )) : (
                      <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">No milestones attached yet.</div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>
        )}
      </main>
    </div>
  )
}
