import { NextRequest, NextResponse } from 'next/server';
import { socialFeedDb } from '@/lib/social-feed-db';
import { verifyToken } from '@/lib/auth';
import { verifyAuthToken, checkApiPermission } from '@/lib/server-access-control';

export async function POST(request: NextRequest) {
  try {
    // For user identification, we need to verify the token in API route for database operations
    const authHeader = request.headers.get('authorization');
    if (!authHeader) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const token = authHeader.substring(7);
    const user = verifyToken(token);
    
    if (!user) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    // Parse request body
    const body = await request.json();
    const { content, images, location, hashtags } = body;

    if (!content?.trim() && (!images || images.length === 0)) {
      return NextResponse.json({ error: 'Content or images required' }, { status: 400 });
    }

    // Extract hashtags from content
    const hashtagRegex = /#[a-zA-Z0-9_]+/g;
    const extractedTags = content?.match(hashtagRegex)?.map((tag: string) => tag.replace('#', '')) || [];
    const allTags = [...new Set([...(hashtags || []), ...extractedTags])];

    // Prepare media URLs array
    const mediaUrls = images ? images.map((img: any) => img.url) : [];

    // Create post using social feed database
    const postData = {
      author_id: user.id,
      content: content || null,
      post_type: images && images.length > 0 ? 'image' : 'text',
      media_urls: mediaUrls,
      tags: allTags,
      location: location,
      visibility: 'public'
    };

    const newPost = await socialFeedDb.posts.create(postData);

    // Update trending topics for hashtags
    for (const tag of allTags) {
      await socialFeedDb.trending.updateTopic(`#${tag}`, 'hashtag');
    }

    return NextResponse.json({ 
      success: true,
      post: { id: newPost.id },
      message: 'Post created successfully' 
    }, { status: 201 });

  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    // Check authentication using JWT token (optional for viewing posts)
    const authHeader = request.headers.get('authorization');
    let user = null;
    
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      try {
        const result = verifyToken(token);
        user = result;
      } catch (error) {
        // Continue without user if token is invalid (allow viewing posts)
        console.log('Invalid token, continuing without authentication');
      }
    }

    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '10');
    const offset = (page - 1) * limit;

    // Build filters for social feed database
    const filters: any = {
      limit,
      offset
    };

    // Add user filter if provided (to show specific user's posts)
    if (userId) {
      filters.authorId = parseInt(userId);
    }

    // Add current user ID for checking user interactions (if authenticated)
    if (user) {
      filters.userId = user.id;
    }

    // Get posts using social feed database with retry mechanism
    const posts = await socialFeedDb.posts.getAll(filters).catch((error: any) => {
      const isTimeout = error?.message?.includes('Connection timed out') || 
                       error?.message?.includes('522');
      
      if (isTimeout) {
        console.warn('Database timeout while fetching posts - returning empty array');
        return [];
      }
      
      throw error;
    });

    // Transform the data to match the expected format
    const formattedPosts = posts.map((post: any) => ({
      id: parseInt(post.id),
      content: post.content,
      images: post.image ? [{ url: post.image, width: 800, height: 600 }] : null,
      location: post.location || null,
      created_at: post.timestamp || post.created_at || new Date().toISOString(),
      user_id: parseInt(post.author?.id || 0),
      user: {
        name: post.author?.name || 'Unknown User',
        email: post.author?.email || '',
        profile_image: post.author?.avatar || post.author?.profile_image,
        user_type: post.author?.type || post.author?.user_type || 'individual',
        verification_status: post.author?.verified === true ? 'verified' : (post.author?.verification_status || 'unverified')
      },
      hashtags: post.tags || [],
      stats: {
        likes: post.likes || 0,
        comments: post.comments || 0,
        shares: post.shares || 0,
        views: post.views || 0 // Use actual view count from database
      },
      user_interaction: {
        has_liked: post.liked || false,
        has_shared: false // Add share tracking if needed
      }
    }));

    return NextResponse.json({ 
      success: true,
      data: formattedPosts,
      pagination: {
        page,
        limit,
        total: formattedPosts.length
      }
    }, { status: 200 });

  } catch (error: any) {
    console.error('Error fetching posts:', error);
    
    // Check if this is a connection timeout
    const isTimeout = error?.message?.includes('Connection timed out') || 
                     error?.message?.includes('522');
    
    return NextResponse.json({ 
      success: false,
      error: isTimeout 
        ? 'Database is starting up. Please wait a few minutes and refresh.'
        : 'Failed to fetch posts',
      data: [],
      pagination: { page: 1, limit: 10, total: 0 }
    }, { status: isTimeout ? 503 : 500 });
  }
}