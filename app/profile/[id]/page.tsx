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
  
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [activities, setActivities] = useState<Activity[]>([])
  const [loading, setLoading] = useState(true)
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

  useEffect(() => {
    const fetchProfileData = async () => {
      try {
        setLoading(true)
        setError(null)

        // Fetch user profile
        const profileRes = await fetch(`/api/profile/${id}`)
        const profileData = await profileRes.json()

        if (!profileRes.ok || !profileData.success) {
          setError(profileData.error || 'Profile not found')
          setLoading(false)
          return
        }

        setProfile(profileData.profile)

        // Fetch real activities from multiple sources
        let allActivities: Activity[] = []

        const headers: HeadersInit = {}
        if (token) {
          headers['Authorization'] = `Bearer ${token}`
        }

        // Get posts
        try {
          const postsRes = await fetch(`/api/posts?userId=${id}&limit=100`, { headers })
          if (postsRes.ok) {
            const postsData = await postsRes.json()
            console.log('Posts data:', postsData)
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
        } catch (err) {
          console.log('Could not fetch posts for activity', err)
        }

        // Get marketplace items
        try {
          const itemsRes = await fetch(`/api/marketplace?sellerId=${id}`, { headers })
          if (itemsRes.ok) {
            const itemsData = await itemsRes.json()
            console.log('Marketplace data:', itemsData)
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
        } catch (err) {
          console.log('Could not fetch marketplace items for activity', err)
        }

        // Get orders
        try {
          const ordersRes = await fetch(`/api/orders?userId=${id}`, { headers })
          if (ordersRes.ok) {
            const ordersData = await ordersRes.json()
            console.log('Orders data:', ordersData)
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
        } catch (err) {
          console.log('Could not fetch orders for activity', err)
        }

        // Get service requests
        try {
          const requestsRes = await fetch(`/api/service-requests?userId=${id}`, { headers })
          if (requestsRes.ok) {
            const requestsData = await requestsRes.json()
            console.log('Service requests data:', requestsData)
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
        } catch (err) {
          console.log('Could not fetch service requests for activity', err)
        }

        // Get activity feed (for profile updates, etc.)
        try {
          const activitiesRes = await fetch(`/api/activity-feed?userId=${id}&limit=20`)
          if (activitiesRes.ok) {
            const activitiesData = await activitiesRes.json()
            console.log('Activity feed data:', activitiesData)
            if (activitiesData.success && activitiesData.activities) {
              allActivities = [...allActivities, ...activitiesData.activities]
            }
          }
        } catch (err) {
          console.log('Could not fetch activities', err)
        }

        console.log('Total activities collected:', allActivities.length)

        // Sort all activities by date (most recent first)
        allActivities.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        
        // Take only the most recent 20
        setActivities(allActivities.slice(0, 20))

        // Fetch user stats - handle each independently
        let newStats = {
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
        }

        // Count posts
        try {
          const postsRes = await fetch(`/api/posts?userId=${id}`)
          if (postsRes.ok) {
            const postsData = await postsRes.json()
            newStats.posts = postsData.data?.length || 0
          }
        } catch (err) {
          console.log('Could not fetch posts')
        }

        // Count marketplace listings
        try {
          const listingsRes = await fetch(`/api/marketplace?sellerId=${id}`)
          if (listingsRes.ok) {
            const listingsData = await listingsRes.json()
            newStats.listings = listingsData.items?.length || 0
          }
        } catch (err) {
          console.log('Could not fetch listings')
        }

        // Count orders (as buyer)
        try {
          const ordersRes = await fetch(`/api/orders?userId=${id}`)
          if (ordersRes.ok) {
            const ordersData = await ordersRes.json()
            newStats.orders = ordersData.orders?.length || 0
          }
        } catch (err) {
          console.log('Could not fetch orders')
        }

        // Count service requests (for NGOs)
        try {
          const requestsRes = await fetch(`/api/service-requests?userId=${id}`)
          if (requestsRes.ok) {
            const requestsData = await requestsRes.json()
            newStats.serviceRequests = requestsData.requests?.length || 0
          }
        } catch (err) {
          console.log('Could not fetch service requests')
        }

        // Count service offers (for NGOs)
        try {
          const offersRes = await fetch(`/api/service-offers?ngoId=${id}`)
          if (offersRes.ok) {
            const offersData = await offersRes.json()
            newStats.serviceOffers = offersData.offers?.length || offersData.data?.length || 0
          }
        } catch (err) {
          console.log('Could not fetch service offers')
        }

        // Count volunteered services
        try {
          const volunteerRes = await fetch(`/api/service-volunteers?volunteerId=${id}`)
          if (volunteerRes.ok) {
            const volunteerData = await volunteerRes.json()
            newStats.volunteeredServices = volunteerData.volunteers?.length || volunteerData.data?.length || 0
          }
        } catch (err) {
          console.log('Could not fetch volunteer services')
        }

        // Count client projects
        try {
          const clientsRes = await fetch(`/api/service-clients?clientId=${id}`)
          if (clientsRes.ok) {
            const clientsData = await clientsRes.json()
            newStats.clientProjects = clientsData.clients?.length || clientsData.data?.length || 0
          }
        } catch (err) {
          console.log('Could not fetch client projects')
        }

        setStats(newStats)

      } catch (err: any) {
        console.error('Profile fetch error:', err)
        setError(err.message || 'Failed to load profile')
      } finally {
        setLoading(false)
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
        <div className="container mx-auto px-4 py-8 flex items-center justify-center min-h-[60vh]">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
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
              
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
                <div className="text-center p-3 bg-blue-50 rounded-lg border border-blue-100">
                  <p className="text-2xl font-bold text-blue-700">{stats.posts}</p>
                  <p className="text-sm text-gray-600">Posts</p>
                </div>
                <div className="text-center p-3 bg-green-50 rounded-lg border border-green-100">
                  <p className="text-2xl font-bold text-green-700">{stats.listings}</p>
                  <p className="text-sm text-gray-600">Listings</p>
                </div>
                <div className="text-center p-3 bg-purple-50 rounded-lg border border-purple-100">
                  <p className="text-2xl font-bold text-purple-700">{stats.orders}</p>
                  <p className="text-sm text-gray-600">Orders</p>
                </div>
                <div className="text-center p-3 bg-orange-50 rounded-lg border border-orange-100">
                  <p className="text-2xl font-bold text-orange-700">{stats.followers}</p>
                  <p className="text-sm text-gray-600">Followers</p>
                </div>
              </div>

              {/* Additional Stats Row for NGOs/Companies */}
              {(stats.serviceRequests > 0 || stats.serviceOffers > 0 || stats.volunteeredServices > 0) && (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mt-4">
                  {stats.serviceRequests > 0 && (
                    <div className="text-center p-3 bg-indigo-50 rounded-lg border border-indigo-100">
                      <p className="text-2xl font-bold text-indigo-700">{stats.serviceRequests}</p>
                      <p className="text-sm text-gray-600">Service Requests</p>
                    </div>
                  )}
                  {stats.serviceOffers > 0 && (
                    <div className="text-center p-3 bg-teal-50 rounded-lg border border-teal-100">
                      <p className="text-2xl font-bold text-teal-700">{stats.serviceOffers}</p>
                      <p className="text-sm text-gray-600">Service Offers</p>
                    </div>
                  )}
                  {stats.volunteeredServices > 0 && (
                    <div className="text-center p-3 bg-rose-50 rounded-lg border border-rose-100">
                      <p className="text-2xl font-bold text-rose-700">{stats.volunteeredServices}</p>
                      <p className="text-sm text-gray-600">Volunteered</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <div ref={tabsRef}>
        <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-6">
          <TabsList className="grid w-full md:w-[600px] grid-cols-2">
            <TabsTrigger value="history">Activity History</TabsTrigger>
            <TabsTrigger value="stats">Statistics</TabsTrigger>
          </TabsList>

        <TabsContent value="history">
          <Card>
            <CardHeader>
              <CardTitle>Recent Activity</CardTitle>
            </CardHeader>
            <CardContent>
              {activities.length === 0 ? (
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
                    
                    const bgColor = activity.activity_type.includes('post') ? 'bg-blue-600' :
                                   activity.activity_type.includes('listing') ? 'bg-green-600' :
                                   activity.activity_type.includes('order') ? 'bg-purple-600' :
                                   activity.activity_type.includes('service') ? 'bg-orange-600' :
                                   'bg-gray-600'

                    const borderColor = activity.activity_type.includes('post') ? 'border-blue-200' :
                                       activity.activity_type.includes('listing') ? 'border-green-200' :
                                       activity.activity_type.includes('order') ? 'border-purple-200' :
                                       activity.activity_type.includes('service') ? 'border-orange-200' :
                                       'border-gray-200'

                    const hoverBgColor = activity.activity_type.includes('post') ? 'hover:bg-blue-50' :
                                        activity.activity_type.includes('listing') ? 'hover:bg-green-50' :
                                        activity.activity_type.includes('order') ? 'hover:bg-purple-50' :
                                        activity.activity_type.includes('service') ? 'hover:bg-orange-50' :
                                        'hover:bg-gray-50'

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
                        className={`group flex gap-4 p-5 border-2 ${borderColor} rounded-xl ${hoverBgColor} transition-all duration-200 hover:shadow-md`}
                      >
                        <div className="flex-shrink-0">
                          <Avatar className="h-12 w-12 border-2 border-white shadow-sm">
                            <AvatarImage src={profile.profile_image} />
                            <AvatarFallback className={`${bgColor} text-white font-semibold`}>
                              {getInitials(profile.name)}
                            </AvatarFallback>
                          </Avatar>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-3 mb-2">
                            <div className={`h-10 w-10 rounded-full flex items-center justify-center ${bgColor} shadow-sm`}>
                              <IconComponent className="h-5 w-5 text-white" />
                            </div>
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                <h4 className="font-semibold text-gray-900">{profile.name}</h4>
                                {profile.verification_status === 'verified' && (
                                  <VerificationBadge status="verified" size="sm" showText={false} />
                                )}
                              </div>
                              <p className="text-sm text-gray-600">{detailedDescription}</p>
                            </div>
                            <span className="text-sm text-gray-500 whitespace-nowrap">{formatActivityDate(activity.created_at)}</span>
                          </div>
                          
                          {/* Activity Details Card */}
                          <div className="ml-[52px] mt-3 p-4 bg-white rounded-lg border border-gray-200">
                            {activity.activity_data?.title && (
                              <p className="text-base text-gray-900 font-semibold mb-2">{activity.activity_data.title}</p>
                            )}
                            {activity.activity_data?.content && (
                              <p className="text-sm text-gray-700 mb-3 line-clamp-3 leading-relaxed">{activity.activity_data.content}</p>
                            )}
                            
                            {/* Activity metadata */}
                            <div className="flex items-center gap-3 flex-wrap mt-3">
                              <Badge variant="secondary" className="text-xs font-medium capitalize">
                                {activity.entity_type.replace(/_/g, ' ')}
                              </Badge>
                              <span className="text-xs text-gray-500">
                                ID: #{activity.entity_id}
                              </span>
                              {activity.activity_type === 'post_created' && (
                                <Badge variant="outline" className="text-xs text-blue-600 border-blue-300 font-medium">
                                  Text Post
                                </Badge>
                              )}
                              {activity.activity_type === 'listing_created' && (
                                <Badge variant="outline" className="text-xs text-green-600 border-green-300 font-medium">
                                  Marketplace Listing
                                </Badge>
                              )}
                              {activity.activity_type === 'order_placed' && (
                                <Badge variant="outline" className="text-xs text-purple-600 border-purple-300 font-medium">
                                  Purchase Order
                                </Badge>
                              )}
                              {activity.activity_type === 'service_request_created' && (
                                <Badge variant="outline" className="text-xs text-orange-600 border-orange-300 font-medium">
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

        <TabsContent value="stats">
          <div className="grid md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Platform Engagement</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-6">
                  <div className="flex items-center justify-between py-2 border-b">
                    <div className="flex items-center gap-3">
                      <Heart className="h-5 w-5 text-blue-600" />
                      <span className="text-gray-700">Posts Created</span>
                    </div>
                    <span className="text-2xl font-bold text-blue-600">{stats.posts}</span>
                  </div>
                  <div className="flex items-center justify-between py-2 border-b">
                    <div className="flex items-center gap-3">
                      <Target className="h-5 w-5 text-green-600" />
                      <span className="text-gray-700">Marketplace Listings</span>
                    </div>
                    <span className="text-2xl font-bold text-green-600">{stats.listings}</span>
                  </div>
                  <div className="flex items-center justify-between py-2 border-b">
                    <div className="flex items-center gap-3">
                      <Trophy className="h-5 w-5 text-purple-600" />
                      <span className="text-gray-700">Orders Placed</span>
                    </div>
                    <span className="text-2xl font-bold text-purple-600">{stats.orders}</span>
                  </div>
                  {stats.serviceRequests > 0 && (
                    <div className="flex items-center justify-between py-2 border-b">
                      <div className="flex items-center gap-3">
                        <Users className="h-5 w-5 text-indigo-600" />
                        <span className="text-gray-700">Service Requests</span>
                      </div>
                      <span className="text-2xl font-bold text-indigo-600">{stats.serviceRequests}</span>
                    </div>
                  )}
                  {stats.serviceOffers > 0 && (
                    <div className="flex items-center justify-between py-2 border-b">
                      <div className="flex items-center gap-3">
                        <Award className="h-5 w-5 text-teal-600" />
                        <span className="text-gray-700">Service Offers</span>
                      </div>
                      <span className="text-2xl font-bold text-teal-600">{stats.serviceOffers}</span>
                    </div>
                  )}
                  {stats.volunteeredServices > 0 && (
                    <div className="flex items-center justify-between py-2 border-b">
                      <div className="flex items-center gap-3">
                        <Users className="h-5 w-5 text-rose-600" />
                        <span className="text-gray-700">Volunteered Services</span>
                      </div>
                      <span className="text-2xl font-bold text-rose-600">{stats.volunteeredServices}</span>
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
        </TabsContent>
      </Tabs>
      </div>
    </div>
    </>
  )
}
