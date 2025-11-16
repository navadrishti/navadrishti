import { NextRequest, NextResponse } from 'next/server';
import { socialFeedDb } from '@/lib/social-feed-db';
import { verifyToken } from '@/lib/auth';

// Update a post
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ postId: string }> }
) {
  try {
    // Check authentication
    const authHeader = request.headers.get('authorization');
    let token;
    
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    } else {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }
    
    const user = verifyToken(token);
    if (!user) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    const { postId } = await params;
    const body = await request.json();
    const { content } = body;

    if (!content || typeof content !== 'string' || !content.trim()) {
      return NextResponse.json({ error: 'Content is required' }, { status: 400 });
    }

    // Check if post exists and user owns it
    const existingPost = await socialFeedDb.posts.getById(postId);
    if (!existingPost) {
      return NextResponse.json({ error: 'Post not found' }, { status: 404 });
    }

    if (existingPost.author_id !== user.id) {
      return NextResponse.json({ error: 'Unauthorized to edit this post' }, { status: 403 });
    }

    // Update the post
    const updatedPost = await socialFeedDb.posts.update(postId, {
      content: content.trim(),
      updated_at: new Date().toISOString()
    });

    return NextResponse.json({
      success: true,
      post: updatedPost,
      message: 'Post updated successfully'
    }, { status: 200 });

  } catch (error) {
    console.error('Error in PUT /api/posts/[postId]:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// Delete a post
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ postId: string }> }
) {
  try {
    // Check authentication
    const authHeader = request.headers.get('authorization');
    let token;
    
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    } else {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }
    
    const user = verifyToken(token);
    if (!user) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    const { postId } = await params;

    // Check if post exists and user owns it
    const existingPost = await socialFeedDb.posts.getById(postId);
    if (!existingPost) {
      return NextResponse.json({ error: 'Post not found' }, { status: 404 });
    }

    if (existingPost.author_id !== user.id) {
      return NextResponse.json({ error: 'Unauthorized to delete this post' }, { status: 403 });
    }

    // Delete the post (this will cascade to related data like comments, reactions, etc.)
    await socialFeedDb.posts.delete(postId, user.id);

    return NextResponse.json({
      success: true,
      message: 'Post deleted successfully'
    }, { status: 200 });

  } catch (error) {
    console.error('Error in DELETE /api/posts/[postId]:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// Get a specific post (optional, for future use)
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ postId: string }> }
) {
  try {
    const { postId } = await params;

    const post = await socialFeedDb.posts.getById(postId);
    if (!post) {
      return NextResponse.json({ error: 'Post not found' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      post
    }, { status: 200 });

  } catch (error) {
    console.error('Error in GET /api/posts/[postId]:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}