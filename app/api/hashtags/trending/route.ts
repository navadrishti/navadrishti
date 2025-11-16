import { NextRequest, NextResponse } from 'next/server';
import { socialFeedDb } from '@/lib/social-feed-db';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '5');

    // Get trending hashtags using the enhanced system with error handling
    const trendingHashtags = await socialFeedDb.posts.getTrendingHashtags(limit).catch((error: any) => {
      const isTimeout = error?.message?.includes('Connection timed out') || 
                       error?.message?.includes('522');
      
      if (isTimeout) {
        console.warn('Database timeout while fetching trending hashtags - returning empty array');
        return [];
      }
      
      throw error;
    });

    // Format data for frontend consumption
    const formattedData = trendingHashtags.map(hashtag => ({
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
      data: formattedData,
      count: formattedData.length,
      timestamp: new Date().toISOString()
    });

  } catch (error: any) {
    console.error('Error fetching trending hashtags:', error);
    
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