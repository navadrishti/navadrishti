'use client'

import { useState, useEffect, Suspense, useMemo } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Header } from '@/components/header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { StyledSelect } from '@/components/ui/styled-select'
import { ServiceCard } from '@/components/service-card'
import { Skeleton, SkeletonCTA, SkeletonServiceCard, SkeletonServiceProject, PlatformContentSkeleton, PlatformPageSkeleton } from '@/components/ui/skeleton'
import { Card, CardContent, CardTitle } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Search, ArrowRight, Plus, MapPin, Sparkles, MoreVertical, Pencil, Trash2 } from 'lucide-react'
import { useAuth } from '@/lib/auth-context'
import { useToast } from '@/hooks/use-toast'
import { CSR_SCHEDULE_VII_CATEGORIES, SERVICE_REQUEST_TYPES } from '@/lib/categories'
import { getGramAvatarFallbackStyle } from '@/lib/gram-avatar'
import { formatDisplayDate } from '@/lib/format-date'
import { formatProjectExactAddress } from '@/lib/service-request-allocation'
import { VerifiedAccountName } from '@/components/verification-badge'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'

const compactControlClass = 'h-9 text-sm'

type ListingKind = 'needs' | 'projects'

const CATEGORY_OPTIONS = [
  { value: 'all', label: 'All categories' },
  ...CSR_SCHEDULE_VII_CATEGORIES.map((category) => ({ value: category, label: category })),
]

const NEED_TYPE_OPTIONS = [
  { value: 'all', label: 'All need types' },
  ...SERVICE_REQUEST_TYPES.map((type) => ({ value: type, label: type })),
]

const URGENCY_OPTIONS = [
  { value: 'all', label: 'Any urgency' },
  { value: 'low', label: 'Low', bulletClassName: 'bg-[#4F6B5C]' },
  { value: 'medium', label: 'Medium', bulletClassName: 'bg-udaan-blue' },
  { value: 'high', label: 'High', bulletClassName: 'bg-[#8A6F45]' },
  { value: 'critical', label: 'Critical', bulletClassName: 'bg-[#8C5555]' },
]

function getInitials(name?: string) {
  const parts = String(name || 'NGO').trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return 'NG'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0][0] || ''}${parts[1][0] || ''}`.toUpperCase()
}

function getProjectStatusClass(status?: string) {
  switch (String(status || '').toLowerCase()) {
    case 'active':
    case 'open':
    case 'published':
      return 'text-[#4F6B5C]'
    case 'draft':
    case 'pending':
      return 'text-[#8A6F45]'
    case 'completed':
    case 'closed':
    case 'expired':
      return 'text-gram-muted'
    case 'cancelled':
      return 'text-[#8C5555]'
    default:
      return 'text-udaan-blue'
  }
}

function ServiceRequestCardSkeleton({ kind = 'needs' }: { kind?: ListingKind }) {
  if (kind === 'projects') return <SkeletonServiceProject />
  return <SkeletonServiceCard />
}

function ProjectListingCard({
  project,
  isOwner,
  isDeleting,
  onDelete,
}: {
  project: any
  isOwner: boolean
  isDeleting?: boolean
  onDelete?: () => void
}) {
  const addressLabel =
    project.location_summary ||
    formatProjectExactAddress(project.exact_address || project.location) ||
    project.location ||
    'Not set'
  const categoryLabel = String(project.category || '').trim() || 'CSR Project'
  const validUntil = formatDisplayDate(project.valid_until) || 'Not set'
  const timeline = String(project.timeline || '').trim() || 'Not set'
  const budgetLabel =
    project.budget_inr != null && Number.isFinite(Number(project.budget_inr))
      ? `₹${Number(project.budget_inr).toLocaleString('en-IN')}`
      : 'Not set'
  const beneficiariesLabel =
    project.expected_beneficiaries != null && Number(project.expected_beneficiaries) > 0
      ? Number(project.expected_beneficiaries).toLocaleString('en-IN')
      : 'Not set'
  const volunteersLabel =
    project.volunteers_needed != null && Number(project.volunteers_needed) > 0
      ? String(Number(project.volunteers_needed))
      : 'Not set'

  const detailFields = [
    { label: 'Address', value: addressLabel },
    { label: 'Validity', value: validUntil },
    { label: 'Timeline', value: timeline },
    { label: 'Beneficiaries', value: beneficiariesLabel },
    { label: 'Budget', value: budgetLabel },
    { label: 'Volunteers', value: volunteersLabel },
  ]

  return (
    <Card className="h-full w-full max-w-[360px] overflow-hidden rounded-md border border-gram-border bg-white shadow-none">
      <CardContent className="flex h-full flex-col gap-2 px-3 pb-3 pt-2.5">
        <div className="flex min-w-0 items-baseline justify-between gap-2">
          <span
            className={`shrink-0 text-[10px] font-semibold uppercase tracking-[0.12em] ${getProjectStatusClass(project.status)}`}
            title={String(project.status || 'active')}
          >
            {String(project.status || 'active')}
          </span>
          <span className="min-w-0 truncate text-xs text-gram-muted" title={categoryLabel}>
            {categoryLabel}
          </span>
        </div>

        <div className="min-w-0 space-y-1">
          <Link href={`/service-requests/projects/${project.id}`} className="block min-w-0">
            <CardTitle
              className="cursor-pointer truncate text-[17px] font-semibold leading-snug text-gram-ink"
              title={project.title}
            >
              {project.title}
            </CardTitle>
          </Link>
          <p className="min-w-0 truncate text-[13px] leading-5 text-gram-muted" title={project.description}>
            {project.description}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-x-3 gap-y-2 border-t border-gram-border pt-2">
          {detailFields.map((field) => (
            <div
              key={field.label}
              className={`min-w-0 space-y-0.5 ${field.label === 'Address' ? 'col-span-2' : ''}`}
            >
              <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-gram-muted">
                {field.label}
              </p>
              <p className="truncate text-[13px] font-medium text-gram-ink" title={field.value}>
                {field.value}
              </p>
            </div>
          ))}
        </div>

        <div className="mt-auto flex min-w-0 items-center gap-2 border-t border-gram-border pt-2">
          <Link
            href={project.ngo_id ? `/profile/${project.ngo_id}` : '#'}
            className="flex min-w-0 flex-1 items-center gap-2"
          >
            <div
              className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-[10px] font-medium"
              style={getGramAvatarFallbackStyle(project.ngo_name || 'NGO')}
            >
              {getInitials(project.ngo_name)}
            </div>
            <div className="min-w-0 flex-1">
              <VerifiedAccountName
                name={project.ngo_name || 'NGO'}
                verified={Boolean(project.ngo_verified)}
                size="sm"
                nameClassName="text-sm font-medium text-gram-ink"
              />
              <p className="truncate text-xs text-gram-muted">NGO</p>
            </div>
          </Link>

          <Link
            href={`/service-requests/projects/${project.id}`}
            className="inline-flex shrink-0 items-center rounded-md border border-udaan-blue bg-udaan-blue px-2.5 py-1 text-sm font-medium text-white hover:bg-udaan-blue hover:text-white"
          >
            View project
          </Link>

          {isOwner ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0 text-gram-muted hover:bg-transparent hover:text-gram-muted active:bg-transparent focus-visible:bg-transparent focus-visible:ring-0"
                  aria-label="Project actions"
                >
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem asChild>
                  <Link href={`/service-requests/projects/${project.id}/edit`} className="cursor-pointer">
                    <Pencil className="mr-2 h-4 w-4" />
                    Edit
                  </Link>
                </DropdownMenuItem>
                {onDelete ? (
                  <DropdownMenuItem
                    disabled={isDeleting}
                    className="text-red-700 focus:text-red-700"
                    onSelect={(e) => {
                      e.preventDefault()
                      if (!isDeleting) onDelete()
                    }}
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    {isDeleting ? 'Deleting...' : 'Delete'}
                  </DropdownMenuItem>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </div>
      </CardContent>
    </Card>
  )
}

function ServiceRequestsContent() {
  const router = useRouter()
  const { user, loading: authLoading } = useAuth()
  const { toast } = useToast()
  const searchParams = useSearchParams()
  const [mounted, setMounted] = useState(false)
  const [listingKind, setListingKind] = useState<ListingKind>('needs')
  const [searchTerm, setSearchTerm] = useState('')
  const [locationFilter, setLocationFilter] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('all')
  const [selectedNeedType, setSelectedNeedType] = useState('all')
  const [selectedUrgency, setSelectedUrgency] = useState('all')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [debouncedLocation, setDebouncedLocation] = useState('')
  const [requests, setRequests] = useState<any[]>([])
  const [projects, setProjects] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [deleting, setDeleting] = useState<number | null>(null)
  const [deletingProjectId, setDeletingProjectId] = useState<string | null>(null)
  const [currentTime, setCurrentTime] = useState(0)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm.trim())
      setDebouncedLocation(locationFilter.trim())
    }, 300)
    return () => clearTimeout(timer)
  }, [searchTerm, locationFilter])

  const authReady = mounted && !authLoading
  const isNGO = authReady && user?.user_type === 'ngo'

  useEffect(() => {
    const tab = String(searchParams.get('tab') || searchParams.get('view') || '').toLowerCase()
    if (tab === 'projects' || tab === 'project') {
      setListingKind('projects')
      return
    }
    if (tab === 'needs' || tab === 'need' || tab === 'my-requests') {
      setListingKind('needs')
    }
  }, [searchParams])

  const hasActiveFilters = useMemo(() => {
    const shared =
      Boolean(debouncedSearch) ||
      Boolean(debouncedLocation) ||
      selectedCategory !== 'all'
    if (listingKind === 'projects') return shared
    return shared || selectedNeedType !== 'all' || selectedUrgency !== 'all'
  }, [debouncedSearch, debouncedLocation, selectedCategory, selectedNeedType, selectedUrgency, listingKind])

  useEffect(() => {
    setCurrentTime(Date.now())
    const timer = setInterval(() => {
      setCurrentTime(Date.now())
    }, 60_000)

    return () => clearInterval(timer)
  }, [])

  const deleteRequest = async (id: number) => {
    if (!user || !confirm('Delete this need? This cannot be undone.')) return

    setDeleting(id)
    try {
      const res = await fetch(`/api/service-requests/${id}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${localStorage.getItem('token')}`,
          'Content-Type': 'application/json',
        },
      })
      const data = await res.json()

      if (data.success) {
        toast({ title: 'Success', description: 'Need deleted' })
        fetchNeeds()
      } else {
        toast({ title: 'Error', description: data.error || 'Delete failed', variant: 'destructive' })
      }
    } catch {
      toast({ title: 'Error', description: 'Delete failed', variant: 'destructive' })
    } finally {
      setDeleting(null)
    }
  }

  const deleteProject = async (id: string) => {
    if (!user || !confirm('Delete this project? This cannot be undone.')) return

    setDeletingProjectId(String(id))
    try {
      const res = await fetch(`/api/service-request-projects/${id}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${localStorage.getItem('token')}`,
          'Content-Type': 'application/json',
        },
      })
      const data = await res.json().catch(() => null)

      if (res.ok && data?.success) {
        toast({ title: 'Success', description: 'Project deleted' })
        fetchProjects()
      } else {
        toast({ title: 'Error', description: data?.error || 'Delete failed', variant: 'destructive' })
      }
    } catch {
      toast({ title: 'Error', description: 'Delete failed', variant: 'destructive' })
    } finally {
      setDeletingProjectId(null)
    }
  }

  const fetchNeeds = async () => {
    setLoading(true)
    setError('')

    const params = new URLSearchParams({
      view: 'all',
      ...(selectedCategory !== 'all' && { category: selectedCategory }),
      ...(selectedNeedType !== 'all' && { request_type: selectedNeedType }),
      ...(selectedUrgency !== 'all' && { urgency: selectedUrgency }),
      ...(debouncedSearch && { search: debouncedSearch }),
      ...(debouncedLocation && { location: debouncedLocation }),
      ...(user?.id && { userId: user.id.toString() }),
    })

    try {
      const res = await fetch(`/api/service-requests?${params}`)
      const data = await res.json()

      if (data.success) {
        setRequests(Array.isArray(data.data) ? data.data : [])
      } else {
        setError(data.error || 'Failed to load needs')
      }
    } catch {
      setError('Network error')
    } finally {
      setLoading(false)
    }
  }

  const fetchProjects = async () => {
    setLoading(true)
    setError('')

    const params = new URLSearchParams({
      includeEmpty: 'true',
      status: 'active',
      ...(debouncedSearch && { q: debouncedSearch }),
    })

    try {
      const res = await fetch(`/api/service-request-projects?${params}`)
      const data = await res.json()

      if (data.success) {
        setProjects(Array.isArray(data.data) ? data.data : [])
      } else {
        setError(data.error || 'Failed to load projects')
      }
    } catch {
      setError('Network error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!authReady) return
    if (listingKind === 'projects') {
      fetchProjects()
      return
    }
    fetchNeeds()
  }, [
    listingKind,
    selectedCategory,
    selectedNeedType,
    selectedUrgency,
    debouncedSearch,
    debouncedLocation,
    user?.id,
    authReady,
  ])

  const clearFilters = () => {
    setSearchTerm('')
    setLocationFilter('')
    setDebouncedSearch('')
    setDebouncedLocation('')
    setSelectedCategory('all')
    setSelectedNeedType('all')
    setSelectedUrgency('all')
  }

  const filteredProjects = useMemo(() => {
    return projects.filter((project) => {
      const category = String(project.category || '').toLowerCase()
      const locationHay = `${project.formatted_address || ''} ${project.location_summary || ''} ${project.exact_address || ''} ${project.location || ''} ${project.ngo_location || ''}`.toLowerCase()
      if (selectedCategory !== 'all' && category !== selectedCategory.toLowerCase()) return false
      if (debouncedLocation && !locationHay.includes(debouncedLocation.toLowerCase())) return false
      return true
    })
  }, [projects, selectedCategory, debouncedLocation])

  const hasAcceptedApplicant = (request: any) => {
    const count = Number(request?.accepted_volunteers_count ?? request?.volunteers_count ?? 0)
    return Number.isFinite(count) && count > 0
  }

  const handleListingChange = (value: string) => {
    const next = value === 'projects' ? 'projects' : 'needs'
    setListingKind(next)
    const params = new URLSearchParams(searchParams.toString())
    params.set('tab', next)
    router.replace(`/service-requests?${params.toString()}`, { scroll: false })
  }

  if (error) {
    return (
      <div className="flex min-h-screen flex-col">
        <Header />
        <main className="flex-1 px-6 py-8 md:px-10">
          <div className="py-8 text-center">
            <p className="mb-4 text-red-500">{error}</p>
            <Button onClick={listingKind === 'projects' ? fetchProjects : fetchNeeds}>Try Again</Button>
          </div>
        </main>
      </div>
    )
  }

  const resultCount = listingKind === 'projects' ? filteredProjects.length : requests.length
  const resultLabel = listingKind === 'projects' ? 'project' : 'need'

  return (
    <div className="flex min-h-screen flex-col">
      <Header />

      <main className="flex-1 px-6 py-8 md:px-10">
        <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">NGO Requests</h1>
            <p className="text-muted-foreground">
              Browse standalone needs for individuals, or CSR projects for company takeover.
            </p>
          </div>
        </div>

        <div className="mb-8 rounded-lg border border-gram-border bg-white p-2 shadow-sm">
          <Tabs value={listingKind} onValueChange={handleListingChange}>
            <TabsList className="grid h-auto w-full grid-cols-2 gap-2 bg-transparent p-0">
              <TabsTrigger
                value="needs"
                className="h-auto flex-col items-start gap-1 rounded-md border border-transparent px-4 py-3 text-left data-[state=active]:border-udaan-blue data-[state=active]:bg-udaan-blue data-[state=active]:text-white data-[state=active]:shadow-none data-[state=inactive]:bg-[#F4F5F3] data-[state=inactive]:text-gram-body"
              >
                <span className="text-base font-semibold">Needs</span>
                <span
                  className={`text-xs font-normal leading-snug ${
                    listingKind === 'needs' ? 'text-white/85' : 'text-gram-muted'
                  }`}
                >
                  For individuals to fulfil
                </span>
              </TabsTrigger>
              <TabsTrigger
                value="projects"
                className="h-auto flex-col items-start gap-1 rounded-md border border-transparent px-4 py-3 text-left data-[state=active]:border-udaan-blue data-[state=active]:bg-udaan-blue data-[state=active]:text-white data-[state=active]:shadow-none data-[state=inactive]:bg-[#F4F5F3] data-[state=inactive]:text-gram-body"
              >
                <span className="text-base font-semibold">Projects</span>
                <span
                  className={`text-xs font-normal leading-snug ${
                    listingKind === 'projects' ? 'text-white/85' : 'text-gram-muted'
                  }`}
                >
                  For company CSR takeover
                </span>
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {user && isNGO ? (
          <div className="relative mb-8 overflow-hidden rounded-md border border-gram-border bg-white p-8 shadow-sm">
            <div className="relative z-10 flex flex-col items-center justify-between gap-6 md:flex-row">
              <div className="text-center md:text-left">
                <h2 className="mb-3 text-2xl font-bold text-black">
                  {listingKind === 'projects'
                    ? 'Ready to post a CSR project?'
                    : 'Need individual help on the ground?'}
                </h2>
                <p className="max-w-md text-base font-medium text-gray-700">
                  {listingKind === 'projects'
                    ? 'Create a full project package for company CSR takeover.'
                    : 'Post a standalone need for individuals to fulfil.'}
                </p>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row">
                {listingKind === 'projects' ? (
                  <Link href="/service-requests/projects/create">
                    <button className="flex h-auto items-center whitespace-nowrap rounded-lg border border-gram-border bg-white px-6 py-4 text-base font-medium text-black shadow-sm transition-all duration-300 hover:bg-gram-page">
                      <Plus size={18} className="mr-2" />
                      Post a Project
                    </button>
                  </Link>
                ) : (
                  <Link href="/service-requests/create">
                    <button className="flex h-auto items-center whitespace-nowrap rounded-lg border border-gram-border bg-white px-6 py-4 text-base font-medium text-black shadow-sm transition-all duration-300 hover:bg-gram-page">
                      <Plus size={18} className="mr-2" />
                      Post a Need
                    </button>
                  </Link>
                )}
                <Link href="/ngos/ai-agent">
                  <button className="flex h-auto items-center whitespace-nowrap rounded-lg border-2 border-udaan-blue bg-udaan-blue px-6 py-4 text-base font-medium text-white transition-all duration-300 hover:bg-udaan-blue/90">
                    <Sparkles size={18} className="mr-2" />
                    Use Atlas AI
                    <ArrowRight size={16} className="ml-2" />
                  </button>
                </Link>
              </div>
            </div>
          </div>
        ) : null}

        <section className="mb-6 rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
          <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
            Filters
          </div>

          <div
            className={`grid gap-2 md:grid-cols-2 ${
              listingKind === 'projects' ? 'xl:grid-cols-3' : 'xl:grid-cols-5'
            }`}
          >
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <Input
                type="search"
                placeholder={listingKind === 'projects' ? 'Search projects...' : 'Search needs...'}
                className={`${compactControlClass} pl-8`}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>

            <div className="relative">
              <MapPin className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <Input
                value={locationFilter}
                onChange={(e) => setLocationFilter(e.target.value)}
                placeholder="State or city"
                className={`${compactControlClass} pl-8`}
              />
            </div>

            <StyledSelect
              value={selectedCategory}
              options={CATEGORY_OPTIONS}
              placeholder="All categories"
              onValueChange={setSelectedCategory}
              className={compactControlClass}
            />

            {listingKind === 'needs' ? (
              <>
                <StyledSelect
                  value={selectedNeedType}
                  options={NEED_TYPE_OPTIONS}
                  placeholder="All need types"
                  onValueChange={setSelectedNeedType}
                  className={compactControlClass}
                />

                <StyledSelect
                  value={selectedUrgency}
                  options={URGENCY_OPTIONS}
                  placeholder="Any urgency"
                  onValueChange={setSelectedUrgency}
                  className={compactControlClass}
                />
              </>
            ) : null}
          </div>

          <div className="mt-3 flex flex-col gap-2 border-t border-slate-100 pt-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-slate-500">
              {loading
                ? `Loading ${resultLabel}s...`
                : `${resultCount} ${resultLabel}${resultCount === 1 ? '' : 's'} match your filters`}
            </p>
            {hasActiveFilters ? (
              <Button type="button" variant="ghost" size="sm" className="h-8 px-2 text-slate-600" onClick={clearFilters}>
                Clear filters
              </Button>
            ) : null}
          </div>
        </section>

        <div className="min-h-[400px]">
          {loading ? (
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <ServiceRequestCardSkeleton key={i} kind={listingKind} />
              ))}
            </div>
          ) : listingKind === 'projects' ? (
            filteredProjects.length > 0 ? (
              <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {filteredProjects.map((project) => (
                  <ProjectListingCard
                    key={project.id}
                    project={project}
                    isOwner={Boolean(user && isNGO && Number(user.id) === Number(project.ngo_id))}
                    isDeleting={deletingProjectId === String(project.id)}
                    onDelete={() => deleteProject(String(project.id))}
                  />
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-8 text-center">
                <h3 className="mb-1 text-lg font-semibold">No projects found</h3>
                <p className="mb-4 text-muted-foreground">
                  No CSR projects match your current search or filters.
                </p>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Button variant="outline" onClick={clearFilters}>
                    Clear Filters
                  </Button>
                  {isNGO ? (
                    <Button asChild>
                      <Link href="/service-requests/projects/create">Post a Project</Link>
                    </Button>
                  ) : null}
                </div>
              </div>
            )
          ) : requests.length > 0 ? (
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {requests.map((request) => (
                <ServiceCard
                  key={request.id}
                  id={request.id}
                  title={request.title}
                  description={request.description}
                  category={request.category}
                  location={request.location}
                  images={request.images}
                  ngo_name={request.ngo_name}
                  ngo_id={request.ngo_id}
                  provider={request.ngo_name}
                  providerType="ngo"
                  verified={request.verified}
                  tags={request.tags}
                  created_at={request.created_at}
                  urgency_level={request.urgency_level}
                  priority={request.priority}
                  volunteers_needed={request.volunteers_needed}
                  timeline={request.timeline}
                  deadline={request.deadline}
                  requirements={request.requirements}
                  impact_score={request.impact_score}
                  project={request.project}
                  currentTime={currentTime}
                  type="request"
                  onDelete={() => deleteRequest(request.id)}
                  isDeleting={deleting === request.id}
                  showDeleteButton={!!(user && isNGO && request.ngo_name === user?.name && !hasAcceptedApplicant(request))}
                  isOwner={!!(user && isNGO && request.ngo_name === user?.name)}
                  canInteract={true}
                />
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-8 text-center">
              <h3 className="mb-1 text-lg font-semibold">No needs found</h3>
              <p className="mb-4 text-muted-foreground">
                No NGO needs match your current search or filters.
              </p>
              <Button variant="outline" onClick={clearFilters}>
                Clear Filters
              </Button>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}

export default function ServiceRequestsPage() {
  return (
    <Suspense
      fallback={
        <PlatformPageSkeleton>
          <PlatformContentSkeleton>
            <div className="mb-8 flex flex-col gap-3">
              <Skeleton className="h-9 w-64" />
              <Skeleton className="h-5 w-full max-w-xl" />
            </div>

            <SkeletonCTA />

            <div className="mb-8">
              <div className="mb-6 grid gap-6 md:grid-cols-2">
                <Skeleton className="h-10" />
                <Skeleton className="h-10" />
              </div>

              <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <ServiceRequestCardSkeleton key={i} kind="needs" />
                ))}
              </div>
            </div>
          </PlatformContentSkeleton>
        </PlatformPageSkeleton>
      }
    >
      <ServiceRequestsContent />
    </Suspense>
  )
}
