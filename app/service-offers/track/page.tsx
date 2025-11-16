'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '@/lib/auth-context'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Input } from '@/components/ui/input'
import { Header } from '@/components/header'
import { 
  Clock, 
  CheckCircle, 
  XCircle, 
  AlertTriangle,
  Calendar,
  MapPin,
  DollarSign,
  Users,
  Search,
  RefreshCw,
  Eye,
  Timer
} from 'lucide-react'
import Link from 'next/link'
import { useToast } from '@/hooks/use-toast'

interface ServiceOffer {
  id: number
  title: string
  description: string
  category: string
  location: {
    state: string
    city: string
    area: string
  }
  wage_info: {
    type: string
    min_amount: number
    max_amount: number
    currency: string
  }
  employment_type: string
  duration: string
  admin_status: 'pending' | 'approved' | 'rejected'
  admin_reviewed_at: string | null
  admin_comments: string | null
  created_at: string
  submitted_for_review_at: string
  applications_count?: number
}

export default function TrackServiceOffersPage() {
  const { user, loading } = useAuth()
  const { toast } = useToast()
  const [serviceOffers, setServiceOffers] = useState<ServiceOffer[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')

  // Calculate remaining time for review deadline
  const getRemainingTime = (submittedDate: string, status: string) => {
    if (status !== 'pending') {
      return null // No timer for approved/rejected offers
    }

    const submitted = new Date(submittedDate)
    const deadline = new Date(submitted.getTime() + (5 * 24 * 60 * 60 * 1000)) // 5 days after submission
    const now = new Date()
    const remaining = deadline.getTime() - now.getTime()
    
    if (remaining <= 0) {
      return { expired: true, text: 'EXPIRED', color: 'text-red-600', bgColor: 'bg-red-50', icon: AlertTriangle }
    }
    
    const days = Math.floor(remaining / (1000 * 60 * 60 * 24))
    const hours = Math.floor((remaining % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
    const minutes = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60))
    
    if (days > 1) {
      return { 
        expired: false, 
        text: `${days} days left`, 
        color: days >= 3 ? 'text-green-600' : days >= 1 ? 'text-yellow-600' : 'text-red-600',
        bgColor: days >= 3 ? 'bg-green-50' : days >= 1 ? 'bg-yellow-50' : 'bg-red-50',
        icon: Timer
      }
    } else if (days === 1) {
      return { 
        expired: false, 
        text: `1 day ${hours}h left`, 
        color: 'text-orange-600',
        bgColor: 'bg-orange-50',
        icon: Timer
      }
    } else {
      return { 
        expired: false, 
        text: `${hours}h ${minutes}m left`, 
        color: 'text-red-600',
        bgColor: 'bg-red-50',
        icon: AlertTriangle
      }
    }
  }

  // Calculate review duration for completed reviews
  const getReviewDuration = (submittedDate: string, reviewedDate: string) => {
    const submitted = new Date(submittedDate)
    const reviewed = new Date(reviewedDate)
    const duration = reviewed.getTime() - submitted.getTime()
    
    const days = Math.floor(duration / (1000 * 60 * 60 * 24))
    const hours = Math.floor((duration % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
    const minutes = Math.floor((duration % (1000 * 60 * 60)) / (1000 * 60))
    
    if (days > 0) {
      return `${days}d ${hours}h`
    } else if (hours > 0) {
      return `${hours}h ${minutes}m`
    } else {
      return `${minutes}m`
    }
  }

  // Fetch service offers
  const fetchServiceOffers = async () => {
    try {
      setIsLoading(true)
      const token = localStorage.getItem('token')
      
      if (!token) {
        toast({
          title: "Authentication Required",
          description: "Please login to view your service offers",
          variant: "destructive"
        })
        return
      }

      const response = await fetch('/api/service-offers?view=my-offers', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })

      const data = await response.json()
      
      if (data.success) {
        setServiceOffers(data.data || [])
      } else {
        toast({
          title: "Error",
          description: data.error || "Failed to fetch service offers",
          variant: "destructive"
        })
      }
    } catch (error) {
      console.error('Error fetching service offers:', error)
      toast({
        title: "Error",
        description: "Failed to load service offers",
        variant: "destructive"
      })
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    if (user && user.user_type === 'ngo') {
      fetchServiceOffers()
    }
  }, [user])

  // Filter offers based on active tab and search
  const filteredOffers = serviceOffers.filter(offer => {
    let matchesTab = false
    
    switch (activeTab) {
      case 'all':
        matchesTab = true
        break
      case 'pending':
        matchesTab = offer.admin_status === 'pending'
        break
      case 'approved':
        matchesTab = offer.admin_status === 'approved'
        break
      case 'rejected':
        matchesTab = offer.admin_status === 'rejected'
        break
    }
    
    const matchesSearch = searchQuery === '' || 
      offer.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      offer.category.toLowerCase().includes(searchQuery.toLowerCase())
    
    return matchesTab && matchesSearch
  })

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Header />
        <div className="container mx-auto px-4 py-8">
          <div className="flex items-center justify-center min-h-[400px]">
            <div className="text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
              <p className="mt-4 text-gray-600">Loading...</p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (!user || user.user_type !== 'ngo') {
    return (
      <div className="min-h-screen bg-gray-50">
        <Header />
        <div className="container mx-auto px-4 py-8">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-gray-900 mb-4">Access Denied</h1>
            <p className="text-gray-600 mb-8">This page is only accessible to NGO users.</p>
            <Link href="/">
              <Button>Go Home</Button>
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      <div className="container mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Track Service Offers</h1>
            <p className="text-gray-600 mt-2">
              Monitor the status and review timeline of your service offers
            </p>
            <div className="flex items-center gap-4 mt-3 text-sm text-gray-500">
              <div className="flex items-center gap-1">
                <Timer className="h-4 w-4 text-green-600" />
                <span>5-day review deadline</span>
              </div>
              <div className="flex items-center gap-1">
                <AlertTriangle className="h-4 w-4 text-red-600" />
                <span>Auto-rejection after deadline</span>
              </div>
            </div>
          </div>
          <Button 
            onClick={fetchServiceOffers}
            disabled={isLoading}
            variant="outline"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>

        {/* Search Bar */}
        <div className="mb-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
            <Input
              placeholder="Search by title or category..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-6">
            <TabsTrigger value="all">All Offers ({serviceOffers.length})</TabsTrigger>
            <TabsTrigger value="pending">Pending Review ({serviceOffers.filter(o => o.admin_status === 'pending').length})</TabsTrigger>
            <TabsTrigger value="approved">Approved ({serviceOffers.filter(o => o.admin_status === 'approved').length})</TabsTrigger>
            <TabsTrigger value="rejected">Rejected ({serviceOffers.filter(o => o.admin_status === 'rejected').length})</TabsTrigger>
          </TabsList>

          <TabsContent value={activeTab}>
            {isLoading ? (
              <div className="space-y-4">
                {[...Array(3)].map((_, i) => (
                  <Card key={i} className="animate-pulse">
                    <CardContent className="p-6">
                      <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
                      <div className="h-3 bg-gray-200 rounded w-1/2 mb-4"></div>
                      <div className="h-3 bg-gray-200 rounded w-full"></div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : filteredOffers.length === 0 ? (
              <Card>
                <CardContent className="p-12 text-center">
                  <Eye className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">
                    {activeTab === 'all' ? 'No Service Offers' : `No ${activeTab} offers`}
                  </h3>
                  <p className="text-gray-500 mb-4">
                    {activeTab === 'all' 
                      ? 'You haven\'t created any service offers yet.' 
                      : `You don\'t have any ${activeTab} offers.`}
                  </p>
                  {activeTab === 'all' && (
                    <Link href="/service-offers/create">
                      <Button>Create Your First Offer</Button>
                    </Link>
                  )}
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                {filteredOffers.map((offer) => {
                  const timeInfo = getRemainingTime(offer.submitted_for_review_at, offer.admin_status)
                  const IconComponent = timeInfo?.icon || Clock
                  
                  return (
                    <Card key={offer.id} className={`transition-all hover:shadow-md ${
                      timeInfo?.expired ? 'border-red-200 bg-red-25' : ''
                    }`}>
                      <CardContent className="p-6">
                        <div className="flex justify-between items-start mb-4">
                          <div className="flex-1">
                            <div className="flex items-center gap-3 mb-2">
                              <h3 className="text-lg font-semibold text-gray-900">{offer.title}</h3>
                              <Badge className={`${
                                offer.admin_status === 'approved' ? 'bg-green-100 text-green-700 border-green-200' :
                                offer.admin_status === 'rejected' ? 'bg-red-100 text-red-700 border-red-200' :
                                'bg-yellow-100 text-yellow-700 border-yellow-200'
                              }`}>
                                {offer.admin_status === 'approved' && <CheckCircle className="h-3 w-3 mr-1" />}
                                {offer.admin_status === 'rejected' && <XCircle className="h-3 w-3 mr-1" />}
                                {offer.admin_status === 'pending' && <Clock className="h-3 w-3 mr-1" />}
                                {offer.admin_status.charAt(0).toUpperCase() + offer.admin_status.slice(1)}
                              </Badge>
                            </div>
                            <p className="text-gray-600 mb-3">{offer.description}</p>
                            
                            <div className="flex flex-wrap gap-4 text-sm text-gray-500">
                              <span className="flex items-center gap-1">
                                <MapPin className="h-4 w-4" />
                                {offer.location.city}, {offer.location.state}
                              </span>
                              <span className="flex items-center gap-1">
                                <DollarSign className="h-4 w-4" />
                                ₹{offer.wage_info.min_amount} - ₹{offer.wage_info.max_amount} {offer.wage_info.type}
                              </span>
                              <span className="flex items-center gap-1">
                                <Calendar className="h-4 w-4" />
                                Created: {new Date(offer.created_at).toLocaleDateString()}
                              </span>
                              {offer.applications_count !== undefined && (
                                <span className="flex items-center gap-1">
                                  <Users className="h-4 w-4" />
                                  {offer.applications_count} applications
                                </span>
                              )}
                            </div>
                          </div>
                          
                          <div className="flex flex-col items-end gap-2">
                            {/* Timer for pending offers */}
                            {timeInfo && (
                              <Badge 
                                className={`${timeInfo.color} ${timeInfo.bgColor} border-0 font-medium text-xs px-3 py-1`}
                              >
                                <IconComponent className="h-3 w-3 mr-1" />
                                {timeInfo.text}
                              </Badge>
                            )}
                            
                            {/* Duration for completed reviews */}
                            {offer.admin_status !== 'pending' && offer.admin_reviewed_at && (
                              <Badge variant="outline" className="text-xs">
                                <Timer className="h-3 w-3 mr-1" />
                                {getReviewDuration(offer.submitted_for_review_at, offer.admin_reviewed_at)} review time
                              </Badge>
                            )}
                            
                            <Badge variant="secondary">
                              {offer.category}
                            </Badge>
                          </div>
                        </div>
                        
                        {/* Admin Comments */}
                        {offer.admin_comments && (
                          <div className={`mt-4 p-3 rounded-lg border ${
                            offer.admin_status === 'approved' ? 'bg-green-50 border-green-200' :
                            offer.admin_status === 'rejected' ? 'bg-red-50 border-red-200' :
                            'bg-gray-50 border-gray-200'
                          }`}>
                            <p className="text-sm font-medium text-gray-700 mb-1">Admin Feedback:</p>
                            <p className="text-sm text-gray-600">"{offer.admin_comments}"</p>
                            {offer.admin_reviewed_at && (
                              <p className="text-xs text-gray-500 mt-2">
                                Reviewed on {new Date(offer.admin_reviewed_at).toLocaleDateString()} at{' '}
                                {new Date(offer.admin_reviewed_at).toLocaleTimeString()}
                              </p>
                            )}
                          </div>
                        )}
                        
                        {/* Expired offer notice */}
                        {timeInfo?.expired && (
                          <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                            <div className="flex items-start gap-2">
                              <AlertTriangle className="h-4 w-4 text-red-600 mt-0.5" />
                              <div>
                                <p className="text-sm font-medium text-red-800">
                                  Review Deadline Exceeded
                                </p>
                                <p className="text-sm text-red-700 mt-1">
                                  This offer has exceeded the 5-day review deadline and may be automatically rejected.
                                  You can create a new offer if still needed.
                                </p>
                              </div>
                            </div>
                          </div>
                        )}
                        
                        {/* Pending offer notice */}
                        {offer.admin_status === 'pending' && !timeInfo?.expired && (
                          <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                            <div className="flex items-start gap-2">
                              <Clock className="h-4 w-4 text-blue-600 mt-0.5" />
                              <div>
                                <p className="text-sm font-medium text-blue-800">
                                  Under Review
                                </p>
                                <p className="text-sm text-blue-700 mt-1">
                                  Your offer is being reviewed by our admin team. You'll receive an email notification once reviewed.
                                </p>
                              </div>
                            </div>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  )
                })}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}