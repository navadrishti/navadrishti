// Utility functions for tracking real-time activities
import { supabase } from './db'

export interface ActivityData {
  user_id: number
  activity_type: 'profile_update' | 'post_create' | 'skill_add' | 'verification' | 'service_create' | 'hashtag_use'
  entity_type?: 'user' | 'post' | 'skill' | 'service_request' | 'service_offer'
  entity_id?: number
  activity_data?: Record<string, any>
  visibility?: 'public' | 'followers' | 'private'
}

// Track user activity
export async function trackActivity(data: ActivityData) {
  try {
    const { error } = await supabase
      .from('activity_feed')
      .insert({
        user_id: data.user_id,
        activity_type: data.activity_type,
        entity_type: data.entity_type,
        entity_id: data.entity_id,
        activity_data: data.activity_data,
        visibility: data.visibility || 'public'
      })

    if (error) {
      console.error('Error tracking activity:', error)
      return { success: false, error }
    }

    return { success: true }
  } catch (error) {
    console.error('Error in trackActivity:', error)
    return { success: false, error }
  }
}

// Track profile update specifically
export async function trackProfileUpdate(userId: number, updatedFields: string[]) {
  return trackActivity({
    user_id: userId,
    activity_type: 'profile_update',
    entity_type: 'user',
    entity_id: userId,
    activity_data: {
      updated_fields: updatedFields,
      timestamp: new Date().toISOString()
    }
  })
}

// Track post creation with hashtag extraction
export async function trackPostCreation(userId: number, postId: number, content: string) {
  // Extract hashtags
  const hashtags = content.match(/#[a-zA-Z0-9_]+/g) || []
  const cleanHashtags = hashtags.map(tag => tag.substring(1).toLowerCase())

  // Track post creation
  await trackActivity({
    user_id: userId,
    activity_type: 'post_create',
    entity_type: 'post',
    entity_id: postId,
    activity_data: {
      content_preview: content.substring(0, 100),
      hashtags: cleanHashtags,
      timestamp: new Date().toISOString()
    }
  })

  // Track individual hashtag usage
  for (const hashtag of cleanHashtags) {
    await trackActivity({
      user_id: userId,
      activity_type: 'hashtag_use',
      entity_type: 'post',
      entity_id: postId,
      activity_data: {
        hashtag: hashtag,
        context: 'post_creation'
      },
      visibility: 'public'
    })
  }

  // Update hashtag counts in database
  try {
    for (const hashtag of cleanHashtags) {
      await supabase.rpc('extract_and_update_hashtags', {
        p_content: `#${hashtag}`,
        p_post_id: postId,
        p_user_id: userId
      })
    }
  } catch (error) {
    console.log('Hashtag update function not available, using manual update')
    
    // Fallback: Update hashtags table manually
    for (const hashtag of cleanHashtags) {
      await supabase
        .from('hashtags')
        .insert({
          tag: hashtag,
          total_mentions: 1,
          weekly_mentions: 1,
          daily_mentions: 1,
          trending_score: 1.0,
          updated_at: new Date().toISOString()
        })
        .upsert({ tag, usage_count: 1 })
        .do('update', {
          total_mentions: 'hashtags.total_mentions + 1',
          weekly_mentions: 'hashtags.weekly_mentions + 1',
          daily_mentions: 'hashtags.daily_mentions + 1',
          updated_at: new Date().toISOString()
        })
    }
  }
}

// Track skill addition
export async function trackSkillAdd(userId: number, skillName: string) {
  return trackActivity({
    user_id: userId,
    activity_type: 'skill_add',
    entity_type: 'skill',
    activity_data: {
      skill_name: skillName,
      timestamp: new Date().toISOString()
    }
  })
}

// Track verification status change
export async function trackVerification(userId: number, verificationStatus: string) {
  return trackActivity({
    user_id: userId,
    activity_type: 'verification',
    entity_type: 'user',
    entity_id: userId,
    activity_data: {
      verification_status: verificationStatus,
      timestamp: new Date().toISOString()
    }
  })
}

// Track service creation
export async function trackServiceCreation(
  userId: number, 
  serviceId: number, 
  serviceType: 'service_request' | 'service_offer',
  title: string
) {
  return trackActivity({
    user_id: userId,
    activity_type: 'service_create',
    entity_type: serviceType,
    entity_id: serviceId,
    activity_data: {
      title: title.substring(0, 100),
      service_type: serviceType,
      timestamp: new Date().toISOString()
    }
  })
}

// Get recent activities for dashboard
export async function getRecentActivities(limit = 20, since?: string) {
  try {
    let query = supabase
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

    if (since) {
      query = query.gt('created_at', since)
    }

    const { data, error } = await query

    if (error) {
      console.error('Error fetching recent activities:', error)
      return { success: false, error, data: [] }
    }

    return { success: true, data: data || [] }
  } catch (error) {
    console.error('Error in getRecentActivities:', error)
    return { success: false, error, data: [] }
  }
}

// Clear old activities (cleanup function)
export async function cleanupOldActivities(daysToKeep = 30) {
  try {
    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep)

    const { error } = await supabase
      .from('activity_feed')
      .delete()
      .lt('created_at', cutoffDate.toISOString())

    if (error) {
      console.error('Error cleaning up old activities:', error)
      return { success: false, error }
    }

    return { success: true }
  } catch (error) {
    console.error('Error in cleanupOldActivities:', error)
    return { success: false, error }
  }
}

// Update trending scores (should be called periodically)
export async function updateTrendingScores() {
  try {
    // Try to use the database function first
    const { error: functionError } = await supabase.rpc('calculate_trending_scores')
    
    if (!functionError) {
      return { success: true, method: 'database_function' }
    }

    console.log('Database function not available, using manual calculation')
    
    // Fallback: Manual trending score calculation
    const now = new Date()
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000)
    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)

    // Get hashtag usage from the last week
    const { data: recentUsage } = await supabase
      .from('hashtag_usage')
      .select('hashtag_id, created_at')
      .gte('created_at', oneWeekAgo.toISOString())

    if (recentUsage) {
      const hashtagCounts: { [key: number]: { daily: number, weekly: number } } = {}
      
      recentUsage.forEach(usage => {
        const usageDate = new Date(usage.created_at)
        if (!hashtagCounts[usage.hashtag_id]) {
          hashtagCounts[usage.hashtag_id] = { daily: 0, weekly: 0 }
        }
        
        hashtagCounts[usage.hashtag_id].weekly++
        if (usageDate >= oneDayAgo) {
          hashtagCounts[usage.hashtag_id].daily++
        }
      })

      // Update hashtag trending scores
      for (const [hashtagId, counts] of Object.entries(hashtagCounts)) {
        const trendingScore = counts.daily * 3.0 + counts.weekly * 1.5
        const isTrending = counts.daily >= 2 || counts.weekly >= 10
        
        await supabase
          .from('hashtags')
          .update({
            daily_mentions: counts.daily,
            weekly_mentions: counts.weekly,
            trending_score: trendingScore,
            is_trending: isTrending,
            updated_at: now.toISOString()
          })
          .eq('id', parseInt(hashtagId))
      }
    }

    return { success: true, method: 'manual_calculation' }
  } catch (error) {
    console.error('Error updating trending scores:', error)
    return { success: false, error }
  }
}