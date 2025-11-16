// API route for real-time dashboard activity feed
import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const limit = parseInt(searchParams.get('limit') || '20')
    const since = searchParams.get('since') // ISO timestamp for incremental updates
    
    // Get user ID from auth token
    let userId = null
    const authHeader = request.headers.get('authorization')
    
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7)
      try {
        const decoded = await verifyToken(token)
        userId = decoded.userId
      } catch {
        return NextResponse.json(
          { success: false, error: 'Invalid authentication token' },
          { status: 401 }
        )
      }
    }

    const { supabase } = await import('@/lib/db')
    
    // Build activity query
    let activityQuery = supabase
      .from('activity_feed')
      .select(`
        id,
        activity_type,
        entity_type,
        entity_id,
        activity_data,
        created_at,
        user:users!activity_feed_user_id_fkey (
          id,
          name,
          profile_image,
          user_type,
          verification_status
        )
      `)
      .eq('visibility', 'public')
      .order('created_at', { ascending: false })
      .limit(limit)

    // If user is logged in, include their followed users' activities
    if (userId) {
      // For now, show all public activities
      // Later can be enhanced with follower relationships
    }

    // Filter by timestamp if provided
    if (since) {
      activityQuery = activityQuery.gt('created_at', since)
    }

    const { data: activities, error: activitiesError } = await activityQuery

    if (activitiesError) {
      console.error('Error fetching activities:', activitiesError)
      return NextResponse.json(
        { success: false, error: 'Failed to fetch activity feed' },
        { status: 500 }
      )
    }

    // Format activities for frontend
    const formattedActivities = activities?.map(activity => ({
      id: activity.id,
      type: activity.activity_type,
      user: {
        id: activity.user?.id,
        name: activity.user?.name,
        profile_image: activity.user?.profile_image,
        user_type: activity.user?.user_type,
        verification_status: activity.user?.verification_status
      },
      entity: {
        type: activity.entity_type,
        id: activity.entity_id
      },
      data: activity.activity_data,
      timestamp: activity.created_at,
      formatted_message: formatActivityMessage(activity)
    })) || []

    return NextResponse.json({
      success: true,
      data: formattedActivities,
      count: formattedActivities.length,
      metadata: {
        has_more: formattedActivities.length === limit,
        latest_timestamp: formattedActivities[0]?.timestamp || null,
        user_id: userId
      }
    })

  } catch (error) {
    console.error('Error in activity feed API:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// Helper function to format activity messages
function formatActivityMessage(activity: any): string {
  const userName = activity.user?.name || 'Someone'
  const userType = getUserTypeLabel(activity.user?.user_type)
  
  switch (activity.activity_type) {
    case 'profile_update':
      return `${userName} (${userType}) updated their profile`
    
    case 'post_create':
      const preview = activity.activity_data?.content_preview || 'a new post'
      return `${userName} shared: "${preview}"`
    
    case 'skill_add':
      const skill = activity.activity_data?.skill_name || 'a new skill'
      return `${userName} added ${skill} to their skills`
    
    case 'verification':
      return `${userName} was verified as a ${userType}`
    
    case 'service_create':
      const serviceType = activity.entity_type === 'service_request' ? 'service request' : 'service offer'
      return `${userName} posted a new ${serviceType}`
    
    case 'hashtag_use':
      const hashtag = activity.activity_data?.hashtag || 'hashtag'
      return `${userName} is talking about #${hashtag}`
    
    default:
      return `${userName} was active on the platform`
  }
}

function getUserTypeLabel(userType: string): string {
  switch (userType) {
    case 'ngo': return 'NGO'
    case 'company': return 'Company'
    case 'individual': return 'Professional'
    default: return 'Member'
  }
}

// POST endpoint to track new activity
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { user_id, activity_type, entity_type, entity_id, activity_data, visibility = 'public' } = body

    // Validate required fields
    if (!user_id || !activity_type) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields: user_id, activity_type' },
        { status: 400 }
      )
    }

    const { supabase } = await import('@/lib/db')

    // Insert activity
    const { data, error } = await supabase
      .from('activity_feed')
      .insert({
        user_id,
        activity_type,
        entity_type,
        entity_id,
        activity_data,
        visibility
      })
      .select()
      .single()

    if (error) {
      console.error('Error inserting activity:', error)
      return NextResponse.json(
        { success: false, error: 'Failed to track activity' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      data: {
        id: data.id,
        message: 'Activity tracked successfully'
      }
    })

  } catch (error) {
    console.error('Error in activity tracking API:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}