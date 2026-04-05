'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Header } from '@/components/header'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ServiceCard } from '@/components/service-card'
import { Skeleton } from '@/components/ui/skeleton'
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card'
import { Search, Target, ArrowRight, Plus, HeartHandshake } from 'lucide-react'
import { useAuth } from '@/lib/auth-context'
import { useToast } from '@/hooks/use-toast'
import { getServiceRequestCategoriesWithAll } from '@/lib/categories'

const categories = getServiceRequestCategoriesWithAll()

function ServiceRequestCardSkeleton() {
  return (
    <Card className="h-full flex flex-col border-2 border-gray-200">
      <CardHeader className="space-y-3 pb-4">
        <div className="flex items-center justify-between gap-2">
          <Skeleton className="h-7 w-24 rounded-full" />
          <Skeleton className="h-7 w-20 rounded-full" />
        </div>

        <div className="space-y-2">
          <Skeleton className="h-7 w-[90%]" />
          <Skeleton className="h-7 w-[72%]" />
        </div>

        <div className="flex items-center gap-3 pt-2">
          <Skeleton className="h-10 w-10 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-24" />
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4 flex-1 pb-4">
        <div className="space-y-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-[94%]" />
          <Skeleton className="h-4 w-[82%]" />
        </div>

        <div className="grid grid-cols-2 gap-3 pt-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="space-y-1">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-4 w-16" />
            </div>
          ))}
        </div>
      </CardContent>

      <CardFooter className="mt-auto pt-2">
        <Skeleton className="h-10 w-full" />
      </CardFooter>
    </Card>
  )
}

function ServiceRequestCtaSkeleton() {
  return (
    <div className="mb-8 p-8 bg-white rounded-2xl border-2 border-black shadow-2xl relative overflow-hidden">
      <div className="flex flex-col md:flex-row items-center justify-between gap-6 relative z-10">
        <div className="text-center md:text-left">
          <Skeleton className="h-8 w-72 mb-3" />
          <Skeleton className="h-5 w-full max-w-md" />
        </div>
        <Skeleton className="h-[58px] w-[210px] rounded-lg" />
      </div>
    </div>
  )
}

function ServiceRequestsContent() {
  const { user, loading: authLoading } = useAuth()
  const { toast } = useToast()
  const searchParams = useSearchParams()
  const [mounted, setMounted] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('All Categories')
  const [currentView, setCurrentView] = useState('all')
  const [requests, setRequests] = useState<Record<string, any[]>>({
    all: [],
    'my-requests': [],
    'my-responses': []
  })
  const [ongoingApplications, setOngoingApplications] = useState<any[]>([])
  const [historyApplications, setHistoryApplications] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingApplications, setLoadingApplications] = useState(false)
  const [error, setError] = useState('')
  const [deleting, setDeleting] = useState<number | null>(null)
  const [responseBucket, setResponseBucket] = useState<'ongoing' | 'history'>('ongoing')
  const [currentTime, setCurrentTime] = useState(0)
  const [myNeedsBucket, setMyNeedsBucket] = useState<'ongoing' | 'history'>('ongoing')

  useEffect(() => {
    setMounted(true)
  }, [])
  
  const serviceRequests = requests[currentView] || []
  const authReady = mounted && !authLoading
  const isNGO = authReady && user?.user_type === 'ngo'
  const canVolunteer = authReady && user?.user_type === 'individual'
  const showMyNeedsTab = isNGO
  const showMyResponsesTab = canVolunteer

  useEffect(() => {
    const tab = searchParams.get('tab')
    const view = searchParams.get('view')
    const candidate = tab || view
    if (!candidate) return

    if (candidate === 'my-requests') {
      setCurrentView('my-requests')
      return
    }

    if (candidate === 'my-responses' || candidate === 'volunteering') {
      setCurrentView('my-responses')
    }
  }, [searchParams])

  useEffect(() => {
    if (!authReady) return

    if (currentView === 'my-requests' && !showMyNeedsTab) {
      setCurrentView('all')
      return
    }

    if (currentView === 'my-responses' && !showMyResponsesTab) {
      setCurrentView('all')
    }
  }, [authReady, currentView, showMyNeedsTab, showMyResponsesTab])

  useEffect(() => {
    setCurrentTime(Date.now())
    const timer = setInterval(() => {
      setCurrentTime(Date.now())
    }, 60_000)

    return () => clearInterval(timer)
  }, [])

  const deleteRequest = async (id: number) => {
    if (!user || !confirm('Delete this request? This cannot be undone.')) return

    setDeleting(id)
    try {
      const res = await fetch(`/api/service-requests/${id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
          'Content-Type': 'application/json'
        }
      })
      const data = await res.json()

      if (data.success) {
        toast({ title: "Success", description: "Request deleted" })
        fetchRequests()
      } else {
        toast({ title: "Error", description: data.error || "Delete failed", variant: "destructive" })
      }
    } catch {
      toast({ title: "Error", description: "Delete failed", variant: "destructive" })
    } finally {
      setDeleting(null)
    }
  };

  const fetchRequests = async () => {
    setLoading(true)
    setError('')
    
    const params = new URLSearchParams({
      view: currentView,
      ...(selectedCategory !== 'All Categories' && { category: selectedCategory }),
      ...(searchTerm && { search: searchTerm }),
      ...(user?.id && { userId: user.id.toString() })
    })
    
    const headers: Record<string, string> = {}
    if (currentView !== 'all') {
      const token = localStorage.getItem('token')
      if (token) headers['Authorization'] = `Bearer ${token}`
    }
    
    try {
      const res = await fetch(`/api/service-requests?${params}`, { headers })
      const data = await res.json()
      
      if (data.success) {
        setRequests(prev => ({ ...prev, [currentView]: data.data }))
      } else {
        setError(data.error || 'Failed to load requests')
      }
    } catch (err) {
      setError('Network error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchRequests() }, [selectedCategory, searchTerm, currentView, user?.id])

  useEffect(() => {
    if (currentView === 'my-responses' && canVolunteer) {
      const interval = setInterval(fetchRequests, 30000)
      return () => clearInterval(interval)
    }
  }, [currentView, canVolunteer])

  useEffect(() => {
    const fetchApplicationBuckets = async () => {
      if (!canVolunteer || currentView !== 'my-responses') return

      const token = localStorage.getItem('token')
      if (!token) return

      setLoadingApplications(true)
      try {
        const [ongoingRes, historyRes] = await Promise.all([
          fetch('/api/service-request-assignments?view=ongoing', { headers: { Authorization: `Bearer ${token}` } }),
          fetch('/api/service-request-assignments?view=history', { headers: { Authorization: `Bearer ${token}` } })
        ])

        const ongoingData = await ongoingRes.json()
        const historyData = await historyRes.json()

        setOngoingApplications(ongoingData.success ? (ongoingData.data || []) : [])
        setHistoryApplications(historyData.success ? (historyData.data || []) : [])
      } catch {
        setOngoingApplications([])
        setHistoryApplications([])
      } finally {
        setLoadingApplications(false)
      }
    }

    fetchApplicationBuckets()
  }, [canVolunteer, currentView, user?.id])
  
  const handleTabChange = (value: string) => {
    setCurrentView(value)
    if (!requests[value]?.length) setLoading(true)
    setError('')
  }

  const filteredRequests = serviceRequests
  const isHistoryRequest = (request: any) => {
    const status = String(request?.status || '').toLowerCase()
    return status === 'completed' || status === 'cancelled'
  }
  const myNeedsOngoingRequests = filteredRequests.filter((request) => !isHistoryRequest(request))
  const myNeedsHistoryRequests = filteredRequests.filter((request) => isHistoryRequest(request))
  const hasAcceptedApplicant = (request: any) => {
    const count = Number(request?.accepted_volunteers_count ?? request?.volunteers_count ?? 0)
    return Number.isFinite(count) && count > 0
  }

  const currentApplications = responseBucket === 'ongoing' ? ongoingApplications : historyApplications

  if (error) {
    return (
      <div className="flex min-h-screen flex-col">
        <Header />
        <main className="flex-1 px-6 py-8 md:px-10">
          <div className="text-center py-8">
            <p className="text-red-500 mb-4">{error}</p>
            <Button onClick={fetchRequests}>Try Again</Button>
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      
      <main className="flex-1 px-6 py-8 md:px-10">
        <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">NGO Requests</h1>
            <p className="text-muted-foreground">
              Structured needs from NGOs seeking measurable execution support
            </p>
          </div>
        </div>

        {/* Create Service Request CTA */}
        {loading ? (
          user && isNGO && <ServiceRequestCtaSkeleton />
        ) : user && isNGO && (
          <div className="mb-8 p-8 bg-white rounded-2xl border-2 border-black shadow-2xl relative overflow-hidden">
            
            <div className="flex flex-col md:flex-row items-center justify-between gap-6 relative z-10">
              <div className="text-center md:text-left">
                <h2 className="text-2xl font-bold text-black mb-3">
                  Need Execution Support?
                </h2>
                <p className="text-gray-700 text-base max-w-md font-medium">
                  Create a structured need and connect with verified response partners
                </p>
              </div>
              <Link href="/service-requests/create">
                <button className="bg-white border-2 border-black shadow-xl text-black hover:bg-gray-50 transition-all duration-300 px-8 py-4 h-auto font-medium text-base rounded-lg flex items-center">
                  <Plus size={20} className="mr-3" />
                  Create Need
                  <ArrowRight size={16} className="ml-3" />
                </button>
              </Link>
            </div>
          </div>
        )}
        
        <Tabs value={currentView} className="mb-8" onValueChange={handleTabChange}>
          <TabsList className="mb-6 inline-flex h-auto flex-wrap items-stretch justify-start gap-1 rounded-md bg-muted p-1 text-muted-foreground sm:h-10 sm:flex-nowrap">
            <TabsTrigger value="all" className="whitespace-nowrap">All Needs</TabsTrigger>
            {showMyNeedsTab && (
              <TabsTrigger value="my-requests" className="whitespace-nowrap">
                My Needs
              </TabsTrigger>
            )}
            {showMyResponsesTab && (
              <TabsTrigger value="my-responses" className="whitespace-nowrap">
                My Applications
              </TabsTrigger>
            )}
          </TabsList>
          
          <div className="mb-6 grid gap-6 md:grid-cols-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                type="search"
                placeholder="Search needs..."
                className="pl-8"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <div className="flex gap-4">
              <div className="relative flex-1">
                <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((category) => (
                      <SelectItem key={category} value={category}>
                        {category}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          
          <TabsContent value="all" className="mt-0">
            <div className="min-h-[400px]">
              {loading ? (
                <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <ServiceRequestCardSkeleton key={i} />
                  ))}
                </div>
              ) : filteredRequests.length > 0 ? (
                <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
              {filteredRequests.map((request) => (
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
                  <div className="mb-4 rounded-full bg-muted p-3">
                    <Search size={24} className="text-muted-foreground" />
                  </div>
                  <h3 className="mb-1 text-lg font-semibold">No needs found</h3>
                  <p className="mb-4 text-muted-foreground">
                    No NGO requests match your current search or filters.
                  </p>
                  <Button variant="outline" onClick={() => {
                    setSearchTerm('');
                    setSelectedCategory('All Categories');
                  }}>
                    Clear Filters
                  </Button>
                </div>
              )}
            </div>
          </TabsContent>
          
          <TabsContent value="my-requests" className="mt-0">
            <div className="min-h-[400px]">
              {isNGO && (
                <>
                  <Tabs value={myNeedsBucket} onValueChange={(value) => setMyNeedsBucket(value as 'ongoing' | 'history')} className="w-full">
                    <TabsList className="mb-4 grid w-full grid-cols-2">
                      <TabsTrigger value="ongoing">Ongoing</TabsTrigger>
                      <TabsTrigger value="history">History</TabsTrigger>
                    </TabsList>

                    <TabsContent value="ongoing" className="mt-0">
                      {loading ? (
                        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
                          {Array.from({ length: 6 }).map((_, i) => (
                            <ServiceRequestCardSkeleton key={i} />
                          ))}
                        </div>
                      ) : myNeedsOngoingRequests.length === 0 ? (
                        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-8 text-center">
                          <div className="mb-4 rounded-full bg-muted p-3">
                            <Target size={24} className="text-muted-foreground" />
                          </div>
                          <h3 className="mb-1 text-lg font-semibold">No ongoing needs</h3>
                          <p className="mb-4 text-muted-foreground">
                            Active and in-progress NGO requests will appear here.
                          </p>
                          <Link href="/service-requests/create">
                            <Button>
                              <Plus size={16} className="mr-2" />
                              Create New Need
                            </Button>
                          </Link>
                        </div>
                      ) : (
                        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
                          {myNeedsOngoingRequests.map((request) => (
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
                              showDeleteButton={!hasAcceptedApplicant(request)}
                              isOwner={true}
                              canInteract={true}
                            />
                          ))}
                        </div>
                      )}
                    </TabsContent>

                    <TabsContent value="history" className="mt-0">
                      {loading ? (
                        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
                          {Array.from({ length: 6 }).map((_, i) => (
                            <ServiceRequestCardSkeleton key={i} />
                          ))}
                        </div>
                      ) : myNeedsHistoryRequests.length === 0 ? (
                        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-8 text-center">
                          <div className="mb-4 rounded-full bg-muted p-3">
                            <Target size={24} className="text-muted-foreground" />
                          </div>
                          <h3 className="mb-1 text-lg font-semibold">No history yet</h3>
                          <p className="mb-4 text-muted-foreground">
                            Completed or cancelled NGO requests will appear here.
                          </p>
                        </div>
                      ) : (
                        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
                          {myNeedsHistoryRequests.map((request) => (
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
                              showDeleteButton={false}
                              isOwner={true}
                              canInteract={true}
                            />
                          ))}
                        </div>
                      )}
                    </TabsContent>
                  </Tabs>
                </>
              )}
            </div>
          </TabsContent>
          
          <TabsContent value="my-responses" className="mt-0">
            <div className="min-h-[400px]">
              {/* Refresh button for response tab */}
              {canVolunteer && (
                <div className="mb-4 flex justify-between items-center">
                  <p className="text-sm text-muted-foreground">
                    Your applications to NGO requests and their current status
                  </p>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={() => fetchRequests()}
                    disabled={loading}
                    className="gap-1"
                  >
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    Refresh
                  </Button>
                </div>
              )}

              {canVolunteer && (
                <Tabs value={responseBucket} onValueChange={(value) => setResponseBucket(value as 'ongoing' | 'history')} className="w-full">
                  <TabsList className="mb-4 grid w-full grid-cols-2">
                    <TabsTrigger value="ongoing">Ongoing</TabsTrigger>
                    <TabsTrigger value="history">History</TabsTrigger>
                  </TabsList>

                  <TabsContent value="ongoing" className="mt-0">
                    {loadingApplications || loading ? (
                      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
                        {Array.from({ length: 6 }).map((_, i) => (
                          <ServiceRequestCardSkeleton key={i} />
                        ))}
                      </div>
                    ) : ongoingApplications.length === 0 ? (
                      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-8 text-center">
                        <div className="mb-4 rounded-full bg-muted p-3">
                          <HeartHandshake size={24} className="text-muted-foreground" />
                        </div>
                        <h3 className="mb-1 text-lg font-semibold">No ongoing applications</h3>
                        <p className="mb-4 text-muted-foreground">
                          Accepted and active assignments will appear here.
                        </p>
                        <Link href="/service-requests">
                          <Button variant="outline">
                            Browse Needs
                          </Button>
                        </Link>
                      </div>
                    ) : (
                      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
                        {ongoingApplications.map((application) => (
                          <ServiceCard
                            key={application.id}
                            id={application.request?.id || application.id}
                            title={application.request?.title || 'Service Request'}
                            description={application.request?.description || ''}
                            category={application.request?.category || 'Request'}
                            location={application.request?.project?.title || application.request?.location || 'Project not set'}
                            images={application.request?.images}
                            ngo_name={application.request?.ngo_name || 'NGO'}
                            ngo_id={application.request?.ngo_id || 0}
                            provider={application.request?.ngo_name || 'NGO'}
                            providerType="ngo"
                            verified={application.request?.verified}
                            tags={application.request?.tags}
                            created_at={application.request?.created_at || application.applied_at}
                            urgency_level={application.request?.urgency_level}
                            priority={application.request?.priority}
                            volunteers_needed={application.request?.volunteers_needed}
                            timeline={application.request?.timeline}
                            deadline={application.request?.deadline}
                            requirements={application.request?.requirements}
                            impact_score={application.request?.impact_score}
                            project={application.request?.project}
                            currentTime={currentTime}
                            type="request"
                            volunteer_application={application}
                            showDeleteButton={false}
                            isOwner={false}
                            canInteract={true}
                          />
                        ))}
                      </div>
                    )}
                  </TabsContent>

                  <TabsContent value="history" className="mt-0">
                    {loadingApplications || loading ? (
                      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
                        {Array.from({ length: 6 }).map((_, i) => (
                          <ServiceRequestCardSkeleton key={i} />
                        ))}
                      </div>
                    ) : historyApplications.length === 0 ? (
                      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-8 text-center">
                        <div className="mb-4 rounded-full bg-muted p-3">
                          <HeartHandshake size={24} className="text-muted-foreground" />
                        </div>
                        <h3 className="mb-1 text-lg font-semibold">No history yet</h3>
                        <p className="mb-4 text-muted-foreground">
                          Completed, rejected, or cancelled applications will appear here.
                        </p>
                        <Link href="/service-requests">
                          <Button variant="outline">
                            Browse Needs
                          </Button>
                        </Link>
                      </div>
                    ) : (
                      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
                        {historyApplications.map((application) => (
                          <ServiceCard
                            key={application.id}
                            id={application.request?.id || application.id}
                            title={application.request?.title || 'Service Request'}
                            description={application.request?.description || ''}
                            category={application.request?.category || 'Request'}
                            location={application.request?.project?.title || application.request?.location || 'Project not set'}
                            images={application.request?.images}
                            ngo_name={application.request?.ngo_name || 'NGO'}
                            ngo_id={application.request?.ngo_id || 0}
                            provider={application.request?.ngo_name || 'NGO'}
                            providerType="ngo"
                            verified={application.request?.verified}
                            tags={application.request?.tags}
                            created_at={application.request?.created_at || application.applied_at}
                            urgency_level={application.request?.urgency_level}
                            priority={application.request?.priority}
                            volunteers_needed={application.request?.volunteers_needed}
                            timeline={application.request?.timeline}
                            deadline={application.request?.deadline}
                            requirements={application.request?.requirements}
                            impact_score={application.request?.impact_score}
                            project={application.request?.project}
                            currentTime={currentTime}
                            type="request"
                            volunteer_application={application}
                            showDeleteButton={false}
                            isOwner={false}
                            canInteract={true}
                          />
                        ))}
                      </div>
                    )}
                  </TabsContent>
                </Tabs>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  )
}

export default function ServiceRequestsPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen flex-col">
        <Header />
        <main className="flex-1 px-6 py-8 md:px-10">
          <div className="mb-8 flex flex-col gap-3">
            <Skeleton className="h-9 w-64" />
            <Skeleton className="h-5 w-full max-w-xl" />
          </div>

          <ServiceRequestCtaSkeleton />

          <div className="mb-8">
            <div className="mb-6 inline-flex h-10 items-center gap-2 rounded-md bg-muted p-1">
              <Skeleton className="h-8 w-24" />
              <Skeleton className="h-8 w-24" />
              <Skeleton className="h-8 w-28" />
            </div>

            <div className="mb-6 grid gap-6 md:grid-cols-2">
              <Skeleton className="h-10" />
              <Skeleton className="h-10" />
            </div>

            <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <ServiceRequestCardSkeleton key={i} />
              ))}
            </div>
          </div>
        </main>
      </div>
    }>
      <ServiceRequestsContent />
    </Suspense>
  )
}