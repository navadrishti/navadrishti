import { notFound } from 'next/navigation';
import { socialFeedDb } from '@/lib/social-feed-db';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import Link from 'next/link';
import { Heart, MessageCircle, Share2, Eye } from 'lucide-react';

interface PostPageProps {
  params: Promise<{
    postId: string;
  }>;
}

export async function generateMetadata({ params }: PostPageProps) {
  const { postId } = await params;
  
  try {
    const post = await socialFeedDb.posts.getById(postId);
    
    if (!post) {
      return {
        title: 'Post not found',
        description: 'The requested post could not be found.'
      };
    }

    return {
      title: `${post.author.name} shared on Navadrishti`,
      description: post.content.length > 150 
        ? post.content.substring(0, 150) + '...' 
        : post.content,
      openGraph: {
        title: `${post.author.name} shared on Navadrishti`,
        description: post.content.length > 150 
          ? post.content.substring(0, 150) + '...' 
          : post.content,
        images: post.media_urls?.[0] ? [post.media_urls[0]] : [],
        type: 'article',
        publishedTime: post.created_at || post.published_at,
        authors: [post.author.name]
      },
      twitter: {
        card: 'summary_large_image',
        title: `${post.author.name} shared on Navadrishti`,
        description: post.content.length > 150 
          ? post.content.substring(0, 150) + '...' 
          : post.content,
        images: post.media_urls?.[0] ? [post.media_urls[0]] : []
      }
    };
  } catch (error) {
    return {
      title: 'Error loading post',
      description: 'An error occurred while loading the post.'
    };
  }
}

export default async function PostPage({ params }: PostPageProps) {
  const { postId } = await params;
  
  // Generate initials for avatar fallback
  const getInitials = (name: string) => {
    if (!name) return "U"
    const names = name.split(' ')
    if (names.length === 1) return names[0].charAt(0).toUpperCase()
    return (names[0].charAt(0) + names[names.length - 1].charAt(0)).toUpperCase()
  }
  
  let post;
  try {
    post = await socialFeedDb.posts.getById(postId);
  } catch (error) {
    console.error('Error fetching post:', error);
    notFound();
  }

  if (!post) {
    notFound();
  }

  const timeAgo = socialFeedDb.getTimeAgo(post.created_at || post.published_at || new Date().toISOString());

  return (
    <div className="min-h-screen bg-background">
      {/* Header with back navigation */}
      <header className="border-b">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center space-x-4">
            <Link 
              href="/home" 
              className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              ← Back to Feed
            </Link>
            <h1 className="text-lg font-semibold">Post Details</h1>
          </div>
        </div>
      </header>

      {/* Post content */}
      <main className="container mx-auto px-4 py-8 max-w-2xl">
        <Card className="overflow-hidden">
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
                  <AvatarFallback className="bg-gradient-to-br from-blue-400 to-indigo-500 text-white font-semibold">{getInitials(post.author.name)}</AvatarFallback>
                </Avatar>
                <div>
                  <div className="flex items-center space-x-2">
                    <h3 className="font-medium">{post.author.name}</h3>
                    {post.author.verification_status === 'verified' && (
                      <Badge variant="secondary" className="text-xs">✓</Badge>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {socialFeedDb.getUserRole(post.author.user_type)} • {timeAgo}
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
              <p className="whitespace-pre-wrap">{post.content}</p>
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

            {/* Interaction stats */}
            <div className="flex items-center justify-between pt-4 border-t">
              <div className="flex items-center space-x-6 text-sm text-muted-foreground">
                <div className="flex items-center space-x-1">
                  <Heart className="w-4 h-4" />
                  <span>{post.reaction_count || 0} likes</span>
                </div>
                <div className="flex items-center space-x-1">
                  <MessageCircle className="w-4 h-4" />
                  <span>{post.comment_count || 0} comments</span>
                </div>
                <div className="flex items-center space-x-1">
                  <Share2 className="w-4 h-4" />
                  <span>{post.share_count || 0} shares</span>
                </div>
                <div className="flex items-center space-x-1">
                  <Eye className="w-4 h-4" />
                  <span>{post.view_count || 0} views</span>
                </div>
              </div>
            </div>

            {/* Call to action for authenticated users */}
            <div className="pt-4 border-t">
              <div className="text-center">
                <p className="text-sm text-muted-foreground mb-4">
                  Join the conversation on Navadrishti
                </p>
                <div className="space-x-4">
                  <Link 
                    href="/login" 
                    className="inline-flex items-center px-4 py-2 text-sm font-medium text-primary-foreground bg-primary rounded-md hover:bg-primary/90 transition-colors"
                  >
                    Sign In
                  </Link>
                  <Link 
                    href="/register" 
                    className="inline-flex items-center px-4 py-2 text-sm font-medium text-muted-foreground border border-input rounded-md hover:bg-accent hover:text-accent-foreground transition-colors"
                  >
                    Sign Up
                  </Link>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}