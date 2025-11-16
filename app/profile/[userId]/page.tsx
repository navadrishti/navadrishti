'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { use } from 'react'
import { Header } from '@/components/header'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { VerificationBadge } from '@/components/verification-badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Label } from '@/components/ui/label'
import { 
  ArrowLeft, 
  Star, 
  MapPin, 
  Calendar,
  Users,
  Building,
  User,
  Shield,
  ExternalLink,
  Package,
  ShoppingBag,
  ShoppingCart,
  Award
} from 'lucide-react'
import { ProductCard } from '@/components/product-card'
import { PostsFeed } from '@/components/posts-feed'
import { toast } from 'sonner'

interface ProfileData {
  id: string
  full_name?: string
  name?: string
  user_type: string
  bio?: string
  location?: string
  website?: string
  portfolio?: any[]
  experience?: string
  proof_of_work?: string[] // Photo URLs of work
  resume_url?: string
  profile_image?: string
  created_at: string
  rating_average?: number
  rating_count?: number
  total_listings?: number
  total_sold?: number
  verification_status?: string
}

export default function PublicProfilePage({ params }: { params: Promise<{ userId: string }> }) {
  const router = useRouter()
  const resolvedParams = use(params)
  const [profile, setProfile] = useState<ProfileData | null>(null)
  const [listings, setListings] = useState<any[]>([])
  const [soldItems, setSoldItems] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [activeTab, setActiveTab] = useState<'about' | 'listings' | 'sales' | 'posts' | 'activity'>('about')

  // Generate initials for avatar fallback
  const getInitials = (name: string) => {
    if (!name) return "U"
    const names = name.split(' ')
    if (names.length === 1) return names[0].charAt(0).toUpperCase()
    return (names[0].charAt(0) + names[names.length - 1].charAt(0)).toUpperCase()
  }

  // Calculate joinedDate from profile data
  const joinedDate = profile?.created_at ? new Date(profile.created_at).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long'
  }) : ''

  // Helper function to detect fake/mock location data
  const isFakeLocation = (location: string): boolean => {
    if (!location) return false
    
    const fakeLocations = [
      'new york',
      'ny',
      'new york, ny',
      'sample location',
      'test location',
      'dummy location',
      'fake location',
      'mock location',
      'placeholder location'
    ]
    
    return fakeLocations.some(fake => 
      location.toLowerCase().includes(fake)
    )
  }

  const fetchProfile = async () => {
    try {
      setLoading(true)
      const response = await fetch(`/api/profile/${resolvedParams.userId}`)
      const data = await response.json()

      if (data.success) {
        setProfile(data.profile)
      } else {
        setError(data.error || 'Profile not found')
      }
    } catch (err) {
      console.error('Error fetching profile:', err)
      setError('Failed to load profile')
    } finally {
      setLoading(false)
    }
  }

  const fetchUserListings = async () => {
    try {
      const response = await fetch(`/api/marketplace?seller_id=${resolvedParams.userId}`)
      const data = await response.json()

      if (data.success) {
        setListings(data.items || [])
        // Filter sold items (you can enhance this based on your business logic)
        setSoldItems(data.items?.filter((item: any) => item.status === 'sold') || [])
      }
    } catch (err) {
      console.error('Error fetching user listings:', err)
    }
  }

  useEffect(() => {
    fetchProfile()
    fetchUserListings()
  }, [resolvedParams.userId])

  const getUserTypeIcon = (userType: string) => {
    switch (userType) {
      case 'individual': return <User size={16} />
      case 'company': return <Building size={16} />
      case 'ngo': return <Users size={16} />
      default: return <User size={16} />
    }
  }

  const getUserTypeLabel = (userType: string) => {
    switch (userType) {
      case 'individual': return 'Individual'
      case 'company': return 'Company'
      case 'ngo': return 'NGO'
      default: return 'User'
    }
  }

  const getVerificationBadge = (status?: string) => {
    if (status === 'verified') {
      return (
        <VerificationBadge 
          status="verified" 
          size="sm" 
          showText={false}
        />
      )
    }
    return null
  }

  if (loading) {
    return (
      <div className="min-h-screen">
        <Header />
        <main className="container mx-auto px-4 py-8">
          <div className="animate-pulse">
            <div className="h-8 bg-gray-200 rounded w-1/4 mb-6"></div>
            <div className="flex gap-6">
              <div className="w-24 h-24 bg-gray-200 rounded-full"></div>
              <div className="flex-1 space-y-4">
                <div className="h-6 bg-gray-200 rounded w-1/3"></div>
                <div className="h-4 bg-gray-200 rounded w-1/2"></div>
                <div className="h-4 bg-gray-200 rounded w-1/4"></div>
              </div>
            </div>
          </div>
        </main>
      </div>
    )
  }

  if (error || !profile) {
    return (
      <div className="min-h-screen">
        <Header />
        <main className="container mx-auto px-4 py-8">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-gray-900 mb-4">Profile Not Found</h1>
            <p className="text-gray-600 mb-6">{error}</p>
            <Button onClick={() => router.back()}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Go Back
            </Button>
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      
      <main className="container mx-auto px-4 py-6">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-sm text-gray-600 mb-6">
          <button 
            onClick={() => router.back()}
            className="hover:text-blue-600 flex items-center gap-1"
          >
            <ArrowLeft size={16} />
            Back
          </button>
          <span>/</span>
          <span>Public Profile</span>
        </div>

        {/* Profile Header */}
        <Card className="mb-6">
          <CardContent className="p-6">
            <div className="flex flex-col md:flex-row gap-6">
              {/* Profile Image */}
              <div className="flex-shrink-0">
                <Avatar className="w-24 h-24">
                  <AvatarImage src={profile.profile_image} alt={profile.name || profile.full_name || 'User'} />
                  <AvatarFallback className="bg-gradient-to-br from-blue-400 to-indigo-500 text-white font-semibold text-xl">
                    {getInitials(profile.name || profile.full_name || 'User')}
                  </AvatarFallback>
                </Avatar>
              </div>

              {/* Profile Info */}
              <div className="flex-1">
                <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <h1 className="text-2xl font-bold text-gray-900">{profile.name || profile.full_name || 'User'}</h1>
                      {getVerificationBadge(profile.verification_status)}
                    </div>
                    
                    <div className="flex items-center gap-4 text-sm text-gray-600 mb-3">
                      <div className="flex items-center gap-1">
                        {getUserTypeIcon(profile.user_type)}
                        <span>{getUserTypeLabel(profile.user_type)}</span>
                      </div>
                      
                      {profile.location && !isFakeLocation(profile.location) && (
                        <div className="flex items-center gap-1">
                          <MapPin size={14} />
                          <span>{profile.location}</span>
                        </div>
                      )}
                      
                      <div className="flex items-center gap-1">
                        <Calendar size={14} />
                        <span>Joined {joinedDate}</span>
                      </div>
                    </div>

                    {profile.bio && (
                      <p className="text-gray-700 mb-3">{profile.bio}</p>
                    )}

                    {/* Rating */}
                    {profile.rating_average && profile.rating_count && profile.rating_count > 0 && (
                      <div className="flex items-center gap-2 mb-3">
                        <div className="flex items-center">
                          {[...Array(5)].map((_, i) => (
                            <Star
                              key={i}
                              size={16}
                              className={`${
                                i < Math.floor(profile.rating_average || 0)
                                  ? 'text-yellow-400 fill-current'
                                  : 'text-gray-300'
                              }`}
                            />
                          ))}
                        </div>
                        <span className="text-sm text-gray-600">
                          {profile.rating_average?.toFixed(1)} ({profile.rating_count} reviews)
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Statistics Cards */}
        {((listings?.length || 0) > 0 || (soldItems?.length || 0) > 0) && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            {/* Activity Stats */}
            {((listings?.length || 0) > 0 || (soldItems?.length || 0) > 0) && (
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-gray-600">Marketplace Activity</p>
                      <p className="text-2xl font-bold text-gray-900">{(listings?.length || 0) + (soldItems?.length || 0)}</p>
                    </div>
                    <Package className="h-8 w-8 text-blue-600" />
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Trading Statistics */}
            <div className="md:col-span-2 grid grid-cols-2 gap-4">
              {(listings?.length || 0) > 0 && (
                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-gray-600">Active Listings</p>
                        <p className="text-2xl font-bold text-gray-900">{listings?.length || 0}</p>
                      </div>
                      <ShoppingBag className="h-8 w-8 text-green-600" />
                    </div>
                  </CardContent>
                </Card>
              )}

              {(soldItems?.length || 0) > 0 && (
                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-gray-600">Items Sold</p>
                        <p className="text-2xl font-bold text-gray-900">{soldItems?.length || 0}</p>
                      </div>
                      <ShoppingCart className="h-8 w-8 text-purple-600" />
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        )}

        {/* Performance Overview */}
        {((listings?.length || 0) > 0 || (soldItems?.length || 0) > 0) && (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Award className="h-5 w-5" />
                Performance Overview
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div>
                  <Label className="text-sm font-medium text-gray-600">Success Rate</Label>
                  <div className="mt-2">
                    <div className="text-2xl font-bold text-gray-900">
                      {(((soldItems?.length || 0) / Math.max(((listings?.length || 0) + (soldItems?.length || 0)), 1)) * 100).toFixed(0)}%
                    </div>
                    <p className="text-xs text-gray-500">Items sold vs total listings</p>
                  </div>
                </div>
                
                <div>
                  <Label className="text-sm font-medium text-gray-600">Activity Level</Label>
                  <div className="mt-2">
                    <div className="text-2xl font-bold text-gray-900">
                      {(listings?.length || 0) + (soldItems?.length || 0) > 10 ? 'High' : 
                       (listings?.length || 0) + (soldItems?.length || 0) > 5 ? 'Medium' : 'Active'}
                    </div>
                    <p className="text-xs text-gray-500">Based on marketplace participation</p>
                  </div>
                </div>
                
                <div>
                  <Label className="text-sm font-medium text-gray-600">Profile Status</Label>
                  <div className="mt-2">
                    <div className="text-2xl font-bold text-gray-900">
                      {profile.verification_status === 'verified' ? 'Verified' : 'Active'}
                    </div>
                    <p className="text-xs text-gray-500">Account verification status</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Profile Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="about">About</TabsTrigger>
            <TabsTrigger value="posts">Posts</TabsTrigger>
            <TabsTrigger value="listings">
              Listings ({listings?.length || 0})
            </TabsTrigger>
            <TabsTrigger value="sales">
              Sales ({soldItems?.length || 0})
            </TabsTrigger>
            <TabsTrigger value="activity">Activity</TabsTrigger>
          </TabsList>

          {/* About Tab */}
          <TabsContent value="about" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>About {profile.name || profile.full_name || 'User'}</CardTitle>
                <CardDescription>
                  Learn more about this {getUserTypeLabel(profile.user_type).toLowerCase()}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Bio */}
                {profile.bio && (
                  <div>
                    <h3 className="font-semibold text-gray-900 mb-2">Bio</h3>
                    <p className="text-gray-700">{profile.bio}</p>
                  </div>
                )}

                {/* Contact Information */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Location */}
                  {profile.location && !isFakeLocation(profile.location) && (
                    <div>
                      <h3 className="font-semibold text-gray-900 mb-2 flex items-center gap-2">
                        <MapPin size={16} />
                        Location
                      </h3>
                      <p className="text-gray-700">{profile.location}</p>
                    </div>
                  )}

                  {/* Website */}
                  {profile.website && (
                    <div>
                      <h3 className="font-semibold text-gray-900 mb-2 flex items-center gap-2">
                        <ExternalLink size={16} />
                        Website
                      </h3>
                      <a 
                        href={profile.website} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:text-blue-800 hover:underline"
                      >
                        {profile.website}
                      </a>
                    </div>
                  )}
                </div>

                {/* Experience & Proof of Work (for individuals) */}
                {profile.user_type === 'individual' && (
                  <>
                    {profile.experience && (
                      <div>
                        <h3 className="font-semibold text-gray-900 mb-3">Experience</h3>
                        <p className="text-gray-700">{profile.experience}</p>
                      </div>
                    )}
                    
                    {profile.proof_of_work && profile.proof_of_work.length > 0 && (
                      <div>
                        <h3 className="font-semibold text-gray-900 mb-3">Proof of Work</h3>
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                          {profile.proof_of_work.map((imageUrl, index) => (
                            <img
                              key={index}
                              src={imageUrl}
                              alt={`Work sample ${index + 1}`}
                              className="w-full h-24 object-cover rounded"
                            />
                          ))}
                        </div>
                      </div>
                    )}
                    
                    {profile.resume_url && (
                      <div>
                        <h3 className="font-semibold text-gray-900 mb-3">Resume</h3>
                        <a 
                          href={profile.resume_url} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:text-blue-700 underline"
                        >
                          View Resume
                        </a>
                      </div>
                    )}
                  </>
                )}

                {/* Languages */}
                {profile.languages && profile.languages.length > 0 && (
                  <div>
                    <h3 className="font-semibold text-gray-900 mb-3">Languages</h3>
                    <div className="flex flex-wrap gap-2">
                      {profile.languages.map((language, index) => (
                        <Badge key={index} variant="outline">
                          {language}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {/* Interests */}
                {profile.interests && profile.interests.length > 0 && (
                  <div>
                    <h3 className="font-semibold text-gray-900 mb-3">Interests</h3>
                    <div className="flex flex-wrap gap-2">
                      {profile.interests.map((interest, index) => (
                        <Badge key={index} variant="outline" className="bg-blue-50 text-blue-700">
                          {interest}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Posts Tab */}
          <TabsContent value="posts" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Posts</CardTitle>
                <CardDescription>
                  Social posts shared by {profile.name || profile.full_name || 'this user'}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <PostsFeed userId={parseInt(resolvedParams.userId)} />
              </CardContent>
            </Card>
          </TabsContent>

          {/* Active Listings Tab */}
          <TabsContent value="listings" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Active Listings</CardTitle>
                <CardDescription>
                  Items currently available from this seller
                </CardDescription>
              </CardHeader>
              <CardContent>
                {(listings?.length || 0) > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {listings?.map((item) => (
                      <ProductCard key={item.id} item={item} />
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-gray-500">
                    <Package size={48} className="mx-auto mb-4 text-gray-300" />
                    <p>No active listings</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Sales History Tab */}
          <TabsContent value="sales" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Sales History</CardTitle>
                <CardDescription>
                  Previously sold items
                </CardDescription>
              </CardHeader>
              <CardContent>
                {(soldItems?.length || 0) > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {soldItems?.map((item) => (
                      <ProductCard key={item.id} item={item} />
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-gray-500">
                    <ShoppingCart size={48} className="mx-auto mb-4 text-gray-300" />
                    <p>No sales history</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Activity Tab */}
          <TabsContent value="activity" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Activity Overview</CardTitle>
                <CardDescription>
                  Recent activity and marketplace participation
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {((listings?.length || 0) > 0 || (soldItems?.length || 0) > 0) ? (
                    <>
                      {(listings?.length || 0) > 0 && (
                        <div className="flex items-center gap-3 p-3 bg-green-50 rounded-lg">
                          <ShoppingBag className="h-5 w-5 text-green-600" />
                          <div>
                            <p className="font-medium text-green-900">
                              {listings?.length || 0} Active Listing{(listings?.length || 0) !== 1 ? 's' : ''}
                            </p>
                            <p className="text-sm text-green-700">
                              Items currently available for purchase
                            </p>
                          </div>
                        </div>
                      )}
                      
                      {(soldItems?.length || 0) > 0 && (
                        <div className="flex items-center gap-3 p-3 bg-purple-50 rounded-lg">
                          <ShoppingCart className="h-5 w-5 text-purple-600" />
                          <div>
                            <p className="font-medium text-purple-900">
                              {soldItems?.length || 0} Item{(soldItems?.length || 0) !== 1 ? 's' : ''} Sold
                            </p>
                            <p className="text-sm text-purple-700">
                              Successfully completed transactions
                            </p>
                          </div>
                        </div>
                      )}

                      <div className="flex items-center gap-3 p-3 bg-blue-50 rounded-lg">
                        <Calendar className="h-5 w-5 text-blue-600" />
                        <div>
                          <p className="font-medium text-blue-900">Member Since</p>
                          <p className="text-sm text-blue-700">{joinedDate}</p>
                        </div>
                      </div>

                      {profile.verification_status === 'verified' && (
                        <div className="flex items-center gap-3 p-3 bg-emerald-50 rounded-lg">
                          <Shield className="h-5 w-5 text-emerald-600" />
                          <div>
                            <p className="font-medium text-emerald-900">Verified Account</p>
                            <p className="text-sm text-emerald-700">
                              This account has been verified by our team
                            </p>
                          </div>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="text-center py-8 text-gray-500">
                      <Award size={48} className="mx-auto mb-4 text-gray-300" />
                      <p>No marketplace activity yet</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  )
}