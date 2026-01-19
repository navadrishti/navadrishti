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
import { SkeletonHeader, SkeletonServiceCard, SkeletonCTA } from '@/components/ui/skeleton'
import { Search, Target, ArrowRight, Plus, HeartHandshake } from 'lucide-react'
import { useAuth } from '@/lib/auth-context'
import { useToast } from '@/hooks/use-toast'
import { getServiceRequestCategoriesWithAll } from '@/lib/categories'

const categories = getServiceRequestCategoriesWithAll()

function ServiceRequestsContent() {
  const { user } = useAuth()
  const { toast } = useToast()
  const searchParams = useSearchParams()
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('All Categories')
  const [currentView, setCurrentView] = useState('all')
  const [requests, setRequests] = useState<Record<string, any[]>>({
    all: [],
    'my-requests': [],
    volunteering: []
  })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [deleting, setDeleting] = useState<number | null>(null)
  
  const serviceRequests = requests[currentView] || []
  const isNGO = user?.user_type === 'ngo'
  const canVolunteer = user?.user_type === 'individual' || user?.user_type === 'company'

  useEffect(() => {
    const tab = searchParams.get('tab')
    if (tab === 'volunteering' || tab === 'my-requests') setCurrentView(tab)
  }, [searchParams])

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
    if (currentView === 'volunteering' && canVolunteer) {
      const interval = setInterval(fetchRequests, 30000)
      return () => clearInterval(interval)
    }
  }, [currentView, canVolunteer])
  
  const handleTabChange = (value: string) => {
    setCurrentView(value)
    if (!requests[value]?.length) setLoading(true)
    setError('')
  }

  const filteredRequests = serviceRequests

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
            <h1 className="text-3xl font-bold tracking-tight">Service Requests</h1>
            <p className="text-muted-foreground">
              NGOs seeking assistance, volunteers, and resources
            </p>
          </div>
        </div>

        {/* Create Service Request CTA */}
        {loading ? (
          user && isNGO && <SkeletonCTA />
        ) : user && isNGO && (
          <div className="mb-8 p-8 bg-gradient-to-br from-gray-900 via-gray-800 to-black rounded-2xl border border-gray-700 shadow-2xl relative overflow-hidden">
            {/* Background gradient overlay */}
            <div className="absolute inset-0 bg-gradient-to-r from-blue-600/10 via-purple-600/10 to-indigo-600/10 pointer-events-none"></div>
            
            <div className="flex flex-col md:flex-row items-center justify-between gap-6 relative z-10">
              <div className="text-center md:text-left">
                <h2 className="text-2xl font-bold text-white mb-3">
                  Need Help with a Project?
                </h2>
                <p className="text-gray-300 text-base max-w-md">
                  Create a service request and connect with skilled volunteers in your community
                </p>
              </div>
              <Link href="/service-requests/create">
                <button className="gradient-border-btn shadow-xl text-white transition-all duration-300 px-8 py-4 h-auto font-medium text-base">
                  <Plus size={20} className="mr-3" />
                  Create Service Request
                  <ArrowRight size={16} className="ml-3" />
                </button>
              </Link>
            </div>
          </div>
        )}
        
        <Tabs value={currentView} className="mb-8" onValueChange={handleTabChange}>
          <TabsList className="mb-6 inline-flex h-10 items-center justify-center rounded-md bg-muted p-1 text-muted-foreground">
            <TabsTrigger value="all" className="min-w-[100px] whitespace-nowrap">All Requests</TabsTrigger>
            {user && isNGO && <TabsTrigger value="my-requests" className="min-w-[100px] whitespace-nowrap">My Requests</TabsTrigger>}
            {user && canVolunteer && <TabsTrigger value="volunteering" className="min-w-[100px] whitespace-nowrap">My Volunteering</TabsTrigger>}
          </TabsList>
          
          <div className="mb-6 grid gap-6 md:grid-cols-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                type="search"
                placeholder="Search requests..."
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
                    <SkeletonServiceCard key={i} />
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
                  type="request"
                  onDelete={() => deleteRequest(request.id)}
                  isDeleting={deleting === request.id}
                  showDeleteButton={!!(user && isNGO && request.ngo_name === user?.name)}
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
                  <h3 className="mb-1 text-lg font-semibold">No requests found</h3>
                  <p className="mb-4 text-muted-foreground">
                    No service requests match your current search or filters.
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
                  {loading ? (
                    <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
                      {Array.from({ length: 6 }).map((_, i) => (
                        <SkeletonServiceCard key={i} />
                      ))}
                    </div>
                  ) : filteredRequests.length === 0 ? (
                  <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-8 text-center">
                    <div className="mb-4 rounded-full bg-muted p-3">
                      <Target size={24} className="text-muted-foreground" />
                    </div>
                    <h3 className="mb-1 text-lg font-semibold">No requests posted yet</h3>
                    <p className="mb-4 text-muted-foreground">
                      You haven't posted any service requests yet.
                    </p>
                    <Link href="/service-requests/create">
                      <Button>
                        <Plus size={16} className="mr-2" />
                        Post New Request
                      </Button>
                    </Link>
                  </div>
                ) : (
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
                        type="request"
                        onDelete={() => deleteRequest(request.id)}
                        isDeleting={deleting === request.id}
                        showDeleteButton={true}
                        isOwner={true}
                        canInteract={true}
                      />
                    ))}
                  </div>
                )}
                </>
              )}
            </div>
          </TabsContent>
          
          <TabsContent value="volunteering" className="mt-0">
            <div className="min-h-[400px]">
              {/* Refresh button for volunteering tab */}
              {canVolunteer && (
                <div className="mb-4 flex justify-between items-center">
                  <p className="text-sm text-muted-foreground">
                    Your volunteer applications and their current status
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
              
              {canVolunteer && loading ? (
                <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <SkeletonServiceCard key={i} />
                  ))}
                </div>
              ) : canVolunteer && filteredRequests.length === 0 ? (
                <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-8 text-center">
                  <div className="mb-4 rounded-full bg-muted p-3">
                    <HeartHandshake size={24} className="text-muted-foreground" />
                  </div>
                  <h3 className="mb-1 text-lg font-semibold">No volunteering activities yet</h3>
                  <p className="mb-4 text-muted-foreground">
                    You haven't volunteered for any service requests yet.
                  </p>
                  <Link href="/service-requests">
                    <Button variant="outline">
                      Browse Requests
                    </Button>
                  </Link>
                </div>
              ) : canVolunteer && filteredRequests.length > 0 ? (
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
                      type="request"
                      volunteer_application={request.volunteer_application}
                      showDeleteButton={false}
                      isOwner={false}
                      canInteract={true}
                    />
                  ))}
                </div>
              ) : null}
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
      <div className="min-h-screen bg-gray-50">
        <Header />
        <div className="container mx-auto px-4 py-8">
          <SkeletonHeader />
          <div className="mt-8 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <SkeletonServiceCard key={i} />
            ))}
          </div>
        </div>
      </div>
    }>
      <ServiceRequestsContent />
    </Suspense>
  )
}