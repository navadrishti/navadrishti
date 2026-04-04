"use client"

import { use, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import AnimatedHeart from '@/components/ui/animated-heart'
import { PostsFeed } from '@/components/posts-feed'
import Link from 'next/link'
import { ArrowLeft, Heart, MessageCircle, Share2, Eye, Loader2, Send } from 'lucide-react'
import { useAuth } from '@/lib/auth-context'
import { VerificationBadge } from '@/components/verification-badge'
import { Textarea } from '@/components/ui/textarea'

interface PostPageProps {
  params: Promise<{
    postId: string
  }>
}

interface Post {
  id: number
  content: string
  media_urls?: string[]
  tags?: string[]
  category?: string
  created_at: string
  published_at?: string
  reaction_count: number
  comment_count: number
  share_count: number
  view_count: number
  author: {
    id: number
    name: string
    profile_image?: string
    user_type: string
    verification_status?: string
  }
  user_interaction?: {
    has_liked: boolean
  }
}

interface PostComment {
  id: number
  content: string
  created_at: string
  author: {
    id: number
    name: string
    profile_image?: string
    user_type: string
    verification_status?: string
  }
}

export default function PostPage({ params }: PostPageProps) {
  const { postId } = use(params)
  const { user, token } = useAuth()
  const router = useRouter()
  const [post, setPost] = useState<Post | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isLiking, setIsLiking] = useState(false)
  const [isSharing, setIsSharing] = useState(false)
  const [showComments, setShowComments] = useState(false)
  const [comments, setComments] = useState<PostComment[]>([])
  const [commentsLoading, setCommentsLoading] = useState(false)
  const [commentText, setCommentText] = useState('')
  const [commentSubmitting, setCommentSubmitting] = useState(false)
  
  // Generate initials for avatar fallback
  const getInitials = (name: string) => {
    if (!name) return "U"
    const names = name.split(' ')
    if (names.length === 1) return names[0].charAt(0).toUpperCase()
    return (names[0].charAt(0) + names[names.length - 1].charAt(0)).toUpperCase()
  }

  const getTimeAgo = (dateString: string) => {
    const now = new Date()
    const past = new Date(dateString)
    const diffMs = now.getTime() - past.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMins / 60)
    const diffDays = Math.floor(diffHours / 24)

    if (diffMins < 1) return 'Just now'
    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    if (diffDays < 7) return `${diffDays}d ago`
    return past.toLocaleDateString()
  }

  const getUserRole = (userType: string) => {
    const roles: { [key: string]: string } = {
      individual: 'Individual',
      ngo: 'NGO',
      company: 'Company',
    }
    return roles[userType] || 'User'
  }

  useEffect(() => {
    const fetchPost = async () => {
      try {
        setLoading(true)
        setError(null)

        const headers: HeadersInit = {
          'Content-Type': 'application/json',
        }
        
        if (token) {
          headers['Authorization'] = `Bearer ${token}`
        }

        const response = await fetch(`/api/posts/${postId}`, { headers })
        const data = await response.json()

        if (!response.ok || !data.success) {
          setError(data.error || 'Failed to load post')
          return
        }

        setPost(data.post)
      } catch (err: any) {
        setError(err.message || 'An error occurred')
      } finally {
        setLoading(false)
      }
    }

    if (postId) {
      fetchPost()
    }
  }, [postId, token])

  const handleLike = async () => {
    if (!user || !token) {
      router.push('/login')
      return
    }

    if (isLiking || !post) return

    setIsLiking(true)
    
    // Optimistic update
    const wasLiked = post.user_interaction?.has_liked || false
    const prevReactionCount = post.reaction_count
    
    setPost(prev => prev ? {
      ...prev,
      reaction_count: wasLiked ? (prev.reaction_count - 1) : (prev.reaction_count + 1),
      user_interaction: {
        has_liked: !wasLiked
      }
    } : null)

    try {
      const response = await fetch(`/api/posts/${postId}/interact`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ action: 'like' })
      })

      if (!response.ok) {
        // Revert on error
        setPost(prev => prev ? {
          ...prev,
          reaction_count: prevReactionCount,
          user_interaction: {
            has_liked: wasLiked
          }
        } : null)
      } else {
        const result = await response.json()
        setPost(prev => prev ? {
          ...prev,
          reaction_count: result?.stats?.likes ?? prev.reaction_count,
          comment_count: result?.stats?.comments ?? prev.comment_count,
          share_count: result?.stats?.shares ?? prev.share_count,
          view_count: result?.stats?.views ?? prev.view_count,
          user_interaction: {
            has_liked: result?.user_interaction?.has_liked ?? prev.user_interaction?.has_liked ?? false
          }
        } : null)
      }
    } catch (err) {
      console.error('Error liking post:', err)
      // Revert on error
      setPost(prev => prev ? {
        ...prev,
        reaction_count: prevReactionCount,
        user_interaction: {
          has_liked: wasLiked
        }
      } : null)
    } finally {
      setIsLiking(false)
    }
  }

  const handleComment = () => {
    setShowComments((prev) => !prev)
  }

  useEffect(() => {
    const fetchComments = async () => {
      if (!showComments || !postId) return

      try {
        setCommentsLoading(true)
        const response = await fetch(`/api/posts/${postId}/comments`)
        const data = await response.json()

        if (response.ok) {
          setComments(data.comments || [])
        }
      } finally {
        setCommentsLoading(false)
      }
    }

    fetchComments()
  }, [showComments, postId])

  const submitComment = async () => {
    if (!user || !token || !commentText.trim() || !post) return

    try {
      setCommentSubmitting(true)
      const response = await fetch(`/api/posts/${postId}/comments`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ content: commentText.trim() })
      })

      if (response.ok) {
        setCommentText('')
        setShowComments(true)
        const refresh = await fetch(`/api/posts/${postId}/comments`)
        const result = await refresh.json()
        setComments(result.comments || [])
        setPost(prev => prev ? { ...prev, comment_count: (prev.comment_count || 0) + 1 } : prev)
      }
    } finally {
      setCommentSubmitting(false)
    }
  }

  const handleShare = async () => {
    if (!post || isSharing) return
    setIsSharing(true)

    const shareUrl = `${window.location.origin}/posts/${postId}`

    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(shareUrl)
      }

      const headers: Record<string, string> = {
        'Content-Type': 'application/json'
      }

      if (token) {
        headers['Authorization'] = `Bearer ${token}`
      }

      const response = await fetch(`/api/posts/${postId}/interact`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ action: 'share' })
      })

      if (response.ok) {
        const result = await response.json()
        setPost(prev => prev ? {
          ...prev,
          reaction_count: result?.stats?.likes ?? prev.reaction_count,
          comment_count: result?.stats?.comments ?? prev.comment_count,
          share_count: result?.stats?.shares ?? prev.share_count,
          view_count: result?.stats?.views ?? prev.view_count
        } : null)
      }
    } catch {
      // Keep silent for now; copy/share fallbacks are best-effort.
    } finally {
      setIsSharing(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    )
  }

  if (error || !post) {
    return (
      <div className="min-h-screen bg-gray-50">
        <header className="border-b bg-white">
          <div className="container mx-auto px-4 py-4">
            <button
              type="button"
              onClick={() => router.back()}
              className="inline-flex items-center text-sm font-medium text-gray-600 hover:text-gray-900"
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </button>
          </div>
        </header>
        <main className="container mx-auto px-4 py-8 max-w-2xl">
          <Card>
            <CardContent className="pt-6 text-center py-12">
              <p className="text-red-600 mb-4">{error || 'Post not found'}</p>
              <Button onClick={() => router.back()} className="hover:bg-transparent active:bg-transparent focus-visible:bg-transparent focus-visible:ring-0">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back
              </Button>
            </CardContent>
          </Card>
        </main>
      </div>
    )
  }

  const timeAgo = getTimeAgo(post.created_at || post.published_at || new Date().toISOString())

  return (
    <div className="relative min-h-screen overflow-hidden bg-slate-100">
      {/* Blurred live feed background focused on current post */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden select-none">
        <div className="mx-auto max-w-6xl px-4 py-24 md:px-6 lg:px-8">
          <div className="scale-[1.02] opacity-80 [filter:blur(8px)]">
            <PostsFeed focusPostId={post.id} />
          </div>
        </div>
      </div>
      <div className="pointer-events-none absolute inset-0 bg-slate-100/72" />

      {/* Header with back navigation */}
      <header className="relative z-10 border-b border-slate-200 bg-white/70 backdrop-blur-xl">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center">
            <button
              type="button"
              aria-label="Back to feed"
              onClick={() => router.push(`/home?focusPost=${post.id}#post-${post.id}`)}
              className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-300 bg-white/80 text-slate-700 transition-colors hover:bg-white hover:text-slate-900"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Post content */}
      <main className="relative z-10 container mx-auto px-4 py-8 max-w-2xl">
        <Card className="overflow-hidden rounded-2xl border-2 border-blue-300 bg-white shadow-xl">
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between">
              <Link href={`/profile/${post.author.id}`} className="flex items-center space-x-3 hover:opacity-80 transition-opacity">
                <Avatar className="w-12 h-12">
                  {post.author.profile_image && (
                    <AvatarImage 
                      src={post.author.profile_image} 
                      alt={post.author.name} 
                    />
                  )}
                  <AvatarFallback className="bg-blue-600 text-white font-semibold">{getInitials(post.author.name)}</AvatarFallback>
                </Avatar>
                <div>
                  <div className="flex items-center space-x-2">
                    <h3 className="font-medium">{post.author.name}</h3>
                    {post.author.verification_status === 'verified' && (
                      <VerificationBadge status="verified" size="sm" showText={false} />
                    )}
                  </div>
                  <p className="text-sm text-slate-600">
                    {getUserRole(post.author.user_type)} • {timeAgo}
                  </p>
                </div>
              </Link>
              
              {post.category && (
                <Badge variant="outline" className="text-xs">
                  {post.category}
                </Badge>
              )}
            </div>
          </CardHeader>

          <CardContent className="space-y-4">
            {/* Post content */}
            <div className="prose prose-sm max-w-none">
              <p className="whitespace-pre-wrap text-slate-900 leading-7">{post.content}</p>
            </div>

            {/* Media */}
            {post.media_urls && post.media_urls.length > 0 && (
              <div className="rounded-lg overflow-hidden">
                <img
                  src={post.media_urls[0]}
                  alt="Post media"
                  className="w-full h-auto object-cover"
                />
              </div>
            )}

            {/* Tags */}
            {post.tags && post.tags.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {post.tags.map((tag, index) => (
                  <Badge key={index} variant="secondary" className="text-xs">
                    #{tag}
                  </Badge>
                ))}
              </div>
            )}

            {/* Interaction stats and buttons */}
            <div className="pt-4 border-t border-slate-200 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-6 text-sm text-slate-600">
                  <button
                    type="button"
                    onClick={handleLike}
                    disabled={isLiking}
                    className="flex items-center gap-2 rounded-md transition-colors hover:text-red-500 disabled:cursor-not-allowed"
                  >
                    <AnimatedHeart
                      isLiked={Boolean(post.user_interaction?.has_liked)}
                      onToggle={handleLike}
                      size={18}
                      className="cursor-pointer"
                    />
                    <span>{post.reaction_count || 0}</span>
                  </button>
                  <div className="flex items-center space-x-1">
                    <MessageCircle className="w-4 h-4" />
                    <span>{post.comment_count || 0}</span>
                  </div>
                  <div className="flex items-center space-x-1">
                    <Share2 className="w-4 h-4" />
                    <span>{post.share_count || 0}</span>
                  </div>
                  <div className="flex items-center space-x-1">
                    <Eye className="w-4 h-4" />
                    <span>{post.view_count || 0}</span>
                  </div>
                </div>
              </div>

              {/* Action buttons */}
              {user ? (
                <div className="flex items-center gap-2 pt-2 border-t">
                  <Button
                    variant={post.user_interaction?.has_liked ? "default" : "outline"}
                    size="sm"
                    onClick={handleLike}
                    disabled={isLiking}
                    className="flex-1"
                  >
                    <Heart className={`w-4 h-4 mr-2 ${post.user_interaction?.has_liked ? 'fill-current' : ''}`} />
                    {post.user_interaction?.has_liked ? 'Liked' : 'Like'}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleComment}
                    className="flex-1"
                  >
                    <MessageCircle className="w-4 h-4 mr-2" />
                    Comment
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleShare}
                    disabled={isSharing}
                    className="flex-1"
                  >
                    <Share2 className="w-4 h-4 mr-2" />
                    {isSharing ? 'Sharing...' : 'Share'}
                  </Button>
                </div>
              ) : (
                <div className="text-center pt-2 border-t">
                  <p className="text-sm text-gray-600 mb-4">
                    Join the conversation on Navadrishti
                  </p>
                  <div className="flex gap-4 justify-center">
                    <Link href="/login">
                      <Button size="sm">
                        Sign In
                      </Button>
                    </Link>
                    <Link href="/register">
                      <Button variant="outline" size="sm">
                        Sign Up
                      </Button>
                    </Link>
                  </div>
                </div>
              )}

              {showComments && (
                <div className="pt-4 border-t border-slate-200 space-y-4">
                  <h4 className="text-sm font-semibold text-slate-900">Comments</h4>

                  {commentsLoading ? (
                    <div className="space-y-3">
                      <div className="h-16 rounded-xl bg-slate-100 animate-pulse" />
                      <div className="h-16 rounded-xl bg-slate-100 animate-pulse" />
                    </div>
                  ) : comments.length > 0 ? (
                    <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
                      {comments.map((comment) => (
                        <div key={comment.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                          <div className="mb-1 flex items-center gap-2">
                            <span className="text-sm font-medium text-slate-900">{comment.author?.name}</span>
                            <span className="text-xs text-slate-500">{getTimeAgo(comment.created_at)}</span>
                          </div>
                          <p className="text-sm text-slate-700 whitespace-pre-wrap">{comment.content}</p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-slate-500">No comments yet.</p>
                  )}

                  {user ? (
                    <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-3">
                      <Textarea
                        value={commentText}
                        onChange={(e) => setCommentText(e.target.value)}
                        placeholder="Write a comment..."
                        className="min-h-[90px] resize-none"
                      />
                      <div className="flex justify-end">
                        <Button onClick={submitComment} disabled={commentSubmitting || !commentText.trim()}>
                          <Send className="mr-2 h-4 w-4" />
                          {commentSubmitting ? 'Posting...' : 'Post Comment'}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-600">
                      Sign in to post a comment.
                    </div>
                  )}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  )
}