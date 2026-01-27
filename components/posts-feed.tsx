'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useAuth, User } from '@/lib/auth-context';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast as sonnerToast } from 'sonner';
import { 
  MessageCircle, 
  Share2, 
  MapPin, 
  MoreHorizontal,
  Eye,
  Send,
  Edit3,
  Trash2,
  Save,
  X
} from 'lucide-react';
import AnimatedHeart from '@/components/ui/animated-heart';
import { VerificationBadge } from './verification-badge';
import Image from 'next/image';
import { formatDistanceToNow } from 'date-fns';
import { Textarea } from '@/components/ui/textarea';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface Post {
  id: number;
  content: string | null;
  images: { url: string; width: number; height: number; }[] | null;
  location: string | null;
  created_at: string;
  user_id: number;
  user: {
    name: string;
    email: string;
    profile_image?: string;
    user_type: string;
    verification_status?: string;
  };
  hashtags: string[];
  stats: {
    likes: number;
    comments: number;
    shares: number;
    views: number;
  };
  user_interaction: {
    has_liked: boolean;
    has_shared: boolean;
  };
}

interface PostsFeedProps {
  userId?: number;
  limit?: number;
  refreshTrigger?: number;
  showAllPosts?: boolean;
}

export function PostsFeed({ userId, limit = 10, refreshTrigger, showAllPosts = false }: PostsFeedProps) {
  const { user, token } = useAuth();
  
  // Generate initials for avatar fallback
  const getInitials = (name: string) => {
    if (!name) return "U"
    const names = name.split(' ')
    if (names.length === 1) return names[0].charAt(0).toUpperCase()
    return (names[0].charAt(0) + names[names.length - 1].charAt(0)).toUpperCase()
  }
  
  // Fixed: All toast notifications now use sonner
  const [posts, setPosts] = useState<Post[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [page, setPage] = useState(1);
  const [showAuthBanner, setShowAuthBanner] = useState(false);
  const [expandedComments, setExpandedComments] = useState<Set<number>>(new Set());
  const [commentInputs, setCommentInputs] = useState<Record<number, string>>({});
  const [postComments, setPostComments] = useState<Record<number, any[]>>({});
  const [viewedPosts, setViewedPosts] = useState<Set<number>>(new Set());
  const [editingPost, setEditingPost] = useState<number | null>(null);
  const [editContent, setEditContent] = useState<string>('');
  const [deletingPost, setDeletingPost] = useState<number | null>(null);
  const [actionLoading, setActionLoading] = useState<Record<number, boolean>>({});

  // Fetch posts with proper stats visible to all users
  const fetchPosts = useCallback(async (pageNum = 1, reset = false) => {
    try {
      const params = new URLSearchParams({
        page: pageNum.toString(),
        limit: showAllPosts ? '1000' : limit.toString() // Fetch all posts for public profile
      });

      if (userId) {
        params.append('userId', userId.toString());
      }

      const headers: Record<string, string> = {
        'Content-Type': 'application/json'
      };

      // Only add authorization header if user is logged in
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const response = await fetch(`/api/posts?${params}`, { headers });

      if (!response.ok) {
        throw new Error('Failed to fetch posts');
      }

      const result = await response.json();
      const newPosts = result.data || [];

      // Ensure all stats are properly visible to everyone
      const processedPosts = newPosts.map((post: any) => ({
        ...post,
        stats: {
          likes: post.stats?.likes || 0,
          comments: post.stats?.comments || 0, 
          shares: post.stats?.shares || 0,
          views: post.stats?.views || 0
        },
        user_interaction: {
          has_liked: post.user_interaction?.has_liked || false,
          has_shared: post.user_interaction?.has_shared || false
        }
      }));

      if (reset || pageNum === 1) {
        setPosts(processedPosts);
      } else {
        setPosts(prev => [...prev, ...processedPosts]);
      }

      // Don't load more if showing all posts or if we got fewer posts than the limit
      setHasMore(!showAllPosts && processedPosts.length === limit);
      setPage(pageNum);
    } catch (error) {
      console.error('Error fetching posts:', error);
      sonnerToast.error("Error", {
        description: "Failed to load posts."
      });
    } finally {
      setIsLoading(false);
      setIsLoadingMore(false);
    }
  }, [token, userId, limit, showAllPosts]);

  // Load more posts
  const loadMore = () => {
    if (!isLoadingMore && hasMore) {
      setIsLoadingMore(true);
      fetchPosts(page + 1, false);
    }
  };

  // Handle post interaction
  // Fallback share function with proper tracking
  const showShareFallback = async (url: string, postId: number) => {
    // Try to select and copy using execCommand (older browsers)
    try {
      const textArea = document.createElement('textarea');
      textArea.value = url;
      textArea.style.position = 'fixed';
      textArea.style.opacity = '0';
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      
      const successful = document.execCommand('copy');
      document.body.removeChild(textArea);
      
      if (successful) {
        sonnerToast.success("🔗 Link Copied!", {
          description: "Post link copied to clipboard. Share it anywhere!",
          duration: 3000
        });
        
        // Track share in database - but prevent duplicates for both user types
        try {
          // For anonymous users, check localStorage to prevent duplicate counting
          if (!user || !token) {
            const shareKey = `shared_post_${postId}`;
            const hasShared = localStorage.getItem(shareKey);
            
            if (hasShared) {
              // User has already shared this post, don't increment counter
              return;
            }
            
            // Mark as shared in localStorage
            localStorage.setItem(shareKey, 'true');
          }
          
          // Wait 20 seconds before actually tracking the share
          setTimeout(async () => {
            try {
              const headers: { [key: string]: string } = {
                'Content-Type': 'application/json'
              };
              
              // Add auth header only if user is logged in
              if (user && token) {
                headers['Authorization'] = `Bearer ${token}`;
              }
              
              const response = await fetch(`/api/posts/${postId}/interact`, {
                method: 'POST',
                headers,
                body: JSON.stringify({ action: 'share' })
              });

              if (response.ok) {
                const result = await response.json();
                
                // Only update UI if share was successfully counted
                if (result.success) {
                  setPosts(prev => prev.map(post => 
                    post.id === postId 
                      ? {
                          ...post,
                          stats: {
                            likes: result.stats.likes,
                            comments: result.stats.comments,
                            shares: result.stats.shares,
                            views: result.stats.views
                          },
                          user_interaction: {
                            has_liked: result.user_interaction?.has_liked || false,
                            has_shared: result.user_interaction?.has_shared || true
                          }
                        }
                      : post
                  ));
                }
              } else {
                // If authenticated user has already shared, remove from localStorage for anonymous case
                if (!user || !token) {
                  localStorage.removeItem(`shared_post_${postId}`);
                }
              }
            } catch (error) {
              // Remove localStorage entry if tracking failed
              if (!user || !token) {
                localStorage.removeItem(`shared_post_${postId}`);
              }
            }
          }, 20000); // 20-second delay before tracking share
        } catch (error) {
          // Error in fallback execution
          console.error('Share tracking error:', error);
        }
      } else {
        throw new Error('execCommand failed');
      }
    } catch (error) {
      // Final fallback - just show the URL  
      sonnerToast.info("Share This Post", {
        description: `Copy this link: ${url}`,
        duration: 8000
      });
    }
  };

  const handleInteraction = async (postId: number, type: 'like' | 'share' | 'view' | 'comment') => {
    // For like and comment, require authentication
    if ((type === 'like' || type === 'comment') && (!user || !token)) {
      setShowAuthBanner(true);
      sonnerToast.error("Authentication Required", {
        description: "Please sign in to " + (type === 'like' ? 'like' : 'comment on') + " this post",
        duration: 4000
      });
      setTimeout(() => setShowAuthBanner(false), 3000);
      return;
    }

    // Handle sharing - allow for everyone, track for all users
    if (type === 'share') {
      const shareUrl = `${window.location.origin}/posts/${postId}`;
      
      // Always allow copying the link (both authenticated and anonymous users)
      if (navigator.clipboard && window.isSecureContext) {
        try {
          await navigator.clipboard.writeText(shareUrl);
          
          // Show success toast for every copy
          sonnerToast.success("🔗 Link Copied!", {
            description: "Post link copied to clipboard. Share it anywhere!",
            duration: 3000
          });
          
          // Track share in database - but prevent duplicates for both user types
          // For anonymous users, check localStorage to prevent duplicate counting
          if (!user || !token) {
            const shareKey = `shared_post_${postId}`;
            const hasShared = localStorage.getItem(shareKey);
            
            if (hasShared) {
              // User has already shared this post, don't increment counter
              return;
            }
            
            // Mark as shared in localStorage
            localStorage.setItem(shareKey, 'true');
          }
          
          const headers: { [key: string]: string } = {
            'Content-Type': 'application/json'
          };
          
          // Add auth header only if user is logged in
          if (user && token) {
            headers['Authorization'] = `Bearer ${token}`;
          }
          
          // Wait 20 seconds before tracking the share and updating UI
          setTimeout(async () => {
            try {
              const response = await fetch(`/api/posts/${postId}/interact`, {
                method: 'POST',
                headers,
                body: JSON.stringify({ action: 'share' })
              });
              
              if (response.ok) {
                const result = await response.json();
                
                // Only update UI if share was successfully counted
                if (result.success) {
                  setPosts(prev => prev.map(post => 
                    post.id === postId 
                      ? {
                          ...post,
                          stats: {
                            likes: result.stats.likes,
                            comments: result.stats.comments,
                            shares: result.stats.shares,
                            views: result.stats.views
                          },
                          user_interaction: {
                            has_liked: result.user_interaction?.has_liked || false,
                            has_shared: true
                          }
                        }
                      : post
                  ));
                }
              } else {
                // If authenticated user has already shared, remove from localStorage for anonymous case
                if (!user || !token) {
                  localStorage.removeItem(`shared_post_${postId}`);
                }
              }
            } catch (error) {
              console.log('Share tracking error:', error);
              if (!user || !token) {
                localStorage.removeItem(`shared_post_${postId}`);
              }
            }
          }, 20000); // 20-second delay
          
        } catch (error) {
          // Fallback to manual copy
          showShareFallback(shareUrl, postId);
        }
      } else {
        showShareFallback(shareUrl, postId);
      }
      return;
    }

    // Handle comment navigation
    if (type === 'comment') {
      // Toggle comment section visibility
      setExpandedComments(prev => {
        const newSet = new Set(prev);
        if (newSet.has(postId)) {
          newSet.delete(postId);
        } else {
          newSet.add(postId);
          // Load comments when expanding
          fetchCommentsForPost(postId);
        }
        return newSet;
      });
      return;
    }

    // Handle like interaction with full stats update
    if (type === 'like') {
      try {
        const response = await fetch(`/api/posts/${postId}/interact`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ action: 'like' })
        });
        
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to like post');
        }

        const result = await response.json();

        // Update post with complete stats visible to all users
        setPosts(prev => prev.map(post => 
          post.id === postId 
            ? {
                ...post,
                stats: {
                  likes: result.stats.likes,
                  comments: result.stats.comments, 
                  shares: result.stats.shares,
                  views: result.stats.views
                },
                user_interaction: {
                  has_liked: result.user_interaction.has_liked,
                  has_shared: result.user_interaction.has_shared
                }
              }
            : post
        ));

      } catch (error) {
        sonnerToast.error("Error", {
          description: "Failed to like post. Please try again."
        });
      }
    }

    // Handle view tracking (silent)
    if (type === 'view' && user && token) {
      try {
        const response = await fetch(`/api/posts/${postId}/interact`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ action: 'view' })
        });
        
        if (response.ok) {
          const result = await response.json();
          // Update view count in UI
          setPosts(prev => prev.map(post => 
            post.id === postId 
              ? {
                  ...post,
                  stats: {
                    ...post.stats,
                    views: result.stats?.views || post.stats.views + 1
                  }
                }
              : post
          ));
        }
      } catch (error) {
        // Silent fail for view tracking
      }
    }
  };

  // Automatic view tracking function (production optimized)
  const trackPostView = useCallback(async (postId: number) => {
    // Check if we've already tracked this post in this session (for any user state)
    const sessionKey = user ? `view_tracked_${postId}_${user.id}` : `view_tracked_${postId}_anonymous`;
    if (sessionStorage.getItem(sessionKey)) {
      return;
    }

    // Mark as tracked in session storage immediately to prevent race conditions
    sessionStorage.setItem(sessionKey, Date.now().toString());

    // Wait 20 seconds before actually tracking the view
    await new Promise(resolve => setTimeout(resolve, 20000));

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json'
      };
      
      if (user && token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const response = await fetch(`/api/posts/${postId}/interact`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ action: 'view' }),
        // Add timeout for production
        signal: AbortSignal.timeout(5000)
      });
      
      if (response.ok) {
        const result = await response.json();
        
        // Update post stats optimistically
        setPosts(prev => 
          prev.map(post => 
            post.id === postId 
              ? {
                  ...post,
                  stats: {
                    ...post.stats,
                    views: result.stats?.views || post.stats.views + 1
                  }
                }
              : post
          )
        );
      } else {
        sessionStorage.removeItem(sessionKey);
      }
    } catch (error) {
      sessionStorage.removeItem(sessionKey);
    }
  }, [user, token, viewedPosts]);

  // Handle post deletion
  const handleDeletePost = async (postId: number) => {
    if (!user || !token) {
      sonnerToast.error("Authentication Required", {
        description: "Please log in to delete posts"
      });
      return;
    }

    setActionLoading(prev => ({ ...prev, [postId]: true }));
    
    try {
      const response = await fetch(`/api/posts/${postId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to delete post');
      }

      // Remove post from local state (optimistic update)
      setPosts(prev => prev.filter(post => post.id !== postId));
      
      sonnerToast.success("Post Deleted", {
        description: "Your post has been successfully deleted.",
        duration: 3000
      });
    } catch (error: any) {
      console.error('Delete post error:', error);
      sonnerToast.error("Delete Failed", {
        description: error.message || "Failed to delete post. Please try again.",
        duration: 4000
      });
    } finally {
      setActionLoading(prev => ({ ...prev, [postId]: false }));
      setDeletingPost(null);
    }
  };

  // Handle post editing
  const handleEditPost = async (postId: number) => {
    if (!user || !token || !editContent.trim()) {
      if (!editContent.trim()) {
        sonnerToast.error("Validation Error", {
          description: "Post content cannot be empty"
        });
      }
      return;
    }

    setActionLoading(prev => ({ ...prev, [postId]: true }));
    
    try {
      const response = await fetch(`/api/posts/${postId}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ content: editContent.trim() })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to update post');
      }

      const updatedPost = await response.json();
      
      // Update post in local state (optimistic update)
      setPosts(prev => prev.map(post => 
        post.id === postId 
          ? { ...post, content: editContent.trim() }
          : post
      ));
      
      setEditingPost(null);
      setEditContent('');
      
      sonnerToast.success("Post Updated", {
        description: "Your post has been successfully updated.",
        duration: 3000
      });
    } catch (error: any) {
      console.error('Edit post error:', error);
      sonnerToast.error("Update Failed", {
        description: error.message || "Failed to update post. Please try again.",
        duration: 4000
      });
    } finally {
      setActionLoading(prev => ({ ...prev, [postId]: false }));
    }
  };

  // Start editing a post
  const startEditingPost = (post: Post) => {
    setEditingPost(post.id);
    setEditContent(post.content || '');
  };

  // Cancel editing
  const cancelEditing = () => {
    setEditingPost(null);
    setEditContent('');
  };

  // Fetch comments for a specific post
  const fetchCommentsForPost = async (postId: number) => {
    try {
      const response = await fetch(`/api/posts/${postId}/comments`);
      if (response.ok) {
        const result = await response.json();
        setPostComments(prev => ({
          ...prev,
          [postId]: result.comments || []
        }));
      }
    } catch (error) {
      // Silent fail
    }
  };

  // Handle comment submission
  const handleCommentSubmit = async (postId: number) => {
    const commentText = commentInputs[postId]?.trim();
    if (!commentText || !token) {
      if (!token) {
        sonnerToast.error("Authentication Required", {
          description: "Please log in to post comments"
        });
      }
      return;
    }

    try {
      const response = await fetch(`/api/posts/${postId}/comments`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ content: commentText })
      });

      if (response.ok) {
        // Clear input
        setCommentInputs(prev => ({ ...prev, [postId]: '' }));
        // Refresh comments
        await fetchCommentsForPost(postId);
        // Refresh posts to show updated comment count
        fetchPosts(1, true);
        sonnerToast.success("Comment Posted!", {
          description: "Your comment has been added successfully."
        });
      } else if (response.status === 401) {
        sonnerToast.error("Authentication Error", {
          description: "Your session has expired. Please log in again."
        });
        // Could trigger a logout here
      } else {
        const errorData = await response.json();
        sonnerToast.error("Error", {
          description: errorData.error || "Failed to post comment"
        });
      }
    } catch (error) {
      console.error('Comment submission error:', error);
      sonnerToast.error("Network Error", {
        description: "Failed to post comment. Please check your connection."
      });
    }
  };

  // Handle comment input change
  const handleCommentInputChange = (postId: number, value: string) => {
    setCommentInputs(prev => ({ ...prev, [postId]: value }));
  };

  // Track post view
  const trackView = useCallback((postId: number) => {
    handleInteraction(postId, 'view');
  }, []);

  // Initial load and refresh trigger
  useEffect(() => {
    // Clear view tracking session storage on fresh load
    Object.keys(sessionStorage).forEach(key => {
      if (key.startsWith('view_tracked_')) {
        sessionStorage.removeItem(key);
      }
    });
    
    fetchPosts(1, true);
  }, [fetchPosts, refreshTrigger]);

  if (isLoading) {
    return (
      <div className="space-y-6">
        {Array.from({ length: 3 }).map((_, i) => (
          <Card key={i} className="animate-pulse">
            <CardHeader className="pb-3">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 bg-muted rounded-full" />
                <div className="space-y-2 flex-1">
                  <div className="w-32 h-4 bg-muted rounded" />
                  <div className="w-24 h-3 bg-muted rounded" />
                </div>
                <div className="w-8 h-8 bg-muted rounded" />
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <div className="w-full h-4 bg-muted rounded" />
                <div className="w-4/5 h-4 bg-muted rounded" />
                <div className="w-3/5 h-4 bg-muted rounded" />
              </div>
              <div className="w-full h-48 bg-muted rounded-lg" />
              <div className="flex items-center justify-between pt-2">
                <div className="flex gap-4">
                  <div className="w-16 h-6 bg-muted rounded" />
                  <div className="w-16 h-6 bg-muted rounded" />
                  <div className="w-16 h-6 bg-muted rounded" />
                </div>
                <div className="w-20 h-4 bg-muted rounded" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Authentication Banner */}
      {showAuthBanner && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4 animate-in slide-in-from-top duration-300">
          <div className="flex items-center space-x-2">
            <div className="text-blue-600">
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="text-sm text-blue-800">
              <strong>Please sign in</strong> to like/comment this post
            </div>
          </div>
        </div>
      )}
      
      {posts.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-muted-foreground">
              {userId 
                ? "No posts found for this user." 
                : "No posts yet. Be the first to share something with the community!"
              }
            </p>
            {!user && (
              <div className="mt-4">
                <Button asChild>
                  <Link href="/login">Sign In to Post</Link>
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
        posts.map((post, index) => (
          <PostCard
            key={post.id}
            post={post}
            postIndex={index}
            onInteraction={handleInteraction}
            onView={trackPostView}
            currentUserId={user?.id}
            isAuthenticated={!!user && !!token}
            showComments={expandedComments.has(post.id)}
            onEdit={() => startEditingPost(post)}
            onDelete={() => setDeletingPost(post.id)}
            isEditing={editingPost === post.id}
            editContent={editContent}
            onEditContentChange={setEditContent}
            onSaveEdit={() => handleEditPost(post.id)}
            onCancelEdit={cancelEditing}
            isLoading={actionLoading[post.id] || false}
            comments={postComments[post.id] || []}
            commentInput={commentInputs[post.id] || ''}
            onCommentInputChange={(value) => handleCommentInputChange(post.id, value)}
            onCommentSubmit={() => handleCommentSubmit(post.id)}
            currentUser={user}
          />
        ))
      )}

      {hasMore && (
        <div className="text-center py-4">
          <Button
            onClick={loadMore}
            disabled={isLoadingMore}
            variant="outline"
          >
            {isLoadingMore ? "Loading..." : "Load More"}
          </Button>
        </div>
      )}
      
      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deletingPost} onOpenChange={(open) => !open && setDeletingPost(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Post</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this post? This action cannot be undone and will permanently remove the post and all its interactions.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={actionLoading[deletingPost || 0]}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deletingPost && handleDeletePost(deletingPost)}
              disabled={actionLoading[deletingPost || 0]}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {actionLoading[deletingPost || 0] ? 'Deleting...' : 'Delete Post'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

interface PostCardProps {
  post: Post;
  postIndex: number;
  onInteraction: (postId: number, type: 'like' | 'share' | 'view' | 'comment') => void;
  onView: (postId: number) => void;
  currentUserId?: number;
  isAuthenticated?: boolean;
  showComments?: boolean;
  comments?: any[];
  commentInput?: string;
  onCommentInputChange?: (value: string) => void;
  onCommentSubmit?: () => void;
  currentUser?: User | null;
  onEdit?: () => void;
  onDelete?: () => void;
  isEditing?: boolean;
  editContent?: string;
  onEditContentChange?: (content: string) => void;
  onSaveEdit?: () => void;
  onCancelEdit?: () => void;
  isLoading?: boolean;
}

function PostCard({
  post,
  postIndex,
  onInteraction,
  onView,
  currentUserId, 
  isAuthenticated,
  showComments = false,
  comments = [],
  commentInput = '',
  onCommentInputChange,
  onCommentSubmit,
  currentUser,
  onEdit,
  onDelete,
  isEditing = false,
  editContent = '',
  onEditContentChange,
  onSaveEdit,
  onCancelEdit,
  isLoading = false
}: PostCardProps) {
  const [hasViewed, setHasViewed] = useState(false);

  // Generate initials for avatar fallback
  const getInitials = (name: string) => {
    if (!name) return "U"
    const names = name.split(' ')
    if (names.length === 1) return names[0].charAt(0).toUpperCase()
    return (names[0].charAt(0) + names[names.length - 1].charAt(0)).toUpperCase()
  }

  // Function to highlight hashtags in content
  const highlightHashtags = (content: string) => {
    const hashtagRegex = /#([a-zA-Z0-9_]+)/g;
    const parts = content.split(hashtagRegex);
    
    return parts.map((part, index) => {
      if (index % 2 === 1) {
        // This is a hashtag
        return (
          <span 
            key={index} 
            className="text-blue-600 font-medium"
          >
            #{part}
          </span>
        );
      }
      return part;
    });
  };

  // Track view when post comes into view
  useEffect(() => {
    // Track views for all users (authenticated and anonymous)
    if (!hasViewed) {
      const observer = new IntersectionObserver(
        (entries) => {
          const entry = entries[0];
          // Only count as viewed when post is 80% visible (user has scrolled through most of it)
          if (entry.isIntersecting && entry.intersectionRatio >= 0.8) {
            setHasViewed(true);
            onView(post.id);
            observer.disconnect();
          }
        },
        { 
          threshold: 0.8, // Trigger when 80% of the post is visible
          rootMargin: '-50px 0px -50px 0px' // Add some margin to ensure user actually scrolled past
        }
      );

      const element = document.getElementById(`post-${post.id}`);
      if (element) {
        observer.observe(element);
      }

      return () => observer.disconnect();
    }
  }, [hasViewed, currentUserId, post.user_id, post.id, onView]);

  return (
    <Card id={`post-${post.id}`} className="overflow-hidden">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <Link href={`/profile/${post.user_id}`} className="flex items-center space-x-3 hover:opacity-80 transition-opacity cursor-pointer">
            <Avatar className="w-10 h-10">
              {(() => {
                const img = post.user.profile_image;
                // Only show image if it's a legitimate uploaded photo URL
                const isRealImage = img && 
                  typeof img === 'string' && 
                  img.length > 10 && 
                  img.startsWith('https://') && 
                  (img.includes('cloudinary') || img.includes('amazonaws') || img.includes('googleapis') || img.includes('imgur')) &&
                  !img.includes('placeholder') && 
                  !img.includes('default') &&
                  !img.includes('avatar') &&
                  !img.includes('profile-placeholder');
                
                return isRealImage ? (
                  <AvatarImage 
                    src={img} 
                    alt={post.user.name} 
                    onError={(e) => e.currentTarget.style.display = 'none'}
                  />
                ) : null;
              })()}
              <AvatarFallback className="bg-gradient-to-br from-blue-400 to-indigo-500 text-white font-semibold">
                {getInitials(post.user.name || post.user.email || 'U')}
              </AvatarFallback>
            </Avatar>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-sm hover:text-blue-600 transition-colors">{post.user.name}</h3>
                {post.user.verification_status === 'verified' && (
                  <VerificationBadge status="verified" size="sm" showText={false} />
                )}
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="capitalize">{post.user.user_type}</span>
                <span>•</span>
                <span>
                  {(() => {
                    try {
                      const date = new Date(post.created_at);
                      if (isNaN(date.getTime())) {
                        return 'just now';
                      }
                      return formatDistanceToNow(date) + ' ago';
                    } catch (error) {
                      return 'just now';
                    }
                  })()} 
                </span>
              </div>
            </div>
          </Link>
          {currentUserId === post.user_id && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button 
                  size="icon" 
                  variant="ghost" 
                  className="w-8 h-8 hover:bg-muted/50" 
                  disabled={isLoading}
                >
                  <MoreHorizontal className="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-32">
                <DropdownMenuItem 
                  onClick={onEdit}
                  disabled={isLoading || isEditing}
                  className="cursor-pointer"
                >
                  <Edit3 className="w-4 h-4 mr-2" />
                  Edit
                </DropdownMenuItem>
                <DropdownMenuItem 
                  onClick={onDelete}
                  disabled={isLoading}
                  className="cursor-pointer text-destructive focus:text-destructive"
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        {/* Content with highlighted hashtags */}
        {post.content && (
          <div className="space-y-2">
            {isEditing ? (
              <div className="space-y-3">
                <Textarea
                  value={editContent}
                  onChange={(e) => onEditContentChange?.(e.target.value)}
                  placeholder="Edit your post content..."
                  className="min-h-[80px] resize-none"
                  disabled={isLoading}
                />
                <div className="flex gap-2 justify-end">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={onCancelEdit}
                    disabled={isLoading}
                  >
                    <X className="w-3 h-3 mr-1" />
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    onClick={onSaveEdit}
                    disabled={isLoading || !editContent.trim()}
                  >
                    {isLoading ? (
                      <div className="flex items-center gap-1">
                        <div className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" />
                        Saving...
                      </div>
                    ) : (
                      <div className="flex items-center gap-1">
                        <Save className="w-3 h-3" />
                        Save
                      </div>
                    )}
                  </Button>
                </div>
              </div>
            ) : (
              <p className="text-sm leading-relaxed whitespace-pre-wrap">
                {highlightHashtags(post.content)}
              </p>
            )}
          </div>
        )}



        {/* Images */}
        {post.images && post.images.length > 0 && (
          <div className={`grid gap-2 ${
            post.images.length === 1 
              ? 'grid-cols-1' 
              : post.images.length === 2 
              ? 'grid-cols-2' 
              : 'grid-cols-2 md:grid-cols-3'
          }`}>
            {post.images.map((image, index) => (
              <div key={index} className="relative overflow-hidden rounded-lg">
                <Image
                  src={image.url}
                  alt={`Post image ${index + 1}`}
                  width={image.width}
                  height={image.height}
                  className="w-full h-auto max-h-80 object-cover"
                  priority={index === 0 && postIndex < 3}
                />
              </div>
            ))}
          </div>
        )}

        {/* Location */}
        {post.location && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <MapPin className="w-4 h-4" />
            <span>{post.location}</span>
          </div>
        )}

        {/* Stats */}
        <div className="flex items-center justify-between pt-2 border-t">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <AnimatedHeart 
                isLiked={Boolean(isAuthenticated && post.user_interaction.has_liked)}
                onToggle={() => onInteraction(post.id, 'like')}
                size={16}
                className="cursor-pointer"
              />
              <span className={`text-xs font-medium transition-colors ${
                isAuthenticated && post.user_interaction.has_liked 
                  ? 'text-red-500' 
                  : 'text-muted-foreground'
              }`}>{post.stats.likes}</span>
            </div>

            <Button
              size="sm"
              variant="ghost"
              onClick={() => onInteraction(post.id, 'comment')}
              className="flex items-center gap-2 text-muted-foreground hover:text-blue-500 transition-colors"
            >
              <MessageCircle className="w-4 h-4" />
              <span className="text-xs font-medium">{post.stats.comments}</span>
            </Button>

            <Button
              size="sm"
              variant="ghost"
              onClick={() => onInteraction(post.id, 'share')}
              className="flex items-center gap-2 text-muted-foreground hover:text-green-500 transition-colors"
            >
              <Share2 className="w-4 h-4" />
              <span className="text-xs font-medium">{post.stats.shares}</span>
            </Button>
          </div>

          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Eye className="w-3 h-3" />
            <span>{post.stats.views} views</span>
          </div>
        </div>
      </CardContent>

      {/* Comments Section */}
      {showComments && (
        <div className="border-t border-gray-200">
          {/* Existing Comments */}
          {comments.length > 0 && (
            <div className="p-4 space-y-3 max-h-60 overflow-y-auto">
              {comments.map((comment: any) => (
                <div key={comment.id} className="flex items-start gap-2">
                  <Avatar className="w-8 h-8 flex-shrink-0">
                    {(() => {
                      const img = comment.author?.profile_image;
                      const isRealImage = img && 
                        typeof img === 'string' && 
                        img.length > 10 && 
                        img.startsWith('https://') && 
                        (img.includes('cloudinary') || img.includes('amazonaws') || img.includes('googleapis') || img.includes('imgur')) &&
                        !img.includes('placeholder') && 
                        !img.includes('default') &&
                        !img.includes('avatar') &&
                        !img.includes('profile-placeholder');
                      
                      return isRealImage ? (
                        <AvatarImage src={img} onError={(e) => e.currentTarget.style.display = 'none'} />
                      ) : null;
                    })()}
                    <AvatarFallback className="bg-gradient-to-br from-blue-400 to-indigo-500 text-white text-xs font-semibold">
                      {getInitials(comment.author?.name || 'U')}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 bg-gray-50 rounded-lg px-3 py-2">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium text-sm">{comment.author?.name}</span>
                      <span className="text-xs text-gray-500">
                        {(() => {
                          try {
                            const date = new Date(comment.created_at);
                            if (isNaN(date.getTime())) return 'now';
                            return formatDistanceToNow(date) + ' ago';
                          } catch {
                            return 'now';
                          }
                        })()}
                      </span>
                    </div>
                    <p className="text-sm text-gray-700">{comment.content}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Comment Input */}
          {isAuthenticated ? (
            <div className="p-4 border-t border-gray-100">
              <div className="flex items-start gap-3">
                <Avatar className="w-8 h-8 flex-shrink-0">
                  {(() => {
                    const img = currentUser?.profile_image;
                    const isRealImage = img && 
                      typeof img === 'string' && 
                      img.length > 10 && 
                      img.startsWith('https://') && 
                      (img.includes('cloudinary') || img.includes('amazonaws') || img.includes('googleapis') || img.includes('imgur')) &&
                      !img.includes('placeholder') && 
                      !img.includes('default') &&
                      !img.includes('avatar') &&
                      !img.includes('profile-placeholder');
                    
                    return isRealImage ? (
                      <AvatarImage src={img} onError={(e) => e.currentTarget.style.display = 'none'} />
                    ) : null;
                  })()}
                  <AvatarFallback className="bg-gradient-to-br from-blue-400 to-indigo-500 text-white text-xs font-semibold">
                    {getInitials(currentUser?.name || currentUser?.email || 'U')}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 flex gap-2">
                  <Textarea
                    placeholder="Write a comment..."
                    value={commentInput}
                    onChange={(e) => onCommentInputChange?.(e.target.value)}
                    className="flex-1 min-h-[40px] max-h-[120px] resize-none border-gray-200 focus:border-blue-300 focus:ring-1 focus:ring-blue-300"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        onCommentSubmit?.();
                      }
                    }}
                  />
                  <Button
                    size="sm"
                    onClick={onCommentSubmit}
                    disabled={!commentInput.trim()}
                    className="self-end"
                  >
                    <Send className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <div className="p-4 text-center text-sm text-gray-500">
              <Link href="/login" className="text-blue-600 hover:underline">
                Sign in to comment
              </Link>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}