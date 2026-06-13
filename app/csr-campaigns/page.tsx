"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { Header } from "@/components/header"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { StyledSelect } from "@/components/ui/styled-select"
import { Skeleton } from "@/components/ui/skeleton"
import { Search, Filter, Sparkles, ArrowRight, CheckCircle2, Pencil, Trash2 } from "lucide-react"
import { useAuth } from "@/lib/auth-context"
import { CSR_SCHEDULE_VII_CATEGORIES } from "@/lib/categories"
import { formatDisplayDate, isCampaignStarted, isVolunteerRegistrationPastDeadline } from "@/lib/format-date"
import { getVolunteerButtonState, sumVolunteerApplicationCount } from "@/lib/campaign-volunteer-utils"

const getInitials = (name: string) => {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return 'CO'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0][0] || ''}${parts[parts.length - 1][0] || ''}`.toUpperCase()
}

const formatCampaignDuration = (item: CampaignApiItem) => {
  const start = formatDisplayDate(item.start_date)
  const end = formatDisplayDate(item.end_date)
  if (start && end) {
    return `${start} → ${end}`
  }
  if (start) return `From ${start}`
  if (end) return `Until ${end}`

  const duration = item.impact_metrics?.duration
  if (typeof duration === 'string' && duration.trim()) {
    return duration.trim()
  }

  return 'Not set'
}

interface Campaign {
  id: string
  title: string
  company: string
  category: string
  location: string
  duration: string
  volunteers: string
  status: string
  description: string
  leadNgo?: string
  volunteerRequirement?: string
  invitedOffers?: number
  volunteerCount?: number
  volunteerLimit?: number
  appliedByCurrentUser?: boolean
  companyId?: number | null
  companyInitials?: string
  selectedLeadNgoId?: number | null
  leadNgoAccepted?: boolean
  start_date?: string | null
}

interface CampaignApiItem {
  id: string
  title: string | null
  description: string | null
  category: string | null
  location: string | null
  schedule_vii: string | null
  status: string | null
  company_id: number | null
  company_name?: string | null
  created_at: string
  start_date?: string | null
  end_date?: string | null
  impact_metrics?: Record<string, any> | null
}

function CSRCampaignCtaSkeleton() {
  return (
    <div className="mb-8 relative overflow-hidden rounded-md border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-col md:flex-row items-center justify-between gap-6">
        <div className="text-center md:text-left">
          <Skeleton className="h-7 w-56 mb-2" />
          <Skeleton className="h-4 w-full max-w-sm" />
        </div>
        <Skeleton className="h-10 w-40 rounded-md" />
      </div>
    </div>
  )
}

function CSRCampaignCardSkeleton() {
  return (
    <Card className="h-full w-full max-w-[360px] overflow-hidden rounded-md border-2 border-slate-200 bg-white shadow-none">
      <CardContent className="flex h-full flex-col p-2">
        <div className="flex min-w-0 items-center justify-between gap-2">
          <Skeleton className="h-5 w-20 rounded-full" />
          <Skeleton className="h-5 w-28 rounded-full" />
        </div>

        <div className="mt-3 min-w-0 space-y-1 border-t border-slate-200 pt-3">
          <Skeleton className="h-5 w-3/4 rounded" />
          <Skeleton className="h-3 w-full rounded" />
        </div>

        <div className="mt-3 grid grid-cols-3 gap-2 border-t border-slate-200 pt-3">
          <div className="min-w-0 space-y-1">
            <Skeleton className="h-3 w-10 rounded" />
            <Skeleton className="h-4 w-full rounded" />
          </div>
          <div className="min-w-0 space-y-1">
            <Skeleton className="h-3 w-12 rounded" />
            <Skeleton className="h-4 w-full rounded" />
          </div>
          <div className="min-w-0 space-y-1">
            <Skeleton className="h-3 w-12 rounded" />
            <Skeleton className="h-4 w-full rounded" />
          </div>
        </div>

        <div className="mt-1 border-t border-slate-200 pt-1">
          <Skeleton className="h-3 w-40 rounded" />
        </div>

        <div className="mt-1 border-t border-slate-200 pt-1">
          <div className="flex min-w-0 items-center gap-2">
            <div className="flex min-w-0 flex-1 items-center gap-2 px-1 py-0.5">
              <Skeleton className="h-6 w-6 shrink-0 rounded-full" />
              <div className="min-w-0 flex-1 space-y-1">
                <Skeleton className="h-3.5 w-32 rounded" />
                <Skeleton className="h-3 w-20 rounded" />
              </div>
            </div>
            <Skeleton className="h-8 w-px shrink-0 rounded-none" />
            <Skeleton className="h-4 w-24 shrink-0 rounded" />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

export default function CSRCampaignsPage() {
  const { user } = useAuth()
  const allVerified = Boolean(user?.email_verified && user?.phone_verified && user?.verification_status === 'verified')
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedCategory, setSelectedCategory] = useState("all")
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [loading, setLoading] = useState(true)
  const [isHydrated, setIsHydrated] = useState(false)
  const [deletingCampaignId, setDeletingCampaignId] = useState<string | null>(null)
  const [applyingCampaignId, setApplyingCampaignId] = useState<string | null>(null)

  const effectiveUserType = isHydrated ? user?.user_type : undefined
  const isCompany = effectiveUserType === 'company'
  const canShowVolunteerAction = effectiveUserType === 'ngo' || effectiveUserType === 'individual'
  const currentUserId = Number(user?.id || 0)
  const isCompanyOwner = (campaignCompanyId?: number | null) => isCompany && Number(campaignCompanyId || 0) === currentUserId

  const hydrateCampaignStats = (item: CampaignApiItem) => {
    const metrics = item.impact_metrics && typeof item.impact_metrics === 'object' ? item.impact_metrics : {}
    const applications = Array.isArray(metrics.volunteer_applications) ? metrics.volunteer_applications : []
    const volunteerCount = sumVolunteerApplicationCount(applications)
    const volunteerLimit = Number(metrics.volunteer_requirement || metrics.volunteer_limit || 0) || undefined
    const appliedByCurrentUser = currentUserId > 0
      ? applications.some((application: any) => Number(application?.user_id || 0) === currentUserId)
      : false

    const companyName = String(item.company_name || '').trim()

    return {
      id: item.id,
      title: item.title || item.category || 'Untitled campaign',
      company: companyName || 'Company',
      category: item.schedule_vii || item.category || 'Uncategorized',
      location: item.location || '',
      duration: formatCampaignDuration(item),
      volunteers: volunteerLimit ? `${volunteerLimit} needed` : 'Not set',
      status: item.status || 'draft',
      description: item.description || 'No campaign description provided yet.',
      leadNgo: metrics.selected_lead_ngo_name || (metrics.selected_lead_ngo_id ? `NGO #${metrics.selected_lead_ngo_id}` : undefined),
      volunteerRequirement: metrics.volunteer_requirement,
      invitedOffers: Array.isArray(metrics.invited_offer_ids) ? metrics.invited_offer_ids.length : 0,
      volunteerCount,
      volunteerLimit,
      appliedByCurrentUser,
      companyId: item.company_id,
      companyInitials: getInitials(companyName || 'Company'),
      start_date: item.start_date || null,
      end_date: item.end_date || null,
      selectedLeadNgoId: Number(metrics.selected_lead_ngo_id || 0) || null,
      leadNgoAccepted: Boolean(metrics.lead_ngo_accepted),
    }
  }

  const loadCampaigns = async () => {
    setLoading(true)

    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null
      const response = await fetch('/api/campaigns', {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined
      })
      const payload = await response.json()

      if (!response.ok || !payload?.success) {
        setCampaigns([])
        return
      }

      const rows = Array.isArray(payload.data) ? (payload.data as CampaignApiItem[]) : []
      setCampaigns(rows.map(hydrateCampaignStats))
    } catch (error) {
      console.error('Failed to load campaigns:', error)
      setCampaigns([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    setIsHydrated(true)
  }, [])

  useEffect(() => {
    void loadCampaigns()
  }, [user?.id, user?.user_type])

  const handleVolunteer = async (campaignId: string) => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null
    if (!token) return

    try {
      setApplyingCampaignId(campaignId)
      const response = await fetch(`/api/campaigns/${campaignId}/volunteer`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok || !payload?.success) {
        throw new Error(payload?.error || 'Failed to volunteer')
      }
      await loadCampaigns()
    } catch (error) {
      console.error('Failed to volunteer for campaign:', error)
    } finally {
      setApplyingCampaignId(null)
    }
  }

  const handleDeleteCampaign = async (campaignId: string) => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null
    if (!token) return
    if (!confirm('Delete this CSR campaign?')) return

    try {
      setDeletingCampaignId(campaignId)
      const response = await fetch(`/api/campaigns/${campaignId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok || !payload?.success) {
        throw new Error(payload?.error || 'Failed to delete campaign')
      }
      await loadCampaigns()
    } catch (error) {
      console.error('Failed to delete campaign:', error)
    } finally {
      setDeletingCampaignId(null)
    }
  }

  const categories = useMemo(() => ['all', ...CSR_SCHEDULE_VII_CATEGORIES], [])

  const filteredCampaigns = campaigns.filter(campaign => {
    const matchesSearch = campaign.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         campaign.company.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesCategory = selectedCategory === 'all' || campaign.category === selectedCategory
    const isUpcoming = !isCampaignStarted(campaign.start_date)
    const isDraftHiddenFromPublic = String(campaign.status || '').toLowerCase() === 'draft' && !isCompanyOwner(campaign.companyId)
    return matchesSearch && matchesCategory && isUpcoming && !isDraftHiddenFromPublic
  })

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'published':
      case 'active':
      case 'open':
        return 'border-slate-200 bg-slate-50 text-emerald-700 shadow-none'
      case 'ongoing':
        return 'border-slate-200 bg-slate-50 text-blue-700 shadow-none'
      case 'completed':
        return 'border-slate-200 bg-slate-50 text-gray-700 shadow-none'
      case 'draft':
        return 'border-slate-200 bg-slate-50 text-amber-700 shadow-none'
      default:
        return 'border-slate-200 bg-slate-50 text-slate-900 shadow-none'
    }
  }

  const categoryOptions = useMemo(
    () => categories.map((category) => ({
      value: category,
      label: category === 'all' ? 'All Categories' : category
    })),
    [categories]
  )

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

        {loading ? (
          isCompany && <CSRCampaignCtaSkeleton />
        ) : isCompany && (
          <div className="mb-8 relative overflow-hidden rounded-md border-2 border-black bg-white p-8 shadow-sm">
            <div className="flex flex-col md:flex-row items-center justify-between gap-6 relative z-10">
              <div className="text-center md:text-left">
                  <h2 className="text-2xl font-bold text-black mb-3">
                  Launch New CSR Campaign?
                </h2>
                <p className="text-gray-700 text-base max-w-md font-medium">
                  Create structured campaign plans through the CSR AI Agent. Manual campaign creation is disabled.
                </p>
              </div>
              <Link href="/companies/csr-agent">
                  <button className="flex h-auto items-center rounded-md border-2 border-black bg-white px-8 py-4 text-base font-medium text-black shadow-sm transition-all duration-300 hover:bg-gray-50">
                  <Sparkles size={20} className="mr-3" />
                  Use CSR AI Agent
                  <ArrowRight size={16} className="ml-3" />
                </button>
              </Link>
            </div>
          </div>
        )}

        <div className="mb-6 grid gap-6 md:grid-cols-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search campaigns by name or company..."
              className="pl-8"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <div className="flex gap-4">
            <div className="relative flex-1">
              <StyledSelect
                value={selectedCategory}
                options={categoryOptions}
                placeholder="All Categories"
                onValueChange={setSelectedCategory}
              />
            </div>
          </div>
        </div>

        <div className="min-h-[400px]">
          {loading ? (
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <CSRCampaignCardSkeleton key={i} />
              ))}
            </div>
          ) : filteredCampaigns.length > 0 ? (
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {filteredCampaigns.map(campaign => (
                <Card key={campaign.id} className="h-full w-full max-w-[360px] overflow-hidden rounded-md border-2 border-slate-200 bg-white shadow-none">
                  <CardContent className="flex h-full flex-col p-2">
                    <div className="flex min-w-0 items-center justify-between gap-2">
                      <span className={`inline-flex min-w-0 max-w-[48%] overflow-hidden rounded-full border px-2.5 py-0.5 text-xs font-semibold capitalize ${getStatusColor(campaign.status)} border-slate-200`} title={campaign.status}>
                        <span className="block truncate">{campaign.status}</span>
                      </span>
                      <span className="inline-flex min-w-0 max-w-[52%] overflow-hidden rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-xs font-semibold text-slate-700 shadow-none" title={campaign.category}>
                        <span className="block truncate">{campaign.category}</span>
                      </span>
                    </div>

                    <div className="mt-3 min-w-0 space-y-1 border-t border-slate-200 pt-3">
                      <Link href={`/csr-campaigns/${campaign.id}`} className="block min-w-0">
                        <CardTitle className="cursor-pointer truncate text-[17px] font-semibold leading-snug text-slate-900" title={campaign.title}>
                          {campaign.title}
                        </CardTitle>
                      </Link>
                      <p className="min-w-0 truncate text-[13px] leading-5 text-slate-700" title={campaign.description}>
                        {campaign.description}
                      </p>
                    </div>

                    <div className="mt-3 space-y-2 border-t border-slate-200 pt-3 text-xs text-muted-foreground">
                      <div className="space-y-0.5">
                        <p className="font-medium text-slate-500">Location</p>
                        <p className="break-words text-[13px] font-semibold text-slate-900">{campaign.location || 'TBD'}</p>
                      </div>
                      <div className="space-y-0.5">
                        <p className="font-medium text-slate-500">Duration</p>
                        <p className="break-words text-[13px] font-semibold text-slate-900">{campaign.duration}</p>
                      </div>
                      <div className="space-y-0.5">
                        <p className="font-medium text-slate-500">Volunteers</p>
                        <p className="break-words text-[13px] font-semibold text-slate-900">
                          {campaign.volunteerCount ?? 0} applied
                          {campaign.volunteerLimit ? ` · ${campaign.volunteerLimit} needed` : ''}
                        </p>
                      </div>
                    </div>

                    <div className="mt-1 min-w-0 border-t border-slate-200 pt-1 text-xs text-slate-900">
                      <p className="min-w-0 truncate" title={campaign.leadNgo || 'Not selected yet'}>
                        <span className="font-semibold">Lead NGO:</span>{' '}
                        <span className="font-normal">{campaign.leadNgo || 'Not selected yet'}</span>
                      </p>
                    </div>

                    <div className="mt-1 border-t border-slate-200 pt-1">
                      <div className="flex min-w-0 items-center gap-2">
                        <Link href={campaign.companyId ? `/profile/${campaign.companyId}` : '#'} className="flex min-w-0 flex-1 items-center gap-2 px-1 py-0.5">
                          <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-udaan-orange text-[10px] font-medium text-white">
                            {campaign.companyInitials || 'CO'}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-slate-900" title={campaign.company}>{campaign.company}</p>
                            <p className="truncate text-xs text-slate-700">
                              Company
                            </p>
                          </div>
                        </Link>

                        <span className="h-8 w-px shrink-0 bg-slate-300" aria-hidden="true" />

                        <div className="ml-auto flex shrink-0 items-center">
                          <Link href={`/csr-campaigns/${campaign.id}`} className="inline-flex items-center gap-1 px-1 py-0.5 text-sm font-medium text-slate-900">
                            <span>Explore More</span>
                            <ArrowRight size={14} />
                          </Link>
                        </div>
                      </div>

                      {canShowVolunteerAction && user ? (
                        <div className="mt-1 border-t border-slate-200 pt-1">
                          <div className="flex justify-end">
                            {(() => {
                              const volunteerState = getVolunteerButtonState({
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

                              return volunteerState.label === 'Applied' ? (
                                <Button disabled variant="ghost" className="h-6 p-0 text-sm font-medium text-emerald-600 shadow-none hover:bg-transparent hover:text-emerald-600">
                                  <CheckCircle2 size={14} className="mr-1" />
                                  Applied
                                </Button>
                              ) : (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  onClick={() => handleVolunteer(campaign.id)}
                                  disabled={!volunteerState.canApply}
                                  className="h-6 p-0 text-sm font-medium text-black shadow-none hover:bg-transparent hover:text-blue-600"
                                >
                                  <ArrowRight size={14} className="mr-1" />
                                  {volunteerState.label}
                                </Button>
                              )
                            })()}
                          </div>
                        </div>
                      ) : null}

                      {isCompanyOwner(campaign.companyId) && (
                        <div className="pt-1">
                          <div className="flex items-center gap-2">
                            <Button asChild variant="ghost" className="h-6 p-0 text-sm font-medium text-black shadow-none hover:bg-transparent hover:text-blue-600">
                              <Link href={`/companies/csr-agent?campaign_id=${campaign.id}`}>
                                <Pencil size={14} className="mr-1" />
                                Edit
                              </Link>
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              className="h-6 p-0 text-sm font-medium text-black shadow-none hover:bg-transparent hover:text-red-600"
                              onClick={() => handleDeleteCampaign(campaign.id)}
                              disabled={deletingCampaignId === campaign.id}
                            >
                              <Trash2 size={14} className="mr-1" />
                              {deletingCampaignId === campaign.id ? 'Deleting...' : 'Delete'}
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center p-8 text-center">
              <div className="mb-4 rounded-full bg-muted p-3">
                <Filter className="h-6 w-6 text-muted-foreground" />
              </div>
              <h3 className="mb-1 text-lg font-semibold">No campaigns found</h3>
              <p className="mb-4 text-muted-foreground">No campaigns match your current search or filters.</p>
              <Button
                variant="outline"
                onClick={() => {
                  setSearchQuery("")
                  setSelectedCategory("all")
                }}
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
