import { NextRequest, NextResponse } from 'next/server';
import { socialFeedDb } from '@/lib/social-feed-db';
import { verifyToken } from '@/lib/auth';
import { supabase } from '@/lib/db';
import { createErrorResponse, AppError, ErrorCodes, validateRequiredFields, sanitizeInput } from '@/lib/error-handler';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ postId: string }> }
) {
  try {
    // Check authentication using JWT token
    const authHeader = request.headers.get('authorization');
    let token;
    
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    } else {
      throw new AppError('Authentication required', 401, ErrorCodes.UNAUTHORIZED);
    }
    
    const user = verifyToken(token);
    if (!user) {
      throw new AppError('Invalid or expired token', 401, ErrorCodes.INVALID_TOKEN);
    }

    const { postId } = await params;
    const body = await request.json();
    const { content, parent_comment_id } = body;

    // Validate and sanitize input
    validateRequiredFields({ content }, ['content']);
    const sanitizedContent = sanitizeInput(content, 500);
    
    if (!sanitizedContent.trim()) {
      throw new AppError('Comment content cannot be empty', 400, ErrorCodes.VALIDATION_ERROR);
    }

    const commentData = {
      post_id: postId,
      author_id: user.id,
      content: sanitizedContent,
      parent_comment_id: parent_comment_id || undefined
    };

    const comment = await socialFeedDb.comments.create(commentData);

    // Update comment count on the post
    try {
      const { data: currentPost } = await supabase
        .from('posts')
        .select('comment_count')
        .eq('id', postId)
        .single();
        
      if (currentPost) {
        await supabase
          .from('posts')
          .update({ comment_count: (currentPost.comment_count || 0) + 1 })
          .eq('id', postId);
      }
    } catch (updateError) {
      // Non-critical error - comment was created successfully
      console.warn('Failed to update comment count:', updateError);
    }

    return NextResponse.json({ comment }, { status: 201 });

  } catch (error) {
    console.error('Error in POST /api/posts/[postId]/comments:', error);
    return createErrorResponse(error as Error);
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ postId: string }> }
) {
  try {
    const { postId } = await params;

    if (!postId) {
      throw new AppError('Post ID is required', 400, ErrorCodes.VALIDATION_ERROR);
    }

    const comments = await socialFeedDb.comments.getForPost(postId);

    return NextResponse.json({ comments }, { status: 200 });

  } catch (error) {
    console.error('Error in GET /api/posts/[postId]/comments:', error);
    return createErrorResponse(error as Error);
  }
}