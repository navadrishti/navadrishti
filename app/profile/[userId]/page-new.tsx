'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Header } from '@/components/header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Separator } from '@/components/ui/separator'
import { VerificationBadge } from '@/components/verification-badge'
import { PostsFeed } from '@/components/posts-feed'
import { useAuth } from '@/lib/auth-context'
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

export default function PublicProfilePage() {
  const params = useParams()
  const router = useRouter()
  const { user: currentUser } = useAuth()
  const userId = params.userId as string
  
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
    return name
      .split(' ')
      .map(word => word.charAt(0).toUpperCase())
      .join('')
      .substring(0, 2)
  }

  const formatUserType = (userType: string) => {
    switch (userType) {
      case 'individual': return 'Individual'
      case 'company': return 'Company' 
      case 'ngo': return 'NGO'
      default: return userType
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen flex-col">
        <Header />
        <main className="flex-1 px-6 py-8 md:px-10">
          <div className="max-w-4xl mx-auto">
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
          <div className="max-w-4xl mx-auto">
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
          <div className="max-w-4xl mx-auto">
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
        <div className="max-w-4xl mx-auto">
          {/* Back Button */}
          <div className="mb-6">
            <Button variant="ghost" onClick={() => router.back()} className="p-0">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
          </div>

          {/* Profile Header */}
          <Card className="mb-8">
            <CardContent className="p-8">
              <div className="flex flex-col md:flex-row gap-6">
                {/* Profile Picture */}
                <div className="flex-shrink-0">
                  <Avatar className="h-32 w-32">
                    <AvatarImage 
                      src={profile.profile_image} 
                      alt={profile.name}
                      className="object-cover"
                    />
                    <AvatarFallback className="text-2xl">
                      {getInitials(profile.name || 'User')}
                    </AvatarFallback>
                  </Avatar>
                </div>

                {/* Profile Info */}
                <div className="flex-1 space-y-4">
                  <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <h1 className="text-3xl font-bold">{profile.name}</h1>
                        <VerificationBadge 
                          status={profile.verification_status || 'unverified'} 
                          size="sm"
                          showText={false}
                        />
                      </div>
                      <div className="flex items-center gap-2 text-muted-foreground mb-2">
                        <Badge variant="secondary" className="flex items-center gap-1">
                          {profile.user_type === 'individual' && <Users className="h-3 w-3" />}
                          {profile.user_type === 'company' && <Building className="h-3 w-3" />}
                          {profile.user_type === 'ngo' && <Building className="h-3 w-3" />}
                          {formatUserType(profile.user_type)}
                        </Badge>
                      </div>
                    </div>

                    {/* Edit Button (only for own profile) */}
                    {isOwnProfile && (
                      <Link href="/profile">
                        <Button variant="outline" className="flex items-center gap-2">
                          <Edit className="h-4 w-4" />
                          Edit Profile
                        </Button>
                      </Link>
                    )}
                  </div>

                  {/* Bio */}
                  {profile.bio && (
                    <p className="text-muted-foreground">{profile.bio}</p>
                  )}

                  {/* Location & Contact Info */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4">
                    {(profile.city || profile.state_province) && (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <MapPin className="h-4 w-4" />
                        <span>
                          {[profile.city, profile.state_province, profile.country]
                            .filter(Boolean)
                            .join(', ')}
                        </span>
                      </div>
                    )}

                    {profile.created_at && (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Calendar className="h-4 w-4" />
                        <span>
                          Joined {formatDistanceToNow(new Date(profile.created_at), { addSuffix: true })}
                        </span>
                      </div>
                    )}

                    {profile.phone && (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Phone className="h-4 w-4" />
                        <span>{profile.phone}</span>
                        {profile.phone_verified && (
                          <Badge variant="outline" className="text-xs">Verified</Badge>
                        )}
                      </div>
                    )}

                    {profile.email && (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Mail className="h-4 w-4" />
                        <span>{profile.email}</span>
                        {profile.email_verified && (
                          <Badge variant="outline" className="text-xs">Verified</Badge>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Detailed Information */}
          <div className="grid gap-6 md:grid-cols-2 mb-8">
            {/* Skills & Interests (for individuals) */}
            {profile.user_type === 'individual' && profile.profile_data && (
              <>
                {profile.profile_data.skills && (
                  <Card>
                    <CardHeader>
                      <CardTitle>Skills</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-muted-foreground">{profile.profile_data.skills}</p>
                    </CardContent>
                  </Card>
                )}

                {profile.profile_data.interests && (
                  <Card>
                    <CardHeader>
                      <CardTitle>Interests</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-muted-foreground">{profile.profile_data.interests}</p>
                    </CardContent>
                  </Card>
                )}

                {profile.profile_data.categories && (
                  <Card>
                    <CardHeader>
                      <CardTitle>Categories</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-muted-foreground">{profile.profile_data.categories}</p>
                    </CardContent>
                  </Card>
                )}
              </>
            )}

            {/* Organization Details (for NGOs) */}
            {profile.user_type === 'ngo' && profile.profile_data && (
              <>
                {profile.profile_data.registration_number && (
                  <Card>
                    <CardHeader>
                      <CardTitle>Registration Number</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-muted-foreground">{profile.profile_data.registration_number}</p>
                    </CardContent>
                  </Card>
                )}

                {profile.profile_data.founded_year && (
                  <Card>
                    <CardHeader>
                      <CardTitle>Founded</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-muted-foreground">{profile.profile_data.founded_year}</p>
                    </CardContent>
                  </Card>
                )}

                {profile.profile_data.focus_areas && (
                  <Card>
                    <CardHeader>
                      <CardTitle>Focus Areas</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-muted-foreground">{profile.profile_data.focus_areas}</p>
                    </CardContent>
                  </Card>
                )}

                {profile.profile_data.organization_website && (
                  <Card>
                    <CardHeader>
                      <CardTitle>Website</CardTitle>
                    </CardHeader>
                    <CardContent>
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
                    </CardContent>
                  </Card>
                )}
              </>
            )}

            {/* Company Details (for companies) */}
            {profile.user_type === 'company' && profile.profile_data && (
              <>
                {profile.profile_data.industry && (
                  <Card>
                    <CardHeader>
                      <CardTitle>Industry</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-muted-foreground">{profile.profile_data.industry}</p>
                    </CardContent>
                  </Card>
                )}

                {profile.profile_data.company_size && (
                  <Card>
                    <CardHeader>
                      <CardTitle>Company Size</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-muted-foreground">{profile.profile_data.company_size}</p>
                    </CardContent>
                  </Card>
                )}

                {profile.profile_data.company_website && (
                  <Card>
                    <CardHeader>
                      <CardTitle>Website</CardTitle>
                    </CardHeader>
                    <CardContent>
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
                    </CardContent>
                  </Card>
                )}
              </>
            )}
          </div>

          {/* Lifetime Posts */}
          <Card>
            <CardHeader>
              <CardTitle>Lifetime Posts</CardTitle>
              <CardContent className="px-0">
                <PostsFeed userId={profile.id} showAllPosts={true} />
              </CardContent>
            </CardHeader>
          </Card>
        </div>
      </main>
    </div>
  )
}