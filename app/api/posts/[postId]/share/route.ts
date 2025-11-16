import { NextRequest, NextResponse } from 'next/server';
import { socialFeedDb } from '@/lib/social-feed-db';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ postId: string }> }
) {
  try {
    const { postId } = await params;

    // Get post information
    const post = await socialFeedDb.posts.getById(postId);
    if (!post) {
      return NextResponse.json({ error: 'Post not found' }, { status: 404 });
    }

    // Get the host from request headers
    const host = request.headers.get('host') || 'localhost:3000';
    const protocol = request.headers.get('x-forwarded-proto') || 'http';
    
    // Generate the proper share URL
    const shareUrl = `${protocol}://${host}/posts/${postId}`;
    
    // Get post preview info for rich sharing
    const shareData = {
      url: shareUrl,
      title: `${post.author.name} shared on Udaan Collective`,
      description: post.content.length > 100 
        ? post.content.substring(0, 100) + '...' 
        : post.content,
      image: post.media_urls?.[0] || null,
      author: {
        name: post.author.name,
        profile_image: post.author.profile_image
      }
    };

    return NextResponse.json(shareData, { status: 200 });

  } catch (error) {
    console.error('Error in GET /api/posts/[postId]/share:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ postId: string }> }
) {
  try {
    const { postId } = await params;
    
    // This endpoint can be used to track shares
    // For now, just return the share URL
    const host = request.headers.get('host') || 'localhost:3000';
    const protocol = request.headers.get('x-forwarded-proto') || 'http';
    const shareUrl = `${protocol}://${host}/posts/${postId}`;

    return NextResponse.json({ 
      success: true, 
      shareUrl,
      message: 'Share URL generated successfully'
    }, { status: 200 });

  } catch (error) {
    console.error('Error in POST /api/posts/[postId]/share:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}