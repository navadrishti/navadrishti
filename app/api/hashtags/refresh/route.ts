import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/db';

export async function POST(request: NextRequest) {
  try {
    console.log('🔄 Starting hashtag data refresh...');

    // Calculate time boundaries
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekStart = new Date(todayStart);
    weekStart.setDate(weekStart.getDate() - 7);

    // Get all posts to analyze hashtags
    const { data: allPosts, error: postsError } = await supabase
      .from('posts')
      .select('content, created_at')
      .order('created_at', { ascending: false });

    if (postsError) {
      throw new Error(`Failed to fetch posts: ${postsError.message}`);
    }

    console.log(`📊 Analyzing ${allPosts?.length || 0} posts for hashtag mentions...`);

    // Calculate hashtag metrics
    const hashtagMetrics = new Map<string, {
      daily: number;
      weekly: number; 
      total: number;
      category: string;
    }>();
    
    for (const post of allPosts || []) {
      const postDate = new Date(post.created_at);
      const isToday = postDate >= todayStart;
      const isThisWeek = postDate >= weekStart;
      
      // Extract hashtags
      const hashtagRegex = /#([a-zA-Z0-9_]+)/g;
      const hashtags = post.content.match(hashtagRegex)?.map(tag => 
        tag.replace('#', '').toLowerCase()
      ) || [];
      
      hashtags.forEach(tag => {
        if (!hashtagMetrics.has(tag)) {
          hashtagMetrics.set(tag, {
            daily: 0,
            weekly: 0,
            total: 0,
            category: 'general'
          });
        }
        const metrics = hashtagMetrics.get(tag)!;
        if (isToday) metrics.daily++;
        if (isThisWeek) metrics.weekly++;
        metrics.total++;
      });
    }

    console.log(`🏷️ Found ${hashtagMetrics.size} unique hashtags`);

    // Get existing hashtags
    const { data: existingHashtags, error: fetchError } = await supabase
      .from('hashtags')
      .select('*');

    if (fetchError) {
      throw new Error(`Failed to fetch existing hashtags: ${fetchError.message}`);
    }

    let updated = 0;
    let created = 0;
    let deleted = 0;

    // Update existing hashtags
    for (const existing of existingHashtags || []) {
      const metrics = hashtagMetrics.get(existing.tag);
      
      if (!metrics) {
        // Delete hashtags that no longer exist in posts
        await supabase
          .from('hashtags')
          .delete()
          .eq('id', existing.id);
        deleted++;
        continue;
      }

      // Update hashtag with fresh metrics
      const trendingScore = metrics.daily * 3 + metrics.weekly * 1.5 + metrics.total * 0.1;
      const isTrending = metrics.daily > 0 || metrics.weekly > 1;

      await supabase
        .from('hashtags')
        .update({
          daily_mentions: metrics.daily,
          weekly_mentions: metrics.weekly,
          total_mentions: metrics.total,
          trending_score: Math.round(trendingScore * 10) / 10,
          is_trending: isTrending,
          updated_at: new Date().toISOString()
        })
        .eq('id', existing.id);

      updated++;
      hashtagMetrics.delete(existing.tag); // Remove from map after processing
    }

    // Create new hashtags
    for (const [tag, metrics] of hashtagMetrics) {
      const trendingScore = metrics.daily * 3 + metrics.weekly * 1.5 + metrics.total * 0.1;
      const isTrending = metrics.daily > 0 || metrics.weekly > 1;

      await supabase
        .from('hashtags')
        .insert({
          tag,
          daily_mentions: metrics.daily,
          weekly_mentions: metrics.weekly,
          total_mentions: metrics.total,
          trending_score: Math.round(trendingScore * 10) / 10,
          is_trending: isTrending,
          category: metrics.category,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        });

      created++;
    }

    console.log(`✅ Hashtag refresh complete: ${updated} updated, ${created} created, ${deleted} deleted`);

    return NextResponse.json({
      success: true,
      message: 'Hashtag data refreshed successfully',
      statistics: {
        updated,
        created,
        deleted,
        totalProcessed: updated + created + deleted,
        timestamp: new Date().toISOString()
      }
    });

  } catch (error: any) {
    console.error('❌ Error refreshing hashtag data:', error);
    
    return NextResponse.json({
      success: false,
      error: 'Failed to refresh hashtag data',
      details: error.message
    }, { status: 500 });
  }
}

// GET endpoint for manual refresh trigger
export async function GET(request: NextRequest) {
  // Just call the POST method
  return POST(request);
}