"use client"

import { use, useEffect, useRef, useState } from "react"
import { Header } from "@/components/header"
import { PostsFeed } from "@/components/posts-feed"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { ArrowLeft, Calendar, MapPin, Award, TrendingUp, Heart, Users, Target, Trophy, Loader2, FileText, Briefcase, Download, ExternalLink, MailCheck, Phone } from "lucide-react"
import { VerificationBadge } from "@/components/verification-badge"
import { useAuth } from "@/lib/auth-context"
import { useIsMobile } from "@/hooks/use-mobile"

interface ImpactProfileProps {
  params: Promise<{
    id: string
  }>
}

interface UserProfile {
  id: number
  name: string
  email: string
  email_verified?: boolean
  phone_verified?: boolean
  user_type: string
  location: string
  profile_image: string
  city: string
  created_at: string
  verification_status?: string
  profile_data?: {
    bio?: string
  }
}

export default function ImpactProfilePage({ params }: ImpactProfileProps) {
  const { id } = use(params)
  const { token } = useAuth()
  const fetchingRef = useRef(false)
  const isMobile = useIsMobile()

  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [statsLoading, setStatsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [stats, setStats] = useState({
    posts: 0,
    serviceRequests: 0,
    serviceOffers: 0,
    volunteeredServices: 0,
    clientProjects: 0,
    reactions: 0,
    comments: 0,
    followers: 0,
    following: 0
  })
  const [showAllProfilePosts, setShowAllProfilePosts] = useState(false)
  const [showAllAchievements, setShowAllAchievements] = useState(false)

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
        setLoading(false)
        setStatsLoading(true)

        // Fetch all other data in parallel (non-blocking)
        const [
          postsRes,
          requestsRes,
          offersRes,
          volunteerRes,
          clientsRes
        ] = await Promise.allSettled([
          fetch(`/api/posts?userId=${id}&limit=100`, { headers }),
          fetch(`/api/service-requests?userId=${id}`, { headers }),
          fetch(`/api/service-offers?ngoId=${id}`, { headers }),
          fetch(`/api/service-volunteers?volunteerId=${id}`, { headers }),
          fetch(`/api/service-clients?clientId=${id}`, { headers })
        ])

        // Parse JSON responses once and store them
        let postsData: any = null
        let requestsData: any = null
        let offersData: any = null
        let volunteerData: any = null
        let clientsData: any = null

        if (postsRes.status === 'fulfilled' && postsRes.value.ok) {
          postsData = await postsRes.value.json()
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

        const newStats = {
          posts: postsData?.data?.length || 0,
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

  const getInitials = (name: string) => {
    if (!name) return "U"
    return name.split(' ').map(n => n[0]).join('').toUpperCase()
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
  }

  const allVerified = Boolean(
    profile?.email_verified &&
    profile?.phone_verified &&
    profile?.verification_status === 'verified'
  )

  const achievementBadges = [
    ...(stats.posts >= 5
      ? [{
          id: 'content-creator',
          title: 'Content Creator',
          description: `Created ${stats.posts} posts`,
          label: 'Active Contributor'
        }]
      : []),
    ...(stats.volunteeredServices >= 3
      ? [{
          id: 'volunteer-hero',
          title: 'Volunteer Hero',
          description: `Volunteered for ${stats.volunteeredServices} services`,
          label: 'Community Helper'
        }]
      : []),
    ...(stats.serviceRequests >= 5
      ? [{
          id: 'opportunity-builder',
          title: 'Opportunity Builder',
          description: `Created ${stats.serviceRequests} service requests`,
          label: 'Community Organizer'
        }]
      : []),
    ...(stats.clientProjects >= 5
      ? [{
          id: 'reliable-collaborator',
          title: 'Reliable Collaborator',
          description: `Joined ${stats.clientProjects} service projects`,
          label: 'Trusted Participant'
        }]
      : []),
    ...(stats.serviceRequests >= 3
      ? [{
          id: 'opportunity-creator',
          title: 'Opportunity Creator',
          description: `Created ${stats.serviceRequests} service requests`,
          label: 'NGO Leader'
        }]
      : []),
    ...(stats.serviceOffers >= 3
      ? [{
          id: 'service-provider',
          title: 'Service Provider',
          description: `Offered ${stats.serviceOffers} professional services`,
          label: 'NGO Professional'
        }]
      : []),
    ...(profile?.verification_status === 'verified'
      ? [{
          id: 'verified-member',
          title: 'Verified Member',
          description: 'Successfully verified account',
          label: 'Trusted User'
        }]
      : []),
  ]

  const visibleAchievements = showAllAchievements ? achievementBadges : achievementBadges.slice(0, 3)
  const impactMetricItems = [
    {
      label: 'Overall Impact Score',
      value: (stats.posts * 1) + (stats.volunteeredServices * 10) + (stats.serviceRequests * 5) + (stats.serviceOffers * 8) + (stats.clientProjects * 4),
      detail: 'Points earned from all activities'
    },
    {
      label: 'Social Engagement',
      value: `${stats.posts} posts`,
      detail: `${stats.posts} posts × 1 point`
    },
    {
      label: 'Volunteer Impact',
      value: `${stats.volunteeredServices} services`,
      detail: `${stats.volunteeredServices} services × 10 points`
    },
    {
      label: 'Service Requests',
      value: `${stats.serviceRequests} requests`,
      detail: `${stats.serviceRequests} requests × 5 points`
    },
    {
      label: 'Service Offers',
      value: `${stats.serviceOffers} offers`,
      detail: `${stats.serviceOffers} offers × 8 points`
    },
    {
      label: 'Project Participation',
      value: `${stats.clientProjects} projects`,
      detail: `${stats.clientProjects} projects × 4 points`
    },
  ]

  const previewPostLimit = isMobile ? 3 : 6
  const profilePostsLimit = showAllProfilePosts ? 20 : previewPostLimit

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
              <Button onClick={() => window.history.back()} className="hover:bg-transparent active:bg-transparent focus-visible:bg-transparent focus-visible:ring-0">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back
              </Button>
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
                <AvatarFallback className="text-3xl bg-udaan-orange text-white">
                  {getInitials(profile.name)}
                </AvatarFallback>
              </Avatar>
            
            <div className="flex-1">
              <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between mb-4">
                <div className="min-w-0">
                  <div className="flex flex-col items-start gap-1 mb-1 sm:flex-row sm:flex-wrap sm:items-center sm:gap-2">
                    <h1 className="text-3xl font-bold text-gray-900">
                      {profile.name}
                    </h1>
                    <div className="flex items-center gap-1">
                      {allVerified ? (
                        <VerificationBadge status="verified" size="sm" showText={false} />
                      ) : (
                        <>
                          {profile.email_verified && <MailCheck className="h-5 w-5 text-green-600" />}
                          {profile.phone_verified && <Phone className="h-5 w-5 text-green-600" />}
                          <VerificationBadge status={profile.verification_status || 'unverified'} size="sm" showText={false} />
                        </>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-col gap-2 text-gray-600 text-sm mb-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-4 sm:gap-y-2">
                    {(profile.city || profile.location) && (
                      <span className="flex items-center gap-1">
                        <MapPin className="h-4 w-4" />
                        {profile.city || profile.location}
                      </span>
                    )}
                    <span className="flex items-center gap-2">
                      <Calendar className="h-4 w-4" />
                      Joined {formatDate(profile.created_at)}
                    </span>
                    <Badge variant="outline" className="w-fit capitalize whitespace-nowrap shrink-0 self-start sm:self-auto">
                      {profile.user_type}
                    </Badge>
                  </div>
                  {profile.profile_data?.bio && (
                    <div className="mt-4">
                      <p className="text-sm font-medium text-gray-500 mb-1">About</p>
                      <p className="text-gray-700 whitespace-pre-wrap">{profile.profile_data.bio}</p>
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-3 xl:w-[34rem]">
                  <div className="rounded-lg bg-white px-4 py-3 text-left">
                    <p className="text-2xl font-bold text-orange-500">{stats.posts}</p>
                    <p className="text-sm text-gray-900">Posts</p>
                  </div>
                  <div className="rounded-lg bg-white px-4 py-3 text-left">
                    <p className="text-2xl font-bold text-orange-500">{stats.serviceRequests}</p>
                    <p className="text-sm text-gray-900">Service Requests</p>
                  </div>
                  <div className="rounded-lg bg-white px-4 py-3 text-left">
                    <p className="text-2xl font-bold text-orange-500">{stats.serviceOffers}</p>
                    <p className="text-sm text-gray-900">Service Offers</p>
                  </div>
                  <div className="rounded-lg bg-white px-4 py-3 text-left">
                    <p className="text-2xl font-bold text-orange-500">{stats.volunteeredServices}</p>
                    <p className="text-sm text-gray-900">Volunteered</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="col-span-1 lg:col-span-12">
        <Card>
          <Tabs defaultValue="posts" className="w-full">
            <CardHeader>
              <TabsList className="grid min-h-[4.25rem] w-full grid-cols-3 gap-1 rounded-md bg-slate-100 p-1 sm:min-h-[3rem]">
                <TabsTrigger value="posts" className="min-w-0 px-2 py-3 text-[11px] leading-snug sm:py-2 sm:text-sm">
                  Posts
                </TabsTrigger>
                <TabsTrigger value="profile" className="min-w-0 px-2 py-3 text-[11px] leading-snug sm:py-2 sm:text-sm">
                  Profile Information
                </TabsTrigger>
                <TabsTrigger value="achievements" className="min-w-0 px-2 py-3 text-[11px] leading-snug sm:py-2 sm:text-sm">
                  Achievements
                </TabsTrigger>
              </TabsList>
            </CardHeader>

            <CardContent>
              <TabsContent value="posts" className="p-0">
              <Card>
                <CardHeader>
                  <CardTitle>{showAllProfilePosts ? 'All Posts' : 'Recent Posts'}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="max-h-[70vh] overflow-y-auto pr-2 [scrollbar-gutter:stable]">
                    <PostsFeed
                      userId={profile.id}
                      showAllPosts={showAllProfilePosts}
                      limit={profilePostsLimit}
                      showPostedDate={true}
                    />
                  </div>
                  {!statsLoading && stats.posts > previewPostLimit && (
                    <div className="mt-4 flex justify-center">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setShowAllProfilePosts((prev) => !prev)}
                      >
                        {showAllProfilePosts ? 'Show Less' : 'View All'}
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
              </TabsContent>

              <TabsContent value="profile" className="p-0">
              <Card>
                <CardHeader>
                  <CardTitle>Profile Information</CardTitle>
                </CardHeader>
                <CardContent>
                  {statsLoading ? (
                    <div className="space-y-4 animate-pulse">
                      {[1, 2, 3, 4].map((i) => (
                        <div key={i} className="space-y-2">
                          <div className="h-3 w-24 bg-gray-200 rounded" />
                          <div className="h-4 w-40 bg-gray-200 rounded" />
                        </div>
                      ))}
                    </div>
                  ) : (
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
                          <VerificationBadge
                            status={(profile.verification_status || 'unverified') as any}
                            size="sm"
                            showText={false}
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
              </TabsContent>

              <TabsContent value="achievements" className="p-0">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0">
                  <CardTitle>Achievements & Impact</CardTitle>
                  {!statsLoading && achievementBadges.length > 3 && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowAllAchievements((prev) => !prev)}
                    >
                      {showAllAchievements ? 'Show Less' : 'View All'}
                    </Button>
                  )}
                </CardHeader>
                <CardContent>
                  <div className="grid gap-6 lg:grid-cols-2">
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-base">Achievement Badges</CardTitle>
                      </div>
                      {statsLoading ? (
                        <div className="grid gap-4 md:grid-cols-2">
                          {[1, 2, 3].map((i) => (
                            <div key={i} className="p-4 rounded-lg border border-gray-200 bg-white animate-pulse">
                              <div className="flex flex-col space-y-3">
                                <div className="h-6 w-32 bg-gray-200 rounded" />
                                <div className="h-4 w-40 bg-gray-100 rounded" />
                                <div className="h-3 w-24 bg-gray-100 rounded" />
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="grid gap-4 md:grid-cols-2">
                          {visibleAchievements.map((badge) => (
                            <div key={badge.id} className="p-4 rounded-lg border border-gray-200 bg-white">
                              <p className="font-semibold">{badge.title}</p>
                              <p className="text-sm text-gray-600">{badge.description}</p>
                              <p className="text-xs text-gray-400 mt-2">{badge.label}</p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-base">Impact Metrics</CardTitle>
                      </div>
                      {statsLoading ? (
                        <div className="grid gap-x-10 gap-y-5 md:grid-cols-2">
                          {[1, 2, 3, 4, 5, 6].map((i) => (
                            <div key={i} className="space-y-1 animate-pulse">
                              <div className="h-4 w-44 rounded bg-gray-200" />
                              <div className="h-3 w-64 rounded bg-gray-100" />
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="grid gap-x-10 gap-y-6 md:grid-cols-2 text-left">
                          {impactMetricItems.map((item) => (
                            <div key={item.label} className="space-y-1">
                              <p className="text-sm font-medium text-gray-900">{item.label}: <span className="font-semibold text-orange-500">{item.value}</span></p>
                              <p className="text-xs text-gray-600">{item.detail}</p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
              </TabsContent>
            </CardContent>
          </Tabs>
        </Card>
      </div>
      </div>
    </>
  )
}
