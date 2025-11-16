// API route for post comments
import { NextRequest, NextResponse } from 'next/server'
import { socialFeedDb } from '@/lib/social-feed-db'
import { verifyToken } from '@/lib/auth'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const postId = searchParams.get('postId')

    if (!postId) {
      return NextResponse.json(
        { success: false, error: 'Post ID is required' },
        { status: 400 }
      )
    }

    const comments = await socialFeedDb.comments.getForPost(postId)

    return NextResponse.json({
      success: true,
      data: comments
    })
  } catch (error) {
    console.error('Error fetching comments:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to fetch comments' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    // Verify authentication
    const token = request.headers.get('authorization')?.replace('Bearer ', '')
    if (!token) {
      return NextResponse.json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      )
    }

    const { user } = await verifyToken(token)
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Invalid token' },
        { status: 401 }
      )
    }

    const body = await request.json()
    const { postId, content, parentCommentId } = body

    // Validate input
    if (!postId || !content) {
      return NextResponse.json(
        { success: false, error: 'Post ID and content are required' },
        { status: 400 }
      )
    }

    if (content.trim().length === 0) {
      return NextResponse.json(
        { success: false, error: 'Comment cannot be empty' },
        { status: 400 }
      )
    }

    if (content.length > 500) {
      return NextResponse.json(
        { success: false, error: 'Comment must be less than 500 characters' },
        { status: 400 }
      )
    }

    const commentData = {
      post_id: postId,
      author_id: user.id,
      content: content.trim(),
      ...(parentCommentId && { parent_comment_id: parentCommentId })
    }

    const newComment = await socialFeedDb.comments.create(commentData)

    // Create notification for post author
    const post = await socialFeedDb.posts.getById(postId)
    if (post && post.author_id !== user.id) {
      await socialFeedDb.notifications.create({
        user_id: post.author_id,
        type: 'post_comment',
        title: `${user.name} commented on your post`,
        message: `${user.name}: ${content.substring(0, 100)}${content.length > 100 ? '...' : ''}`,
        related_user_id: user.id,
        related_post_id: postId,
        related_comment_id: newComment.id,
        action_url: `/posts/${postId}#comment-${newComment.id}`
      })
    }

    // If it's a reply, notify the parent comment author
    if (parentCommentId) {
      const parentComment = await socialFeedDb.comments.getById(parentCommentId)
      if (parentComment && parentComment.author_id !== user.id && parentComment.author_id !== post?.author_id) {
        await socialFeedDb.notifications.create({
          user_id: parentComment.author_id,
          type: 'comment_reply',
          title: `${user.name} replied to your comment`,
          message: `${user.name}: ${content.substring(0, 100)}${content.length > 100 ? '...' : ''}`,
          related_user_id: user.id,
          related_post_id: postId,
          related_comment_id: newComment.id,
          action_url: `/posts/${postId}#comment-${newComment.id}`
        })
      }
    }

    return NextResponse.json({
      success: true,
      data: newComment,
      message: 'Comment added successfully'
    })
  } catch (error) {
    console.error('Error creating comment:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to create comment' },
      { status: 500 }
    )
  }
}

export async function PATCH(request: NextRequest) {
  try {
    // Verify authentication
    const token = request.headers.get('authorization')?.replace('Bearer ', '')
    if (!token) {
      return NextResponse.json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      )
    }

    const { user } = await verifyToken(token)
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Invalid token' },
        { status: 401 }
      )
    }

    const body = await request.json()
    const { commentId, content } = body

    if (!commentId || !content || content.trim().length === 0) {
      return NextResponse.json(
        { success: false, error: 'Comment ID and content are required' },
        { status: 400 }
      )
    }

    const updatedComment = await socialFeedDb.comments.update(commentId, content.trim(), user.id)

    return NextResponse.json({
      success: true,
      data: updatedComment,
      message: 'Comment updated successfully'
    })
  } catch (error) {
    console.error('Error updating comment:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to update comment' },
      { status: 500 }
    )
  }
}

export async function DELETE(request: NextRequest) {
  try {
    // Verify authentication
    const token = request.headers.get('authorization')?.replace('Bearer ', '')
    if (!token) {
      return NextResponse.json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      )
    }

    const { user } = await verifyToken(token)
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Invalid token' },
        { status: 401 }
      )
    }

    const { searchParams } = new URL(request.url)
    const commentId = searchParams.get('commentId')

    if (!commentId) {
      return NextResponse.json(
        { success: false, error: 'Comment ID is required' },
        { status: 400 }
      )
    }

    await socialFeedDb.comments.delete(commentId, user.id)

    return NextResponse.json({
      success: true,
      message: 'Comment deleted successfully'
    })
  } catch (error) {
    console.error('Error deleting comment:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to delete comment' },
      { status: 500 }
    )
  }
}