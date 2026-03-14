"use client"

import { use, useEffect, useRef, useState } from "react"
import { Header } from "@/components/header"
import { PostsFeed } from "@/components/posts-feed"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Calendar, MapPin, Award, TrendingUp, Heart, Users, Target, Trophy, Loader2, FileText, Briefcase, Download, ExternalLink, MailCheck, Phone, ShieldCheck } from "lucide-react"
import { VerificationBadge } from "@/components/verification-badge"
import { useAuth } from "@/lib/auth-context"

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
                    {allVerified ? (
                      <ShieldCheck className="h-5 w-5 text-green-600" />
                    ) : (
                      <>
                        {profile.email_verified && <MailCheck className="h-5 w-5 text-green-600" />}
                        {profile.phone_verified && <Phone className="h-5 w-5 text-green-600" />}
                        {profile.verification_status === 'verified' && <ShieldCheck className="h-5 w-5 text-green-600" />}
                      </>
                    )}
                  </div>
                  <div className="flex items-center gap-4 text-gray-600 text-sm mb-2">
                    {(profile.city || profile.location) && (
                      <span className="flex items-center gap-1">
                        <MapPin className="h-4 w-4" />
                        {profile.city || profile.location}
                      </span>
                    )}
                    <span className="flex items-center gap-2">
                      <Calendar className="h-4 w-4" />
                      Joined {formatDate(profile.created_at)}
                      <Badge variant="outline" className="capitalize">{profile.user_type}</Badge>
                    </span>
                  </div>
                  {profile.profile_data?.bio && (
                    <div className="mt-4">
                      <p className="text-sm font-medium text-gray-500 mb-1">About</p>
                      <p className="text-gray-700 whitespace-pre-wrap">{profile.profile_data.bio}</p>
                    </div>
                  )}
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
                      <p className="text-2xl font-bold text-orange-500">{stats.serviceRequests}</p>
                      <p className="text-sm text-gray-900">Service Requests</p>
                    </div>
                    <div className="text-center p-3 bg-white rounded-lg border border-gray-700">
                      <p className="text-2xl font-bold text-orange-500">{stats.serviceOffers}</p>
                      <p className="text-sm text-gray-900">Service Offers</p>
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

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7">
          <Card>
            <CardHeader>
              <CardTitle>Posts</CardTitle>
            </CardHeader>
            <CardContent className="max-h-[70vh] overflow-y-auto pr-2">
              <PostsFeed userId={profile.id} showAllPosts={true} limit={20} showPostedDate={true} />
            </CardContent>
          </Card>
        </div>

        <div className="lg:col-span-5 space-y-6">
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

                {stats.serviceRequests >= 5 && (
                  <div className="p-4 border-2 border-gray-700 rounded-xl bg-white hover:shadow-lg transition-shadow">
                    <div className="flex flex-col items-center text-center">
                      <h3 className="font-bold text-orange-500 mb-1">Opportunity Builder</h3>
                      <p className="text-sm text-gray-900 mb-2">Created {stats.serviceRequests} service requests</p>
                      <Badge variant="secondary" className="bg-orange-500 text-white border-0">
                        Community Organizer
                      </Badge>
                    </div>
                  </div>
                )}

                {stats.clientProjects >= 5 && (
                  <div className="p-4 border-2 border-gray-700 rounded-xl bg-white hover:shadow-lg transition-shadow">
                    <div className="flex flex-col items-center text-center">
                      <h3 className="font-bold text-orange-500 mb-1">Reliable Collaborator</h3>
                      <p className="text-sm text-gray-900 mb-2">Joined {stats.clientProjects} service projects</p>
                      <Badge variant="secondary" className="bg-orange-500 text-white border-0">
                        Trusted Participant
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
              {stats.posts < 5 && stats.volunteeredServices < 3 && stats.clientProjects < 5 && 
               stats.serviceRequests < 3 && stats.serviceOffers < 3 && 
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
                      {(stats.posts * 1) + (stats.volunteeredServices * 10) + (stats.serviceRequests * 5) + (stats.serviceOffers * 8) + (stats.clientProjects * 4)}
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
                      <span className="font-medium text-gray-900">Project Participation</span>
                      <span className="text-2xl font-bold text-orange-500">{stats.clientProjects * 4}</span>
                    </div>
                    <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-orange-500 rounded-full transition-all" 
                        style={{ width: `${Math.min((stats.clientProjects / 10) * 100, 100)}%` }}
                      />
                    </div>
                    <p className="text-xs text-gray-600 mt-2">{stats.clientProjects} projects × 4 points</p>
                  </div>
                </div>

                {/* Impact Summary */}
                <div className="p-4 bg-white rounded-lg border border-gray-700">
                  <h4 className="font-medium text-orange-500 mb-3">Impact Summary</h4>
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
                    {stats.clientProjects > 0 && (
                      <p>✓ Participated in <span className="font-semibold text-orange-500">{stats.clientProjects}</span> service projects</p>
                    )}
                    {stats.posts === 0 && stats.volunteeredServices === 0 && stats.serviceRequests === 0 && 
                     stats.serviceOffers === 0 && stats.clientProjects === 0 && (
                      <p className="text-gray-500 italic">No impact activities yet. Start contributing to see your impact grow!</p>
                    )}
                  </div>
                </div>
              </div>
              )}
            </CardContent>
          </Card>

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
                    <span className="text-gray-900">Service Projects Joined</span>
                    <span className="text-2xl font-bold text-orange-500">{stats.clientProjects}</span>
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
                      <VerificationBadge 
                        status={(profile.verification_status || 'unverified') as any} 
                        size="sm"
                        showText={false}
                      />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
          )}
        </div>
      </div>
    </div>
    </>
  )
}
