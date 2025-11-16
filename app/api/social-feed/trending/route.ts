// API route for trending topics
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const limit = parseInt(searchParams.get('limit') || '10')
    const category = searchParams.get('category') // 'social_impact', 'technology', 'environment', etc.

    const { supabase } = await import('@/lib/db')
    
    // First try to get from real-time trending function
    try {
      const { data: trendingData, error: trendingError } = await supabase
        .rpc('get_realtime_trending', {
          p_limit: limit,
          p_category: category
        })

      if (!trendingError && trendingData?.length > 0) {
        const formattedData = trendingData.map((item: any) => ({
          id: item.topic,
          topic: item.topic,
          mention_count: item.mention_count,
          category: item.category || 'general',
          trend_score: item.trend_score,
          growth_rate: item.recent_growth
        }))

        return NextResponse.json({
          success: true,
          data: formattedData,
          count: formattedData.length,
          metadata: {
            source: 'realtime_trending',
            category: category || 'all',
            generated_at: new Date().toISOString()
          }
        })
      }
    } catch (functionError) {
      console.log('Real-time trending function not available, using fallback query')
    }

    // Fallback: Direct query to hashtags table
    let query = supabase
      .from('hashtags')
      .select('tag, daily_mentions, weekly_mentions, trending_score, category, is_trending')
      .eq('is_trending', true)
      .order('trending_score', { ascending: false })
      .limit(limit)

    if (category) {
      query = query.eq('category', category)
    }

    const { data: hashtagData, error: hashtagError } = await query

    if (!hashtagError && hashtagData?.length > 0) {
      const formattedData = hashtagData.map((hashtag: any) => ({
        id: hashtag.tag,
        topic: hashtag.tag,
        mention_count: hashtag.daily_mentions,
        category: hashtag.category || 'general',
        trend_score: hashtag.trending_score,
        growth_rate: hashtag.weekly_mentions > 0 
          ? Math.round((hashtag.daily_mentions / hashtag.weekly_mentions * 7) * 10) / 10
          : 0
      }))

      return NextResponse.json({
        success: true,
        data: formattedData,
        count: formattedData.length,
        metadata: {
          source: 'hashtags_table',
          category: category || 'all',
          generated_at: new Date().toISOString()
        }
      })
    }

    // Final fallback: Extract hashtags from recent posts
    console.log('Hashtags table empty, extracting from recent posts')
    
    const { data: posts, error: postsError } = await supabase
      .from('posts')
      .select('content, tags, created_at')
      .eq('is_approved', true)
      .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()) // Last 7 days
      .order('created_at', { ascending: false })
      .limit(100)

    if (postsError) throw postsError

    // Extract hashtags from posts
    const hashtagCounts: { [key: string]: number } = {}
    
    posts?.forEach(post => {
      // Extract hashtags from content
      const contentHashtags = post.content.match(/#[a-zA-Z0-9]+/g) || []
      contentHashtags.forEach((tag: string) => {
        const cleanTag = tag.substring(1).toLowerCase()
        hashtagCounts[cleanTag] = (hashtagCounts[cleanTag] || 0) + 1
      })
      
      // Extract from tags array if available
      if (post.tags) {
        let tagArray = []
        try {
          tagArray = typeof post.tags === 'string' ? JSON.parse(post.tags) : post.tags
        } catch {
          tagArray = []
        }
        tagArray.forEach((tag: string) => {
          const cleanTag = tag.toLowerCase()
          hashtagCounts[cleanTag] = (hashtagCounts[cleanTag] || 0) + 1
        })
      }
    })

    // Convert to trending topics format and sort by count
    const extractedTopics = Object.entries(hashtagCounts)
      .map(([topic, count]) => ({
        id: topic,
        topic,
        mention_count: count,
        category: 'general',
        trend_score: count * 1.5,
        growth_rate: 0
      }))
      .sort((a, b) => b.mention_count - a.mention_count)
      .slice(0, limit)

    return NextResponse.json({
      success: true,
      data: extractedTopics,
      count: extractedTopics.length,
      metadata: {
        source: 'post_extraction',
        category: category || 'all',
        generated_at: new Date().toISOString()
      }
    })

  } catch (error) {
    console.error('Error fetching trending topics:', error)
    
    // Return empty array - no hardcoded fallback data
    return NextResponse.json({
      success: true,
      data: [],
      count: 0,
      metadata: {
        source: 'error_fallback',
        error: 'Failed to fetch trending data',
        generated_at: new Date().toISOString()
      }
    })
  }
}