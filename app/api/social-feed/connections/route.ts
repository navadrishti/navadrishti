// API route for user connections (follow/unfollow)
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

    const { user } = await verifyToken(token)
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Invalid token' },
        { status: 401 }
      )
    }

    const body = await request.json()
    const { userId, action } = body

    if (!userId || !action) {
      return NextResponse.json(
        { success: false, error: 'User ID and action are required' },
        { status: 400 }
      )
    }

    if (userId === user.id) {
      return NextResponse.json(
        { success: false, error: 'Cannot follow yourself' },
        { status: 400 }
      )
    }

    if (!['follow', 'unfollow'].includes(action)) {
      return NextResponse.json(
        { success: false, error: 'Invalid action. Use "follow" or "unfollow"' },
        { status: 400 }
      )
    }

    let result
    if (action === 'follow') {
      result = await socialFeedDb.connections.follow(user.id, userId)
      
      // Create notification for the followed user
      await socialFeedDb.notifications.create({
        user_id: userId,
        type: 'new_follower',
        title: `${user.name} started following you`,
        message: `You have a new follower: ${user.name}`,
        related_user_id: user.id,
        action_url: `/profile/${user.id}`
      })
    } else {
      result = await socialFeedDb.connections.unfollow(user.id, userId)
    }

    return NextResponse.json({
      success: true,
      data: result,
      message: `Successfully ${action}ed user`
    })
  } catch (error) {
    console.error(`Error ${error}:`, error)
    return NextResponse.json(
      { success: false, error: `Failed to ${error} user` },
      { status: 500 }
    )
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('userId')
    const type = searchParams.get('type') // 'followers' or 'following'

    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'User ID is required' },
        { status: 400 }
      )
    }

    let data
    if (type === 'followers') {
      data = await socialFeedDb.connections.getFollowers(parseInt(userId))
    } else if (type === 'following') {
      data = await socialFeedDb.connections.getFollowing(parseInt(userId))
    } else {
      return NextResponse.json(
        { success: false, error: 'Type must be "followers" or "following"' },
        { status: 400 }
      )
    }

    return NextResponse.json({
      success: true,
      data,
      count: data.length
    })
  } catch (error) {
    console.error('Error fetching connections:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to fetch connections' },
      { status: 500 }
    )
  }
}