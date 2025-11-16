'use client'

import { useState, useEffect, use } from 'react'
import { useRouter } from 'next/navigation'
import { Header } from '@/components/header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { VerificationBadge } from '@/components/verification-badge'
import { PostsFeed } from '@/components/posts-feed'
import { useAuth } from '@/lib/auth-context'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import Link from 'next/link'
import { 
  MapPin, 
  Calendar, 
  Globe, 
  Users, 
  Building,
  Phone,
  Mail,
  ExternalLink,
  Edit,
  ArrowLeft
} from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'

export default function PublicProfilePage({ params }: { params: Promise<{ userId: string }> }) {
  const router = useRouter()
  const { user: currentUser } = useAuth()
  const resolvedParams = use(params)
  const userId = resolvedParams.userId
  
  const [profile, setProfile] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isOwnProfile, setIsOwnProfile] = useState(false)

  useEffect(() => {
    if (userId) {
      fetchProfile()
    }
  }, [userId])

  useEffect(() => {
    if (currentUser && profile) {
      setIsOwnProfile(currentUser.id === profile.id)
    }
  }, [currentUser, profile])

  const fetchProfile = async () => {
    try {
      setLoading(true)
      const response = await fetch(`/api/users/${userId}`)
      
      if (!response.ok) {
        if (response.status === 404) {
          setError('Profile not found')
        } else {
          setError('Failed to load profile')
        }
        return
      }

      const data = await response.json()
      setProfile(data.user)
    } catch (error) {
      console.error('Error fetching profile:', error)
      setError('Failed to load profile')
    } finally {
      setLoading(false)
    }
  }

  const getInitials = (name: string) => {
    if (!name) return 'U'
    return name
      .split(' ')
      .map(word => word.charAt(0).toUpperCase())
      .join('')
      .substring(0, 2)
  }

  const formatUserType = (userType: string) => {
    if (!userType) return 'User'
    switch (userType) {
      case 'individual': return 'Individual'
      case 'company': return 'Company' 
      case 'ngo': return 'NGO'
      default: return userType.charAt(0).toUpperCase() + userType.slice(1)
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen flex-col">
        <Header />
        <main className="flex-1 px-6 py-8 md:px-10">
          <div className="max-w-6xl mx-auto">
            <div className="flex items-center justify-center py-12">
              <div className="text-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
                <p className="text-muted-foreground">Loading profile...</p>
              </div>
            </div>
          </div>
        </main>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex min-h-screen flex-col">
        <Header />
        <main className="flex-1 px-6 py-8 md:px-10">
          <div className="max-w-6xl mx-auto">
            <div className="flex items-center justify-center py-12">
              <div className="text-center">
                <h1 className="text-2xl font-bold mb-2">Profile Not Found</h1>
                <p className="text-muted-foreground mb-4">{error}</p>
                <Button onClick={() => router.back()} variant="outline">
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Go Back
                </Button>
              </div>
            </div>
          </div>
        </main>
      </div>
    )
  }

  if (!profile) {
    return (
      <div className="flex min-h-screen flex-col">
        <Header />
        <main className="flex-1 px-6 py-8 md:px-10">
          <div className="max-w-6xl mx-auto">
            <div className="flex items-center justify-center py-12">
              <div className="text-center">
                <h1 className="text-2xl font-bold mb-2">Profile Not Available</h1>
                <p className="text-muted-foreground mb-4">This profile could not be loaded.</p>
                <Button onClick={() => router.back()} variant="outline">
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Go Back
                </Button>
              </div>
            </div>
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      
      <main className="flex-1 px-6 py-8 md:px-10">
        <div className="max-w-6xl mx-auto">
          {/* Back Button */}
          <div className="mb-6">
            <Button variant="ghost" onClick={() => router.back()} className="p-0">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
          </div>

          {/* Profile Layout: Left sidebar + Right content */}
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 mb-8">
            {/* Left Sidebar - Profile Basic Info */}
            <div className="lg:col-span-1">
              <Card>
                <CardContent className="p-6 text-center">
                  {/* Profile Picture */}
                  <Avatar className="h-24 w-24 mx-auto mb-4">
                    <AvatarImage 
                      src={profile.profile_image} 
                      alt={profile.name || 'User'}
                      className="object-cover"
                    />
                    <AvatarFallback className="text-xl">
                      {getInitials(profile.name || 'User')}
                    </AvatarFallback>
                  </Avatar>

                  {/* Name - Real data from profile.name */}
                  <h1 className="text-xl font-bold mb-2">{profile.name || 'User'}</h1>
                  
                  {/* User Type - Real data from profile.user_type */}
                  <div className="flex items-center justify-center gap-2 mb-2">
                    <Badge variant="secondary" className="flex items-center gap-1">
                      {profile.user_type === 'individual' && <Users className="h-3 w-3" />}
                      {profile.user_type === 'company' && <Building className="h-3 w-3" />}
                      {profile.user_type === 'ngo' && <Building className="h-3 w-3" />}
                      {formatUserType(profile.user_type)}
                    </Badge>
                    <VerificationBadge 
                      status={profile.verification_status || 'unverified'} 
                      size="sm"
                      showText={false}
                    />
                  </div>

                  {/* Joined Date - Real data from created_at */}
                  {profile.created_at && (
                    <p className="text-sm text-muted-foreground flex items-center justify-center gap-1">
                      <Calendar className="h-3 w-3" />
                      Joined {formatDistanceToNow(new Date(profile.created_at), { addSuffix: true })}
                    </p>
                  )}

                  {/* Edit Button (only for own profile) */}
                  {isOwnProfile && (
                    <Link href="/profile" className="block mt-4">
                      <Button variant="outline" size="sm" className="w-full">
                        <Edit className="h-4 w-4 mr-2" />
                        Edit Profile
                      </Button>
                    </Link>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Right Content - About Section */}
            <div className="lg:col-span-3">
              <Card>
                <CardHeader>
                  <CardTitle>About</CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* Bio */}
                  {profile.bio && (
                    <div>
                      <h3 className="font-medium mb-2">Bio</h3>
                      <p className="text-muted-foreground">{profile.bio}</p>
                    </div>
                  )}

                  {/* Contact & Location Info */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Location */}
                    {(profile.city || profile.state_province) && (
                      <div className="flex items-center gap-2 text-sm">
                        <MapPin className="h-4 w-4 text-muted-foreground" />
                        <span>
                          {[profile.city, profile.state_province, profile.country]
                            .filter(Boolean)
                            .join(', ')}
                        </span>
                      </div>
                    )}

                    {/* Phone */}
                    {profile.phone && (
                      <div className="flex items-center gap-2 text-sm">
                        <Phone className="h-4 w-4 text-muted-foreground" />
                        <span>{profile.phone}</span>
                        {profile.phone_verified && (
                          <Badge variant="outline" className="text-xs">Verified</Badge>
                        )}
                      </div>
                    )}

                    {/* Email */}
                    {profile.email && (
                      <div className="flex items-center gap-2 text-sm">
                        <Mail className="h-4 w-4 text-muted-foreground" />
                        <span>{profile.email}</span>
                        {profile.email_verified && (
                          <Badge variant="outline" className="text-xs">Verified</Badge>
                        )}
                      </div>
                    )}
                  </div>

                  {/* User-type specific information */}
                  {profile.user_type === 'individual' && profile.profile_data && (
                    <div className="space-y-4">
                      {/* Skills */}
                      {profile.profile_data.skills && (
                        <div>
                          <h3 className="font-medium mb-2">Skills</h3>
                          <p className="text-muted-foreground">{profile.profile_data.skills}</p>
                        </div>
                      )}

                      {/* Interests */}
                      {profile.profile_data.interests && (
                        <div>
                          <h3 className="font-medium mb-2">Interests</h3>
                          <p className="text-muted-foreground">{profile.profile_data.interests}</p>
                        </div>
                      )}

                      {/* Categories */}
                      {profile.profile_data.categories && (
                        <div>
                          <h3 className="font-medium mb-2">Categories</h3>
                          <p className="text-muted-foreground">{profile.profile_data.categories}</p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* NGO Details */}
                  {profile.user_type === 'ngo' && profile.profile_data && (
                    <div className="space-y-4">
                      {profile.profile_data.registration_number && (
                        <div>
                          <h3 className="font-medium mb-2">Registration Number</h3>
                          <p className="text-muted-foreground">{profile.profile_data.registration_number}</p>
                        </div>
                      )}

                      {profile.profile_data.founded_year && (
                        <div>
                          <h3 className="font-medium mb-2">Founded</h3>
                          <p className="text-muted-foreground">{profile.profile_data.founded_year}</p>
                        </div>
                      )}

                      {profile.profile_data.focus_areas && (
                        <div>
                          <h3 className="font-medium mb-2">Focus Areas</h3>
                          <p className="text-muted-foreground">{profile.profile_data.focus_areas}</p>
                        </div>
                      )}

                      {profile.profile_data.organization_website && (
                        <div>
                          <h3 className="font-medium mb-2">Website</h3>
                          <a 
                            href={profile.profile_data.organization_website}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-2 text-blue-600 hover:text-blue-800"
                          >
                            <Globe className="h-4 w-4" />
                            {profile.profile_data.organization_website}
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Company Details */}
                  {profile.user_type === 'company' && profile.profile_data && (
                    <div className="space-y-4">
                      {profile.profile_data.industry && (
                        <div>
                          <h3 className="font-medium mb-2">Industry</h3>
                          <p className="text-muted-foreground">{profile.profile_data.industry}</p>
                        </div>
                      )}

                      {profile.profile_data.company_size && (
                        <div>
                          <h3 className="font-medium mb-2">Company Size</h3>
                          <p className="text-muted-foreground">{profile.profile_data.company_size}</p>
                        </div>
                      )}

                      {profile.profile_data.company_website && (
                        <div>
                          <h3 className="font-medium mb-2">Website</h3>
                          <a 
                            href={profile.profile_data.company_website}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-2 text-blue-600 hover:text-blue-800"
                          >
                            <Globe className="h-4 w-4" />
                            {profile.profile_data.company_website}
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Verification Status Summary */}
                  <div>
                    <h3 className="font-medium mb-2">Verification Status</h3>
                    <div className="flex flex-wrap gap-2">
                      <Badge variant={profile.verification_status === 'verified' ? 'default' : 'secondary'}>
                        Document: {profile.verification_status || 'Unverified'}
                      </Badge>
                      <Badge variant={profile.email_verified ? 'default' : 'secondary'}>
                        Email: {profile.email_verified ? 'Verified' : 'Unverified'}
                      </Badge>
                      <Badge variant={profile.phone_verified ? 'default' : 'secondary'}>
                        Phone: {profile.phone_verified ? 'Verified' : 'Unverified'}
                      </Badge>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* Posts Section - Default Tab */}
          <Tabs defaultValue="posts" className="w-full">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="posts">Posts</TabsTrigger>
              <TabsTrigger value="listings">Listings (0)</TabsTrigger>
              <TabsTrigger value="sales">Sales (0)</TabsTrigger>
              <TabsTrigger value="activity">Activity</TabsTrigger>
            </TabsList>
            
            <TabsContent value="posts" className="mt-6">
              <Card>
                <CardHeader>
                  <CardTitle>Posts</CardTitle>
                </CardHeader>
                <CardContent>
                  <PostsFeed userId={profile.id} showAllPosts={true} />
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="listings" className="mt-6">
              <Card>
                <CardHeader>
                  <CardTitle>Listings</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground text-center py-8">No listings available.</p>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="sales" className="mt-6">
              <Card>
                <CardHeader>
                  <CardTitle>Sales</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground text-center py-8">No sales data available.</p>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="activity" className="mt-6">
              <Card>
                <CardHeader>
                  <CardTitle>Activity</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground text-center py-8">No recent activity.</p>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </main>
    </div>
  )
}
