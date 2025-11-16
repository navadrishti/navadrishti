"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Header } from "@/components/header"
import { PostCreator } from "@/components/post-creator"
import { PostsFeed } from "@/components/posts-feed"
import { TrendingHashtags } from "@/components/trending-hashtags"
import { VerificationBadge } from "@/components/verification-badge"
import { 
  MapPin,
  Building,
  HandHeart,
  Loader2,
  TrendingUp
} from "lucide-react"
import { useAuth } from "@/lib/auth-context"
import { SkeletonListItem, SkeletonAvatarText } from '@/components/ui/skeleton'

interface UserStats {
  posts: number
  followers: number
  following: number
  impactScore: number
}

export default function HomePage() {
  const { user, token } = useAuth()
  const [suggestionsLoading, setSuggestionsLoading] = useState(true)
  const [suggestionsError, setSuggestionsError] = useState<string | null>(null)
  const [userStats, setUserStats] = useState<UserStats>({ posts: 0, followers: 0, following: 0, impactScore: 0 })
  const [suggestedUsers, setSuggestedUsers] = useState<any[]>([])
  const [refreshTrigger, setRefreshTrigger] = useState(0)

  // Generate initials for avatar fallback (same logic as header)
  const getInitials = (name: string) => {
    if (!name) return "U"
    const cleanName = name.trim()
    const names = cleanName.split(' ').filter(n => n.length > 0)
    
    if (names.length === 0) return "U"
    if (names.length === 1) return names[0].charAt(0).toUpperCase()
    
    // Return first letter of first name + first letter of last name
    const firstInitial = names[0].charAt(0).toUpperCase()
    const lastInitial = names[names.length - 1].charAt(0).toUpperCase()
    return firstInitial + lastInitial
  }

  // Fetch suggested users from database
  const fetchSuggestedUsers = async () => {
    setSuggestionsLoading(true)
    setSuggestionsError(null)
    try {
      if (user && token) {
        // Fetch real suggested users from database
        const response = await fetch('/api/users/suggestions?limit=4', {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          }
        })
        
        if (response.ok) {
          const result = await response.json()
          if (result.success) {
            setSuggestedUsers(result.data)
          } else {
            setSuggestedUsers([])
            setSuggestionsError(result.error || 'Failed to load suggestions')
          }
        } else if (response.status === 503) {
          setSuggestedUsers([])
          setSuggestionsError('Database is starting up. Please wait a few minutes.')
        } else {
          setSuggestedUsers([])
          setSuggestionsError('Failed to load suggestions')
        }
      } else {
        // For non-logged in users, fetch recent users (not just verified)
        const response = await fetch('/api/users/suggestions?limit=4')
        if (response.ok) {
          const result = await response.json()
          if (result.success) {
            setSuggestedUsers(result.data)
          } else {
            setSuggestedUsers([])
            setSuggestionsError(result.error || 'Failed to load suggestions')
          }
        } else if (response.status === 503) {
          setSuggestedUsers([])
          setSuggestionsError('Database is starting up. Please wait a few minutes.')
        } else {
          setSuggestedUsers([])
          setSuggestionsError('Failed to load suggestions')
        }
      }
    } catch (error: any) {
      setSuggestedUsers([])
      setSuggestionsError(error.message || 'Network error')
    } finally {
      setSuggestionsLoading(false)
    }
  }

  useEffect(() => {
    fetchSuggestedUsers()
  }, [user])

  const handlePostCreated = () => {
    setRefreshTrigger(prev => prev + 1)
    // Optionally update user stats here if needed
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      
      <div className="max-w-6xl mx-auto px-4 py-6 md:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          


          {/* Main Content - Posts Feed */}
          <div className="lg:col-span-2">
            
            {/* Create Post - Only show for authenticated users */}
            {user && <PostCreator onPostCreated={handlePostCreated} className="mb-6" />}

            {/* Posts Feed */}
            <PostsFeed refreshTrigger={refreshTrigger} />
          </div>

          {/* Right Sidebar - Trending & Suggestions */}
          <div className="hidden lg:block lg:col-span-1">
            
            {/* Enhanced Trending Hashtags Component */}
            <div className="mb-6">
              <TrendingHashtags 
                limit={5} 
                showDetails={true}
                onHashtagClick={(tag) => {
                  // Handle hashtag click - copy to clipboard as fallback
                  navigator.clipboard?.writeText(`#${tag}`)
                }}
              />
            </div>

            {/* Suggested Connections */}
            <Card>
              <CardHeader>
                <h4 className="font-semibold">Suggested for You</h4>
              </CardHeader>
              <CardContent className="space-y-4">
                {suggestionsLoading && (
                  <div className="space-y-3">
                    <SkeletonListItem />
                    <SkeletonListItem />
                    <SkeletonListItem />
                  </div>
                )}
                
                {suggestionsError && (
                  <div className="text-center py-4">
                    <div className="text-sm text-red-600 mb-2">{suggestionsError}</div>
                    <Button variant="outline" size="sm" onClick={fetchSuggestedUsers}>
                      Retry
                    </Button>
                  </div>
                )}
                
                {!suggestionsLoading && !suggestionsError && suggestedUsers.length > 0 && (
                  suggestedUsers.map((suggestedUser) => (
                    <div key={suggestedUser.id} className="flex items-center justify-between">
                      <Link href={`/profile/${suggestedUser.id}`} className="flex items-center gap-3 flex-1 min-w-0 hover:opacity-80 transition-opacity">
                        <Avatar className="w-10 h-10">
                          {suggestedUser.profile_image && (
                            <AvatarImage src={suggestedUser.profile_image} />
                          )}
                          <AvatarFallback className="bg-gradient-to-br from-blue-400 to-indigo-500 text-white font-semibold">
                            {getInitials(suggestedUser.name)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="font-medium text-sm truncate hover:text-blue-600 transition-colors">{suggestedUser.name}</p>
                            {suggestedUser.verification_status === 'verified' && (
                              <VerificationBadge status="verified" size="sm" showText={false} />
                            )}
                          </div>
                          <p className="text-xs text-gray-600 truncate capitalize">{suggestedUser.user_type}</p>
                          {suggestedUser.city && (
                          <p className="text-xs text-blue-600 truncate">
                            <MapPin className="w-3 h-3 inline mr-1" />
                            {suggestedUser.city}
                          </p>
                          )}
                        </div>
                      </Link>
                    </div>
                  ))
                )}

                {!suggestionsLoading && !suggestionsError && suggestedUsers.length === 0 && (
                  <div className="text-center py-8 text-gray-500">
                    <div className="text-sm">No suggestions available</div>
                    <div className="text-xs mt-1">Complete your profile to get personalized suggestions</div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}