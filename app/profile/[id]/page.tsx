"use client"

import { use, useEffect, useRef, useState } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { Header } from "@/components/header"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { Calendar, MapPin, Award, TrendingUp, Heart, Users, Target, Trophy, Loader2 } from "lucide-react"
import { VerificationBadge } from "@/components/verification-badge"
import { useAuth } from "@/lib/auth-context"

interface ImpactProfileProps {
  params: Promise<{
    id: string
  }>
}

interface Activity {
  id: number
  activity_type: string
  entity_type: string
  entity_id: number
  activity_data: any
  created_at: string
}

interface UserProfile {
  id: number
  name: string
  email: string
  user_type: string
  location: string
  profile_image: string
  city: string
  created_at: string
  verification_status?: string
}

export default function ImpactProfilePage({ params }: ImpactProfileProps) {
  const { id } = use(params)
  const searchParams = useSearchParams()
  const router = useRouter()
  const { token } = useAuth()
  const [activeTab, setActiveTab] = useState(searchParams.get('tab') || 'history')
  const tabsRef = useRef<HTMLDivElement>(null)
  const fetchingRef = useRef(false)
  
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [activities, setActivities] = useState<Activity[]>([])
  const [loading, setLoading] = useState(true)
  const [statsLoading, setStatsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [stats, setStats] = useState({
    posts: 0,
    listings: 0,
    orders: 0,
    serviceRequests: 0,
    serviceOffers: 0,
    volunteeredServices: 0,
    clientProjects: 0,
    reactions: 0,
    comments: 0,
    followers: 0,
    following: 0
  })

  const handleTabChange = (value: string) => {
    setActiveTab(value)
  }

  // Update active tab when URL changes
  useEffect(() => {
    const tabFromUrl = searchParams.get('tab') || 'history'
    setActiveTab(tabFromUrl)
  }, [searchParams])

  useEffect(() => {
    const fetchProfileData = async () => {
      if (fetchingRef.current) return
      
      try {
        fetchingRef.current = true
        setLoading(true)
        setError(null)

        const headers: HeadersInit = {}
        if (token) {
          headers['Authorization'] = `Bearer ${token}`
        }

        // Fetch user profile first (critical path)
        const profileRes = await fetch(`/api/profile/${id}`)
        const profileData = await profileRes.json()

        if (!profileRes.ok || !profileData.success) {
          setError(profileData.error || 'Profile not found')
          setLoading(false)
          return
        }

        setProfile(profileData.profile)
        setLoading(false) // Show profile immediately
        setStatsLoading(true) // Stats still loading

        // Fetch all other data in parallel (non-blocking)
        const [
          postsRes,
          itemsRes,
          ordersRes,
          requestsRes,
          offersRes,
          volunteerRes,
          clientsRes,
          activitiesRes
        ] = await Promise.allSettled([
          fetch(`/api/posts?userId=${id}&limit=100`, { headers }),
          fetch(`/api/marketplace?sellerId=${id}`, { headers }),
          fetch(`/api/orders?userId=${id}`, { headers }),
          fetch(`/api/service-requests?userId=${id}`, { headers }),
          fetch(`/api/service-offers?ngoId=${id}`, { headers }),
          fetch(`/api/service-volunteers?volunteerId=${id}`, { headers }),
          fetch(`/api/service-clients?clientId=${id}`, { headers }),
          fetch(`/api/activity-feed?userId=${id}&limit=20`, { headers })
        ])

        // Parse JSON responses once and store them
        let postsData: any = null
        let itemsData: any = null
        let ordersData: any = null
        let requestsData: any = null
        let offersData: any = null
        let volunteerData: any = null
        let clientsData: any = null
        let activitiesData: any = null

        if (postsRes.status === 'fulfilled' && postsRes.value.ok) {
          postsData = await postsRes.value.json()
        }
        if (itemsRes.status === 'fulfilled' && itemsRes.value.ok) {
          itemsData = await itemsRes.value.json()
        }
        if (ordersRes.status === 'fulfilled' && ordersRes.value.ok) {
          ordersData = await ordersRes.value.json()
        }
        if (requestsRes.status === 'fulfilled' && requestsRes.value.ok) {
          requestsData = await requestsRes.value.json()
        }
        if (offersRes.status === 'fulfilled' && offersRes.value.ok) {
          offersData = await offersRes.value.json()
        }
        if (volunteerRes.status === 'fulfilled' && volunteerRes.value.ok) {
          volunteerData = await volunteerRes.value.json()
        }
        if (clientsRes.status === 'fulfilled' && clientsRes.value.ok) {
          clientsData = await clientsRes.value.json()
        }
        if (activitiesRes.status === 'fulfilled' && activitiesRes.value.ok) {
          activitiesData = await activitiesRes.value.json()
        }

        // Process activities using stored data
        let allActivities: Activity[] = []
        
        // Process posts
        if (postsData) {
          const postActivities = (postsData.data || []).map((post: any) => ({
            id: `post-${post.id}`,
            activity_type: 'post_created',
            entity_type: 'post',
            entity_id: post.id,
            activity_data: { content: post.content?.substring(0, 100) },
            created_at: post.created_at
          }))
          allActivities = [...allActivities, ...postActivities]
        }

        // Process marketplace items
        if (itemsData) {
          const itemActivities = (itemsData.items || []).map((item: any) => ({
            id: `listing-${item.id}`,
            activity_type: 'listing_created',
            entity_type: 'marketplace_item',
            entity_id: item.id,
            activity_data: { title: item.title },
            created_at: item.created_at
          }))
          allActivities = [...allActivities, ...itemActivities]
        }

        // Process orders
        if (ordersData) {
          const orderActivities = (ordersData.orders || []).map((order: any) => ({
            id: `order-${order.id}`,
            activity_type: 'order_placed',
            entity_type: 'order',
            entity_id: order.id,
            activity_data: { order_number: order.order_number },
            created_at: order.created_at
          }))
          allActivities = [...allActivities, ...orderActivities]
        }

        // Process service requests
        if (requestsData) {
          const requestActivities = (requestsData.requests || []).map((req: any) => ({
            id: `request-${req.id}`,
            activity_type: 'service_request_created',
            entity_type: 'service_request',
            entity_id: req.id,
            activity_data: { title: req.title },
            created_at: req.created_at
          }))
          allActivities = [...allActivities, ...requestActivities]
        }

        // Process activity feed
        if (activitiesData && activitiesData.success && activitiesData.activities) {
          allActivities = [...allActivities, ...activitiesData.activities]
        }

        // Sort and set activities
        allActivities.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        setActivities(allActivities.slice(0, 20))

        // Calculate stats from stored parsed data
        const newStats = {
          posts: postsData?.data?.length || 0,
          listings: itemsData?.items?.length || 0,
          orders: ordersData?.orders?.length || 0,
          serviceRequests: requestsData?.requests?.length || 0,
          serviceOffers: offersData?.offers?.length || offersData?.data?.length || 0,
          volunteeredServices: volunteerData?.volunteers?.length || volunteerData?.data?.length || 0,
          clientProjects: clientsData?.clients?.length || clientsData?.data?.length || 0,
          reactions: 0,
          comments: 0,
          followers: 0,
          following: 0
        }

        setStats(newStats)
        setStatsLoading(false)

      } catch (err: any) {
        console.error('Profile fetch error:', err)
        setError(err.message || 'Failed to load profile')
        setLoading(false)
        setStatsLoading(false)
      } finally {
        fetchingRef.current = false
      }
    }

    if (id) {
      fetchProfileData()
    }
  }, [id])

  useEffect(() => {
    if (searchParams.get('tab') && tabsRef.current) {
      setTimeout(() => {
        tabsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }, 100)
    }
  }, [searchParams])

  const getInitials = (name: string) => {
    if (!name) return "U"
    return name.split(' ').map(n => n[0]).join('').toUpperCase()
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
  }

  const formatActivityDate = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }

  if (loading) {
    return (
      <>
        <Header />
        <div className="container mx-auto px-4 py-8">
          <Card className="mb-8">
            <CardContent className="pt-6">
              <div className="flex flex-col md:flex-row gap-6">
                {/* Avatar Skeleton */}
                <div className="h-32 w-32 rounded-full bg-white animate-pulse" />
                
                <div className="flex-1 space-y-4">
                  {/* Name and badges skeleton */}
                  <div className="space-y-2">
                    <div className="h-9 w-64 bg-white rounded animate-pulse" />
                    <div className="flex gap-4">
                      <div className="h-4 w-32 bg-white rounded animate-pulse" />
                      <div className="h-4 w-40 bg-white rounded animate-pulse" />
                    </div>
                    <div className="h-6 w-24 bg-white rounded-full animate-pulse" />
                  </div>
                  
                  {/* Stats skeleton */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
                    {[1, 2, 3, 4].map((i) => (
                      <div key={i} className="p-3 bg-white rounded-lg border border-gray-200">
                        <div className="h-8 w-16 bg-white rounded animate-pulse mx-auto mb-2" />
                        <div className="h-4 w-20 bg-white rounded animate-pulse mx-auto" />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Tabs skeleton */}
          <div className="space-y-6">
            <div className="flex gap-2 border-b">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-10 w-32 bg-white rounded-t animate-pulse" />
              ))}
            </div>
            
            {/* Content skeleton */}
            <Card>
              <CardHeader>
                <div className="h-6 w-48 bg-white rounded animate-pulse" />
              </CardHeader>
              <CardContent className="space-y-4">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="p-4 border rounded-lg space-y-3">
                    <div className="flex gap-4">
                      <div className="h-12 w-12 rounded-full bg-white animate-pulse" />
                      <div className="flex-1 space-y-2">
                        <div className="h-4 w-3/4 bg-white rounded animate-pulse" />
                        <div className="h-4 w-1/2 bg-white rounded animate-pulse" />
                      </div>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </div>
      </>
    )
  }

  if (error || !profile) {
    return (
      <>
        <Header />
        <div className="container mx-auto px-4 py-8">
          <Card>
            <CardContent className="pt-6 text-center py-12">
              <p className="text-red-600 mb-4">{error || 'Profile not found'}</p>
              <Button onClick={() => window.history.back()}>Go Back</Button>
            </CardContent>
          </Card>
        </div>
      </>
    )
  }


  return (
    <>
      <Header />
      <div className="container mx-auto px-4 py-8">
        <Card className="mb-8">
          <CardContent className="pt-6">
            <div className="flex flex-col md:flex-row gap-6">
              <Avatar className="h-32 w-32">
                <AvatarImage src={profile.profile_image} />
                <AvatarFallback className="text-3xl bg-blue-600 text-white">
                  {getInitials(profile.name)}
                </AvatarFallback>
              </Avatar>
            
            <div className="flex-1">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <h1 className="text-3xl font-bold text-gray-900">
                      {profile.name}
                    </h1>
                    {profile.verification_status === 'verified' && (
                      <VerificationBadge status="verified" size="md" showText={false} />
                    )}
                  </div>
                  <div className="flex items-center gap-4 text-gray-600 text-sm mb-2">
                    {(profile.city || profile.location) && (
                      <span className="flex items-center gap-1">
                        <MapPin className="h-4 w-4" />
                        {profile.city || profile.location}
                      </span>
                    )}
                    <span className="flex items-center gap-1">
                      <Calendar className="h-4 w-4" />
                      Joined {formatDate(profile.created_at)}
                    </span>
                  </div>
                  <Badge variant="outline" className="capitalize">{profile.user_type}</Badge>
                </div>
              </div>
              
              {statsLoading ? (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
                  {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="text-center p-3 bg-white rounded-lg border border-gray-300 animate-pulse">
                      <div className="h-8 w-16 bg-gray-200 rounded mx-auto mb-2" />
                      <div className="h-4 w-20 bg-gray-200 rounded mx-auto" />
                    </div>
                  ))}
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
                    <div className="text-center p-3 bg-white rounded-lg border border-gray-700">
                      <p className="text-2xl font-bold text-orange-500">{stats.posts}</p>
                      <p className="text-sm text-gray-900">Posts</p>
                    </div>
                    <div className="text-center p-3 bg-white rounded-lg border border-gray-700">
                      <p className="text-2xl font-bold text-orange-500">{stats.listings}</p>
                      <p className="text-sm text-gray-900">Listings</p>
                    </div>
                    <div className="text-center p-3 bg-white rounded-lg border border-gray-700">
                      <p className="text-2xl font-bold text-orange-500">{stats.orders}</p>
                      <p className="text-sm text-gray-900">Orders</p>
                    </div>
                    <div className="text-center p-3 bg-white rounded-lg border border-gray-700">
                      <p className="text-2xl font-bold text-orange-500">{stats.volunteeredServices}</p>
                      <p className="text-sm text-gray-900">Volunteered</p>
                    </div>
                  </div>

                  {/* Additional Stats Row for NGOs/Companies */}
                  {(stats.serviceRequests > 0 || stats.serviceOffers > 0 || stats.volunteeredServices > 0) && (
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mt-4">
                      {stats.serviceRequests > 0 && (
                        <div className="text-center p-3 bg-white rounded-lg border border-gray-700">
                          <p className="text-2xl font-bold text-orange-500">{stats.serviceRequests}</p>
                          <p className="text-sm text-gray-900">Service Requests</p>
                        </div>
                      )}
                      {stats.serviceOffers > 0 && (
                        <div className="text-center p-3 bg-white rounded-lg border border-gray-700">
                          <p className="text-2xl font-bold text-orange-500">{stats.serviceOffers}</p>
                          <p className="text-sm text-gray-900">Service Offers</p>
                        </div>
                      )}
                      {stats.volunteeredServices > 0 && (
                        <div className="text-center p-3 bg-white rounded-lg border border-gray-700">
                          <p className="text-2xl font-bold text-orange-500">{stats.volunteeredServices}</p>
                          <p className="text-sm text-gray-900">Volunteered</p>
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <div ref={tabsRef}>
        <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-6">
          <TabsList className="grid w-full grid-cols-2 md:grid-cols-4 gap-2 mb-8 bg-white p-2 rounded-lg h-auto">
            <TabsTrigger value="history" className="text-xs sm:text-sm font-semibold data-[state=active]:bg-white data-[state=active]:text-gray-900 data-[state=active]:shadow-sm text-gray-700 py-3 px-2 rounded-md border border-gray-300">Recent Activity</TabsTrigger>
            <TabsTrigger value="achievements" className="text-xs sm:text-sm font-semibold data-[state=active]:bg-white data-[state=active]:text-gray-900 data-[state=active]:shadow-sm text-gray-700 py-3 px-2 rounded-md border border-gray-300">Achievements</TabsTrigger>
            <TabsTrigger value="impact" className="text-xs sm:text-sm font-semibold data-[state=active]:bg-white data-[state=active]:text-gray-900 data-[state=active]:shadow-sm text-gray-700 py-3 px-2 rounded-md border border-gray-300">Impact Metrics</TabsTrigger>
            <TabsTrigger value="stats" className="text-xs sm:text-sm font-semibold data-[state=active]:bg-white data-[state=active]:text-gray-900 data-[state=active]:shadow-sm text-gray-700 py-3 px-2 rounded-md border border-gray-300">Statistics</TabsTrigger>
          </TabsList>

        <TabsContent value="history">
          <Card>
            <CardHeader>
              <CardTitle>Recent Activity</CardTitle>
            </CardHeader>
            <CardContent>
              {statsLoading ? (
                <div className="space-y-4">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="p-4 border rounded-lg space-y-3 animate-pulse">
                      <div className="flex gap-4">
                        <div className="h-12 w-12 rounded-full bg-gray-200" />
                        <div className="flex-1 space-y-2">
                          <div className="h-4 w-3/4 bg-gray-200 rounded" />
                          <div className="h-4 w-1/2 bg-gray-200 rounded" />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : activities.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  <Users className="h-12 w-12 mx-auto mb-3 text-gray-400" />
                  <p className="text-sm">No activity yet</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {activities.map((activity) => {
                    const activityType = activity.activity_type.replace(/_/g, ' ')
                    const icon = activity.activity_type.includes('post') ? Heart :
                                activity.activity_type.includes('listing') ? Target :
                                activity.activity_type.includes('order') ? Trophy :
                                activity.activity_type.includes('service') ? Users :
                                Award
                    
                    const bgColor = 'bg-orange-500'

                    const borderColor = 'border-gray-700'

                    const hoverBgColor = 'hover:bg-gray-800'

                    const IconComponent = icon

                    // Generate detailed description based on activity type
                    let detailedDescription = ''
                    if (activity.activity_type === 'post_created') {
                      detailedDescription = 'Created a new post on the platform'
                    } else if (activity.activity_type === 'listing_created') {
                      detailedDescription = 'Listed a new product in the marketplace'
                    } else if (activity.activity_type === 'order_placed') {
                      detailedDescription = 'Placed an order for a marketplace item'
                    } else if (activity.activity_type === 'service_request_created') {
                      detailedDescription = 'Created a new service request'
                    } else if (activity.activity_type === 'profile_update') {
                      detailedDescription = 'Updated profile information'
                    } else {
                      detailedDescription = 'Performed an activity on the platform'
                    }

                    return (
                      <div 
                        key={activity.id} 
                        className={`group flex flex-col sm:flex-row gap-4 p-4 sm:p-5 border-2 ${borderColor} rounded-xl bg-white transition-all duration-200 hover:shadow-md`}
                      >
                        <div className="flex-shrink-0">
                          <Avatar className="h-12 w-12 border-2 border-gray-700 shadow-sm">
                            <AvatarImage src={profile.profile_image} />
                            <AvatarFallback className={`${bgColor} text-white font-semibold`}>
                              {getInitials(profile.name)}
                            </AvatarFallback>
                          </Avatar>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 mb-2">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <h4 className="font-semibold text-orange-500 break-words">{profile.name}</h4>
                                {profile.verification_status === 'verified' && (
                                  <VerificationBadge status="verified" size="sm" showText={false} />
                                )}
                              </div>
                              <p className="text-sm text-gray-900 break-words">{detailedDescription}</p>
                            </div>
                            <span className="text-sm text-gray-600 whitespace-nowrap self-start sm:self-auto">{formatActivityDate(activity.created_at)}</span>
                          </div>
                          
                          {/* Activity Details Card */}
                          <div className="sm:ml-0 mt-3 p-4 bg-white rounded-lg border border-gray-600">
                            {activity.activity_data?.title && (
                              <p className="text-base text-gray-900 font-semibold mb-2 break-words">{activity.activity_data.title}</p>
                            )}
                            {activity.activity_data?.content && (
                              <p className="text-sm text-gray-800 mb-3 line-clamp-3 leading-relaxed break-words">{activity.activity_data.content}</p>
                            )}
                            
                            {/* Activity metadata */}
                            <div className="flex items-center gap-2 sm:gap-3 flex-wrap mt-3">
                              <Badge variant="secondary" className="text-xs font-medium capitalize bg-white text-gray-900">
                                {activity.entity_type.replace(/_/g, ' ')}
                              </Badge>
                              <span className="text-xs text-gray-600">
                                ID: #{activity.entity_id}
                              </span>
                              {activity.activity_type === 'post_created' && (
                                <Badge variant="outline" className="text-xs border-gray-500 font-medium text-orange-500">
                                  Text Post
                                </Badge>
                              )}
                              {activity.activity_type === 'listing_created' && (
                                <Badge variant="outline" className="text-xs border-gray-500 font-medium text-orange-500">
                                  Marketplace Listing
                                </Badge>
                              )}
                              {activity.activity_type === 'order_placed' && (
                                <Badge variant="outline" className="text-xs border-gray-500 font-medium text-orange-500">
                                  Purchase Order
                                </Badge>
                              )}
                              {activity.activity_type === 'service_request_created' && (
                                <Badge variant="outline" className="text-xs border-gray-500 font-medium text-orange-500">
                                  Service Request
                                </Badge>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="achievements">
          <Card>
            <CardHeader>
              <CardTitle>
                Achievements & Badges
              </CardTitle>
            </CardHeader>
            <CardContent>
              {statsLoading ? (
                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="p-4 border-2 border-gray-300 rounded-xl bg-white animate-pulse">
                      <div className="flex flex-col items-center text-center space-y-3">
                        <div className="h-6 w-32 bg-gray-200 rounded" />
                        <div className="h-4 w-40 bg-gray-200 rounded" />
                        <div className="h-6 w-24 bg-gray-200 rounded-full" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
              <>
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                {/* Achievement Cards */}
                {stats.posts >= 5 && (
                  <div className="p-4 border-2 border-gray-700 rounded-xl bg-white hover:shadow-lg transition-shadow">
                    <div className="flex flex-col items-center text-center">
                      <h3 className="font-bold text-orange-500 mb-1">Content Creator</h3>
                      <p className="text-sm text-gray-900 mb-2">Created {stats.posts} posts</p>
                      <Badge variant="secondary" className="bg-orange-500 text-white border-0">
                        Active Contributor
                      </Badge>
                    </div>
                  </div>
                )}

                {stats.volunteeredServices >= 3 && (
                  <div className="p-4 border-2 border-gray-700 rounded-xl bg-white hover:shadow-lg transition-shadow">
                    <div className="flex flex-col items-center text-center">
                      <h3 className="font-bold text-orange-500 mb-1">Volunteer Hero</h3>
                      <p className="text-sm text-gray-900 mb-2">Volunteered for {stats.volunteeredServices} services</p>
                      <Badge variant="secondary" className="bg-orange-500 text-white border-0">
                        Community Helper
                      </Badge>
                    </div>
                  </div>
                )}

                {stats.listings >= 5 && (
                  <div className="p-4 border-2 border-gray-700 rounded-xl bg-white hover:shadow-lg transition-shadow">
                    <div className="flex flex-col items-center text-center">
                      <h3 className="font-bold text-orange-500 mb-1">Marketplace Seller</h3>
                      <p className="text-sm text-gray-900 mb-2">Listed {stats.listings} items</p>
                      <Badge variant="secondary" className="bg-orange-500 text-white border-0">
                        Active Seller
                      </Badge>
                    </div>
                  </div>
                )}

                {stats.orders >= 5 && (
                  <div className="p-4 border-2 border-gray-700 rounded-xl bg-white hover:shadow-lg transition-shadow">
                    <div className="flex flex-col items-center text-center">
                      <h3 className="font-bold text-orange-500 mb-1">Frequent Buyer</h3>
                      <p className="text-sm text-gray-900 mb-2">Placed {stats.orders} orders</p>
                      <Badge variant="secondary" className="bg-orange-500 text-white border-0">
                        Supportive Buyer
                      </Badge>
                    </div>
                  </div>
                )}

                {stats.serviceRequests >= 3 && (
                  <div className="p-4 border-2 border-gray-700 rounded-xl bg-white hover:shadow-lg transition-shadow">
                    <div className="flex flex-col items-center text-center">
                      <h3 className="font-bold text-orange-500 mb-1">Opportunity Creator</h3>
                      <p className="text-sm text-gray-900 mb-2">Created {stats.serviceRequests} service requests</p>
                      <Badge variant="secondary" className="bg-orange-500 text-white border-0">
                        NGO Leader
                      </Badge>
                    </div>
                  </div>
                )}

                {stats.serviceOffers >= 3 && (
                  <div className="p-4 border-2 border-gray-700 rounded-xl bg-white hover:shadow-lg transition-shadow">
                    <div className="flex flex-col items-center text-center">
                      <h3 className="font-bold text-orange-500 mb-1">Service Provider</h3>
                      <p className="text-sm text-gray-900 mb-2">Offered {stats.serviceOffers} professional services</p>
                      <Badge variant="secondary" className="bg-orange-500 text-white border-0">
                        NGO Professional
                      </Badge>
                    </div>
                  </div>
                )}

                {profile.verification_status === 'verified' && (
                  <div className="p-4 border-2 border-gray-700 rounded-xl bg-white hover:shadow-lg transition-shadow">
                    <div className="flex flex-col items-center text-center">
                      <h3 className="font-bold text-orange-500 mb-1">Verified Member</h3>
                      <p className="text-sm text-gray-900 mb-2">Successfully verified account</p>
                      <Badge variant="secondary" className="bg-orange-500 text-white border-0">
                        Trusted User
                      </Badge>
                    </div>
                  </div>
                )}
              </div>

              {/* No achievements message */}
              {stats.posts < 5 && stats.volunteeredServices < 3 && stats.listings < 5 && 
               stats.orders < 5 && stats.serviceRequests < 3 && stats.serviceOffers < 3 && 
               profile.verification_status !== 'verified' && (
                <div className="text-center py-12 text-gray-500">
                  <Trophy className="h-12 w-12 mx-auto mb-3 text-gray-400" />
                  <p className="text-sm">No achievements earned yet</p>
                  <p className="text-xs mt-2 text-gray-400">Start contributing to earn badges and milestones</p>
                </div>
              )}
              </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="impact">
          <Card>
            <CardHeader>
              <CardTitle>
                <span className="text-gray-900">
                  Impact Metrics
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {statsLoading ? (
                <div className="space-y-6">
                  <div className="p-6 bg-white rounded-xl border-2 border-gray-300 animate-pulse">
                    <div className="text-center space-y-3">
                      <div className="h-4 w-32 bg-gray-200 rounded mx-auto" />
                      <div className="h-16 w-24 bg-gray-200 rounded mx-auto" />
                      <div className="h-3 w-48 bg-gray-200 rounded mx-auto" />
                    </div>
                  </div>
                  <div className="grid md:grid-cols-2 gap-4">
                    {[1, 2, 3, 4, 5, 6].map((i) => (
                      <div key={i} className="p-4 bg-white rounded-lg border border-gray-300 animate-pulse">
                        <div className="space-y-3">
                          <div className="flex items-center justify-between">
                            <div className="h-4 w-32 bg-gray-200 rounded" />
                            <div className="h-8 w-16 bg-gray-200 rounded" />
                          </div>
                          <div className="h-2 bg-gray-200 rounded-full" />
                          <div className="h-3 w-24 bg-gray-200 rounded" />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
              <div className="space-y-6">
                {/* Overall Impact Score */}
                <div className="p-6 bg-white rounded-xl border-2 border-gray-700">
                  <div className="text-center">
                    <h3 className="text-sm font-medium text-gray-700 mb-2">Overall Impact Score</h3>
                    <p className="text-5xl font-bold text-orange-500 mb-2">
                      {(stats.posts * 1) + (stats.volunteeredServices * 10) + (stats.serviceRequests * 5) + (stats.serviceOffers * 8) + (stats.listings * 1) + (stats.orders * 2)}
                    </p>
                    <p className="text-sm text-gray-600">Points earned from all activities</p>
                  </div>
                </div>

                {/* Detailed Impact Breakdown */}
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="p-4 bg-white rounded-lg border border-gray-700">
                    <div className="flex items-center justify-between mb-3">
                      <span className="font-medium text-gray-900">Social Engagement</span>
                      <span className="text-2xl font-bold text-orange-500">{stats.posts * 1}</span>
                    </div>
                    <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-orange-500 rounded-full transition-all" 
                        style={{ width: `${Math.min((stats.posts / 100) * 100, 100)}%` }}
                      />
                    </div>
                    <p className="text-xs text-gray-600 mt-2">{stats.posts} posts × 1 point</p>
                  </div>

                  <div className="p-4 bg-white rounded-lg border border-gray-700">
                    <div className="flex items-center justify-between mb-3">
                      <span className="font-medium text-gray-900">Volunteer Impact</span>
                      <span className="text-2xl font-bold text-orange-500">{stats.volunteeredServices * 10}</span>
                    </div>
                    <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-orange-500 rounded-full transition-all" 
                        style={{ width: `${Math.min((stats.volunteeredServices / 10) * 100, 100)}%` }}
                      />
                    </div>
                    <p className="text-xs text-gray-600 mt-2">{stats.volunteeredServices} services × 10 points</p>
                  </div>

                  <div className="p-4 bg-white rounded-lg border border-gray-700">
                    <div className="flex items-center justify-between mb-3">
                      <span className="font-medium text-gray-900">Service Requests</span>
                      <span className="text-2xl font-bold text-orange-500">{stats.serviceRequests * 5}</span>
                    </div>
                    <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-orange-500 rounded-full transition-all" 
                        style={{ width: `${Math.min((stats.serviceRequests / 10) * 100, 100)}%` }}
                      />
                    </div>
                    <p className="text-xs text-gray-600 mt-2">{stats.serviceRequests} requests × 5 points</p>
                  </div>

                  <div className="p-4 bg-white rounded-lg border border-gray-700">
                    <div className="flex items-center justify-between mb-3">
                      <span className="font-medium text-gray-900">Service Offers</span>
                      <span className="text-2xl font-bold text-orange-500">{stats.serviceOffers * 8}</span>
                    </div>
                    <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-orange-500 rounded-full transition-all" 
                        style={{ width: `${Math.min((stats.serviceOffers / 10) * 100, 100)}%` }}
                      />
                    </div>
                    <p className="text-xs text-gray-600 mt-2">{stats.serviceOffers} offers × 8 points</p>
                  </div>

                  <div className="p-4 bg-white rounded-lg border border-gray-700">
                    <div className="flex items-center justify-between mb-3">
                      <span className="font-medium text-gray-900">Marketplace Activity</span>
                      <span className="text-2xl font-bold text-orange-500">{stats.listings * 1}</span>
                    </div>
                    <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-orange-500 rounded-full transition-all" 
                        style={{ width: `${Math.min((stats.listings / 100) * 100, 100)}%` }}
                      />
                    </div>
                    <p className="text-xs text-gray-600 mt-2">{stats.listings} listings × 1 point</p>
                  </div>

                  <div className="p-4 bg-white rounded-lg border border-gray-700">
                    <div className="flex items-center justify-between mb-3">
                      <span className="font-medium text-gray-900">Community Support</span>
                      <span className="text-2xl font-bold text-orange-500">{stats.orders * 2}</span>
                    </div>
                    <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-orange-500 rounded-full transition-all" 
                        style={{ width: `${Math.min((stats.orders / 50) * 100, 100)}%` }}
                      />
                    </div>
                    <p className="text-xs text-gray-600 mt-2">{stats.orders} orders × 2 points</p>
                  </div>
                </div>

                {/* Impact Summary */}
                <div className="p-4 bg-white rounded-lg border border-gray-700">
                  <h4 className="font-medium text-orange-500 mb-3">Your Impact Summary</h4>
                  <div className="space-y-2 text-sm text-gray-700">
                    {stats.posts > 0 && (
                      <p>✓ Shared <span className="font-semibold text-orange-500">{stats.posts}</span> posts to engage the community</p>
                    )}
                    {stats.volunteeredServices > 0 && (
                      <p>✓ Volunteered for <span className="font-semibold text-orange-500">{stats.volunteeredServices}</span> service opportunities</p>
                    )}
                    {stats.serviceRequests > 0 && (
                      <p>✓ Created <span className="font-semibold text-orange-500">{stats.serviceRequests}</span> opportunities for volunteers</p>
                    )}
                    {stats.serviceOffers > 0 && (
                      <p>✓ Offered <span className="font-semibold text-orange-500">{stats.serviceOffers}</span> professional services</p>
                    )}
                    {stats.listings > 0 && (
                      <p>✓ Listed <span className="font-semibold text-orange-500">{stats.listings}</span> items in the marketplace</p>
                    )}
                    {stats.orders > 0 && (
                      <p>✓ Supported the community with <span className="font-semibold text-orange-500">{stats.orders}</span> purchases</p>
                    )}
                    {stats.posts === 0 && stats.volunteeredServices === 0 && stats.serviceRequests === 0 && 
                     stats.serviceOffers === 0 && stats.listings === 0 && stats.orders === 0 && (
                      <p className="text-gray-500 italic">No impact activities yet. Start contributing to see your impact grow!</p>
                    )}
                  </div>
                </div>
              </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="stats">
          {statsLoading ? (
            <div className="grid md:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle>Platform Engagement</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-6 animate-pulse">
                    {[1, 2, 3, 4].map((i) => (
                      <div key={i} className="flex items-center justify-between py-2 border-b border-gray-300">
                        <div className="h-4 w-32 bg-gray-200 rounded" />
                        <div className="h-8 w-16 bg-gray-200 rounded" />
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>Profile Information</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4 animate-pulse">
                    {[1, 2, 3, 4].map((i) => (
                      <div key={i} className="space-y-2">
                        <div className="h-3 w-24 bg-gray-200 rounded" />
                        <div className="h-4 w-40 bg-gray-200 rounded" />
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          ) : (
          <div className="grid md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Platform Engagement</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-6">
                  <div className="flex items-center justify-between py-2 border-b border-gray-700">
                    <span className="text-gray-900">Posts Created</span>
                    <span className="text-2xl font-bold text-orange-500">{stats.posts}</span>
                  </div>
                  <div className="flex items-center justify-between py-2 border-b border-gray-700">
                    <span className="text-gray-900">Marketplace Listings</span>
                    <span className="text-2xl font-bold text-orange-500">{stats.listings}</span>
                  </div>
                  <div className="flex items-center justify-between py-2 border-b border-gray-700">
                    <span className="text-gray-900">Orders Placed</span>
                    <span className="text-2xl font-bold text-orange-500">{stats.orders}</span>
                  </div>
                  {stats.serviceRequests > 0 && (
                    <div className="flex items-center justify-between py-2 border-b border-gray-700">
                      <span className="text-gray-900">Service Requests</span>
                      <span className="text-2xl font-bold text-orange-500">{stats.serviceRequests}</span>
                    </div>
                  )}
                  {stats.serviceOffers > 0 && (
                    <div className="flex items-center justify-between py-2 border-b border-gray-700">
                      <span className="text-gray-900">Service Offers</span>
                      <span className="text-2xl font-bold text-orange-500">{stats.serviceOffers}</span>
                    </div>
                  )}
                  {stats.volunteeredServices > 0 && (
                    <div className="flex items-center justify-between py-2 border-b border-gray-700">
                      <span className="text-gray-900">Volunteered Services</span>
                      <span className="text-2xl font-bold text-orange-500">{stats.volunteeredServices}</span>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Profile Information</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div>
                    <p className="text-sm text-gray-500 mb-1">User Type</p>
                    <p className="font-medium capitalize">{profile.user_type}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500 mb-1">Email</p>
                    <p className="font-medium">{profile.email}</p>
                  </div>
                  {(profile.city || profile.location) && (
                    <div>
                      <p className="text-sm text-gray-500 mb-1">Location</p>
                      <p className="font-medium">{profile.city || profile.location}</p>
                    </div>
                  )}
                  <div>
                    <p className="text-sm text-gray-500 mb-1">Member Since</p>
                    <p className="font-medium">{formatDate(profile.created_at)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500 mb-1">Verification Status</p>
                    <div className="flex items-center gap-2">
                      {profile.verification_status && profile.verification_status !== 'unverified' ? (
                        <VerificationBadge 
                          status={profile.verification_status as any} 
                          size="sm" 
                        />
                      ) : (
                        <Badge variant="outline" className="text-gray-600">
                          Unverified
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
          )}
        </TabsContent>
      </Tabs>
      </div>
    </div>
    </>
  )
}
