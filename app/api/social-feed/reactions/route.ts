// API route for post reactions (like, love, etc.)
import { NextRequest, NextResponse } from 'next/server'
import { socialFeedDb } from '@/lib/social-feed-db'
import { verifyToken } from '@/lib/auth'

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

    const user = verifyToken(token)
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Invalid token' },
        { status: 401 }
      )
    }

    const body = await request.json()
    const { postId, reactionType = 'like' } = body

    if (!postId) {
      return NextResponse.json(
        { success: false, error: 'Post ID is required' },
        { status: 400 }
      )
    }

    const validReactions = ['like', 'love', 'support', 'celebrate', 'insightful']
    if (!validReactions.includes(reactionType)) {
      return NextResponse.json(
        { success: false, error: 'Invalid reaction type' },
        { status: 400 }
      )
    }

    const result = await socialFeedDb.reactions.toggle(postId, user.id, reactionType)

    // Create notification for post author if it's a new reaction
    if (result.action === 'added') {
      // Get post details for notification
      const post = await socialFeedDb.posts.getById(postId)
      if (post && post.author_id !== user.id) {
        await socialFeedDb.notifications.create({
          user_id: post.author_id,
          type: 'post_like',
          title: `${user.name} reacted to your post`,
          message: `${user.name} ${reactionType}d your post`,
          related_user_id: user.id,
          related_post_id: postId,
          action_url: `/posts/${postId}`
        })
      }
    }

    return NextResponse.json({
      success: true,
      data: result,
      message: `Reaction ${result.action} successfully`
    })
  } catch (error) {
    console.error('Error toggling reaction:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to update reaction' },
      { status: 500 }
    )
  }
}

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

    const reactions = await socialFeedDb.reactions.getForPost(postId)

    return NextResponse.json({
      success: true,
      data: reactions
    })
  } catch (error) {
    console.error('Error fetching reactions:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to fetch reactions' },
      { status: 500 }
    )
  }
}