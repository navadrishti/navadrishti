import { NextRequest, NextResponse } from 'next/server';
import { socialFeedDb } from '@/lib/social-feed-db';
import { supabase } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '5');

    // Calculate time boundaries for daily and weekly mentions
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekStart = new Date(todayStart);
    weekStart.setDate(weekStart.getDate() - 7);

    // Get all posts with hashtags from the last week to calculate real-time metrics
    const { data: recentPosts, error: postsError } = await supabase
      .from('posts')
      .select('content, created_at')
      .gte('created_at', weekStart.toISOString())
      .order('created_at', { ascending: false });

    if (postsError) {
      throw new Error(`Failed to fetch posts: ${postsError.message}`);
    }

    // Calculate real-time hashtag mentions
    const hashtagCounts = new Map<string, { daily: number; weekly: number; total: number }>();
    
    for (const post of recentPosts || []) {
      const postDate = new Date(post.created_at);
      const isToday = postDate >= todayStart;
      const isThisWeek = postDate >= weekStart;
      
      // Extract hashtags from post content
      const hashtagRegex = /#([a-zA-Z0-9_]+)/g;
      const hashtags = post.content.match(hashtagRegex)?.map(tag => 
        tag.replace('#', '').toLowerCase()
      ) || [];
      
      hashtags.forEach(tag => {
        if (!hashtagCounts.has(tag)) {
          hashtagCounts.set(tag, { daily: 0, weekly: 0, total: 0 });
        }
        const counts = hashtagCounts.get(tag)!;
        if (isToday) counts.daily++;
        if (isThisWeek) counts.weekly++;
        counts.total++;
      });
    }

    // Get stored hashtag data and merge with real-time calculations
    const { data: storedHashtags, error: hashtagsError } = await supabase
      .from('hashtags')
      .select('*')
      .order('total_mentions', { ascending: false });

    if (hashtagsError) {
      throw new Error(`Failed to fetch hashtags: ${hashtagsError.message}`);
    }

    // Merge stored data with real-time calculations
    const mergedHashtags = new Map<string, any>();
    
    // Add stored hashtags with updated counts
    for (const stored of storedHashtags || []) {
      const realTime = hashtagCounts.get(stored.tag) || { daily: 0, weekly: 0, total: stored.total_mentions };
      mergedHashtags.set(stored.tag, {
        ...stored,
        daily_mentions: realTime.daily,
        weekly_mentions: realTime.weekly,
        total_mentions: Math.max(stored.total_mentions, realTime.total), // Use higher value
        trending_score: realTime.daily * 3 + realTime.weekly * 1.5 + realTime.total * 0.1
      });
    }

    // Add new hashtags that aren't stored yet
    for (const [tag, counts] of hashtagCounts) {
      if (!mergedHashtags.has(tag)) {
        mergedHashtags.set(tag, {
          id: `temp_${tag}`,
          tag,
          daily_mentions: counts.daily,
          weekly_mentions: counts.weekly,
          total_mentions: counts.total,
          trending_score: counts.daily * 3 + counts.weekly * 1.5 + counts.total * 0.1,
          category: 'general',
          is_trending: counts.daily > 0 || counts.weekly > 1
        });
      }
    }

    // Sort by trending score and take top hashtags
    const sortedHashtags = Array.from(mergedHashtags.values())
      .sort((a, b) => {
        // Primary sort: daily mentions (today's activity)
        if (b.daily_mentions !== a.daily_mentions) {
          return b.daily_mentions - a.daily_mentions;
        }
        // Secondary sort: weekly mentions
        if (b.weekly_mentions !== a.weekly_mentions) {
          return b.weekly_mentions - a.weekly_mentions;
        }
        // Tertiary sort: trending score
        return b.trending_score - a.trending_score;
      })
      .slice(0, limit);

    // Format data for frontend consumption
    const formattedData = sortedHashtags.map((hashtag, index) => ({
      id: hashtag.id,
      tag: hashtag.tag,
      daily_mentions: hashtag.daily_mentions || 0,
      weekly_mentions: hashtag.weekly_mentions || 0,
      total_mentions: hashtag.total_mentions || 0,
      trending_score: Math.round(hashtag.trending_score * 10) / 10,
      category: hashtag.category || 'general',
      is_trending: hashtag.daily_mentions > 0 || hashtag.weekly_mentions > 1
    }));

    return NextResponse.json({
      success: true,
      data: formattedData,
      count: formattedData.length,
      timestamp: new Date().toISOString(),
      debug: {
        calculatedAt: now.toISOString(),
        todayStart: todayStart.toISOString(),
        weekStart: weekStart.toISOString(),
        postsAnalyzed: recentPosts?.length || 0
      }
    });

  } catch (error: any) {
    console.error('Error fetching trending hashtags:', error);
    
    // Fallback to stored hashtags if real-time calculation fails
    try {
      const fallbackHashtags = await socialFeedDb.posts.getTrendingHashtags(limit);
      const formattedFallback = fallbackHashtags.map(hashtag => ({
        id: hashtag.id,
        tag: hashtag.tag,
        daily_mentions: hashtag.daily_mentions || 0,
        weekly_mentions: hashtag.weekly_mentions || 0,
        total_mentions: hashtag.total_mentions || 0,
        trending_score: hashtag.trending_score || 0,
        category: hashtag.category || 'general',
        is_trending: hashtag.is_trending || false
      }));
      
      return NextResponse.json({
        success: true,
        data: formattedFallback,
        count: formattedFallback.length,
        timestamp: new Date().toISOString(),
        fallback: true
      });
    } catch (fallbackError) {
      // Check if this is a connection timeout
      const isTimeout = error?.message?.includes('Connection timed out') || 
                       error?.message?.includes('522');
      
      return NextResponse.json({
        success: false,
        error: isTimeout 
          ? 'Database is starting up. Please wait a few minutes and refresh.'
          : 'Failed to fetch trending hashtags',
        data: []
      }, { status: isTimeout ? 503 : 500 });
    }
  }
}