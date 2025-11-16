import { NextRequest, NextResponse } from 'next/server';
import { socialFeedDb } from '@/lib/social-feed-db';
import { verifyToken } from '@/lib/auth';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ postId: string }> }
) {
  try {
    const { postId } = await params;
    const body = await request.json();
    const action = body.action || body.type; // Support both 'action' and 'type' for compatibility

    if (!['like', 'share', 'view'].includes(action)) {
      return NextResponse.json({ error: 'Invalid interaction type' }, { status: 400 });
    }

    // Handle view interaction - allow for anonymous users
    if (action === 'view') {
      try {
        // For anonymous views, we still track them but without user ID
        // Use IP address or session ID for anonymous tracking
        const userAgent = request.headers.get('user-agent') || 'unknown';
        const ip = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown';
        const anonymousId = `anon_${Buffer.from(ip + userAgent).toString('base64').slice(0, 16)}`;
        
        // Check if user is authenticated
        const authHeader = request.headers.get('authorization');
        let user = null;
        
        if (authHeader && authHeader.startsWith('Bearer ')) {
          const token = authHeader.substring(7);
          try {
            user = verifyToken(token);
          } catch (error) {
            // Continue as anonymous user
          }
        }

        // Track view with either real user ID or anonymous identifier
        if (user) {
          await socialFeedDb.interactions.trackView(postId, user.id);
        } else {
          // For anonymous users, use a special tracking method
          await socialFeedDb.interactions.trackAnonymousView(postId, anonymousId);
        }
        
        // Get updated view count
        const viewCount = await socialFeedDb.interactions.getPostViews(postId);
        
        return NextResponse.json({
          success: true,
          stats: {
            likes: 0,
            comments: 0,
            shares: 0,
            views: viewCount
          }
        }, { status: 200 });
      } catch (error) {
        // Silent fail for view tracking
        return NextResponse.json({ success: true }, { status: 200 });
      }
    }

    // For like and comment actions, authentication is required
    // For share action, allow both authenticated and anonymous users
    if ((action === 'like' || action === 'comment')) {
      const authHeader = request.headers.get('authorization');
      let token;
      
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return NextResponse.json({ error: 'Authentication required for this action' }, { status: 401 });
      }
      
      token = authHeader.substring(7);
      
      let user;
      try {
        user = verifyToken(token);
      } catch (error) {
        return NextResponse.json({ error: 'Token verification failed' }, { status: 401 });
      }
      
      if (!user) {
        return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
      }

      // Handle like interaction using social feed database
      if (action === 'like') {
        const result = await socialFeedDb.reactions.toggle(postId, user.id, 'like');
        
        // Get updated post to return current stats
        const updatedPost = await socialFeedDb.posts.getById(postId);
        if (!updatedPost) {
          return NextResponse.json({ error: 'Post not found' }, { status: 404 });
        }

        // Check if user currently has this post liked and shared
        const userLiked = updatedPost.reactions?.some((reaction: any) => 
          reaction.user_id === user.id && reaction.reaction_type === 'like'
        ) || false;

        // Check if user has shared this post
        const userShared = await socialFeedDb.interactions.hasUserShared(postId, user.id);

        return NextResponse.json({
          success: true,
          stats: {
            likes: updatedPost.reaction_count || 0,
            comments: updatedPost.comment_count || 0,
            shares: updatedPost.share_count || 0,
            views: updatedPost.view_count || 0
          },
          user_interaction: {
            has_liked: userLiked,
            has_shared: userShared
          }
        }, { status: 200 });
      }
    }

    // Handle share interaction - allow for both authenticated and anonymous users
    if (action === 'share') {
      try {
        let userIdentifier;
        let isAuthenticated = false;
        
        // Check if user is authenticated
        const authHeader = request.headers.get('authorization');
        if (authHeader && authHeader.startsWith('Bearer ')) {
          const token = authHeader.substring(7);
          try {
            const user = verifyToken(token);
            if (user) {
              userIdentifier = `user_${user.id}`;
              isAuthenticated = true;
            }
          } catch (error) {
            // Continue as anonymous user
          }
        }
        
        // For non-authenticated users, create a unique identifier based on browser fingerprint
        if (!isAuthenticated) {
          const userAgent = request.headers.get('user-agent') || 'unknown';
          const ip = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown';
          const acceptLanguage = request.headers.get('accept-language') || 'unknown';
          const acceptEncoding = request.headers.get('accept-encoding') || 'unknown';
          
          // Create a more robust fingerprint for anonymous users
          const fingerprint = Buffer.from(
            `${ip}_${userAgent}_${acceptLanguage}_${acceptEncoding}`
          ).toString('base64').slice(0, 32);
          
          userIdentifier = `anon_${fingerprint}`;
        }
        
        // Track the share with unique identifier
        const shareResult = await socialFeedDb.interactions.trackUniqueShare(postId, userIdentifier);
        
        if (!shareResult.success) {
          // User has already shared this post
          return NextResponse.json({
            success: true,
            message: 'Share already counted',
            stats: shareResult.stats,
            user_interaction: shareResult.user_interaction
          }, { status: 200 });
        }
        
        // Get the updated post with all current stats
        const updatedPost = await socialFeedDb.posts.getById(postId);
        if (!updatedPost) {
          return NextResponse.json({ error: 'Post not found' }, { status: 404 });
        }

        // For authenticated users, check if they have liked this post
        let userLiked = false;
        if (isAuthenticated) {
          const userId = parseInt(userIdentifier.replace('user_', ''));
          userLiked = await socialFeedDb.reactions.hasUserLiked(postId, userId);
        }

        return NextResponse.json({
          success: true,
          message: 'Share counted successfully',
          stats: {
            likes: updatedPost.reaction_count || 0,
            comments: updatedPost.comment_count || 0, 
            shares: updatedPost.share_count || 0,
            views: updatedPost.view_count || 0
          },
          user_interaction: {
            has_liked: userLiked,
            has_shared: true
          }
        }, { status: 200 });
      } catch (error) {
        console.error('Share tracking error:', error);
        return NextResponse.json({ error: 'Failed to track share' }, { status: 500 });
      }
    }

    // Fallback for unknown action types
    return NextResponse.json({ error: 'Unknown interaction type' }, { status: 400 });

  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ postId: string }> }
) {
  try {
    const { postId } = await params;

    // Get reactions for the post using social feed database
    const reactions = await socialFeedDb.reactions.getForPost(postId);

    // Group by reaction type
    const grouped = reactions?.reduce((acc: any, reaction: any) => {
      if (!acc[reaction.reaction_type]) {
        acc[reaction.reaction_type] = [];
      }
      acc[reaction.reaction_type].push({
        user_id: reaction.user.id,
        name: reaction.user.name,
        profile_image: reaction.user.profile_image
      });
      return acc;
    }, {}) || {};

    return NextResponse.json({ interactions: grouped }, { status: 200 });

  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}