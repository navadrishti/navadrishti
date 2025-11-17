import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/db';
import { socialFeedDb } from '@/lib/social-feed-db';

export async function POST(request: NextRequest) {
  try {
    // Reset daily/weekly counts and update trending rankings
    await socialFeedDb.posts.resetDailyWeeklyCounts();
    await socialFeedDb.posts.updateTrendingRankings();
    
    return NextResponse.json({
      success: true,
      message: 'Hashtag maintenance completed - daily/weekly counts reset and rankings updated',
      timestamp: new Date().toISOString()
    });

  } catch (error: any) {
    console.error('Error in hashtag maintenance:', error);
    
    return NextResponse.json({
      success: false,
      error: 'Failed to perform hashtag maintenance',
      details: error?.message
    }, { status: 500 });
  }
}

// Get hashtag statistics
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const includeAll = searchParams.get('all') === 'true';
    
    // Get hashtag statistics
    let hashtagQuery = supabase
      .from('hashtags')
      .select('*')
      .order('trending_score', { ascending: false });
    
    if (!includeAll) {
      hashtagQuery = hashtagQuery.limit(20);
    }

    const { data: hashtags, error } = await hashtagQuery;
    
    if (error) throw error;

    // Get count of trending hashtags
    const { count: trendingCount } = await supabase
      .from('hashtags')
      .select('*', { count: 'exact', head: true })
      .eq('is_trending', true);

    // Calculate total mentions from all hashtags
    const totalMentions = hashtags?.reduce((sum, h) => sum + (h.total_mentions || 0), 0) || 0;
    const dailyMentions = hashtags?.reduce((sum, h) => sum + (h.daily_mentions || 0), 0) || 0;
    const weeklyMentions = hashtags?.reduce((sum, h) => sum + (h.weekly_mentions || 0), 0) || 0;

    return NextResponse.json({
      success: true,
      data: {
        hashtags: hashtags || [],
        statistics: {
          total_hashtags: hashtags?.length || 0,
          trending_count: trendingCount || 0,
          total_mentions: totalMentions,
          daily_mentions: dailyMentions,
          weekly_mentions: weeklyMentions
        }
      },
      timestamp: new Date().toISOString()
    });

  } catch (error: any) {
    console.error('Error fetching hashtag stats:', error);
    
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch hashtag statistics',
      details: error?.message
    }, { status: 500 });
  }
}