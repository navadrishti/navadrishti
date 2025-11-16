import { NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth'
import { socialFeedDb } from '@/lib/social-feed-db'

// Get user statistics
export async function GET(
  request: Request,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const token = request.headers.get('authorization')?.replace('Bearer ', '')
    const currentUser = token ? verifyToken(token) : null
    
    if (!currentUser) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Await params before accessing properties
    const { userId } = await params
    const requestedUserId = parseInt(userId)
    if (currentUser.id !== requestedUserId) {
      // In future, we might add privacy settings here
      // For now, allow fetching any user's stats
    }

    const stats = await socialFeedDb.getUserStats(requestedUserId)
    
    return NextResponse.json({
      success: true,
      data: stats
    })

  } catch (error) {
    console.error('Error fetching user stats:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to fetch user stats' },
      { status: 500 }
    )
  }
}