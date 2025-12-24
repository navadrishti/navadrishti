import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/db';

/**
 * Nightly Hashtag Cleanup Cron Job
 * Runs at 12:00 AM IST (18:30 UTC previous day)
 * 
 * Purpose:
 * 1. Removes hashtags with 0 mentions in the past 24 hours
 * 2. Updates trending status based on daily activity
 * 3. Ensures only hashtags with recent activity remain trending
 */
export async function GET(request: NextRequest) {
  try {
    // Verify this is a cron job request (Vercel sets this header)
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(todayStart.getTime() - 24 * 60 * 60 * 1000);

    console.log('[Hashtag Cleanup] Starting nightly cleanup at:', now.toISOString());

    // Get all hashtags
    const { data: allHashtags, error: fetchError } = await supabase
      .from('hashtags')
      .select('*');

    if (fetchError) {
      throw new Error(`Failed to fetch hashtags: ${fetchError.message}`);
    }

    const stats = {
      total: allHashtags?.length || 0,
      removed: 0,
      updated: 0,
      trendingUpdated: 0
    };

    // Process each hashtag
    for (const hashtag of allHashtags || []) {
      // Get posts from the last 24 hours that contain this hashtag
      const { data: recentPosts, error: postsError } = await supabase
        .from('posts')
        .select('content, created_at')
        .gte('created_at', yesterday.toISOString());

      if (postsError) {
        console.warn(`[Hashtag Cleanup] Error fetching posts for ${hashtag.tag}:`, postsError);
        continue;
      }

      // Count mentions in the last 24 hours
      const hashtagRegex = new RegExp(`#${hashtag.tag}\\b`, 'gi');
      let dailyMentions = 0;

      for (const post of recentPosts || []) {
        const matches = post.content.match(hashtagRegex);
        dailyMentions += matches ? matches.length : 0;
      }

      // If hashtag has 0 mentions in past 24 hours, remove it
      if (dailyMentions === 0) {
        const { error: deleteError } = await supabase
          .from('hashtags')
          .delete()
          .eq('id', hashtag.id);

        if (deleteError) {
          console.warn(`[Hashtag Cleanup] Error deleting ${hashtag.tag}:`, deleteError);
        } else {
          console.log(`[Hashtag Cleanup] Removed hashtag: ${hashtag.tag} (0 mentions in 24h)`);
          stats.removed++;
        }
      } else {
        // Update daily mentions and trending status
        const { error: updateError } = await supabase
          .from('hashtags')
          .update({
            daily_mentions: dailyMentions,
            updated_at: now.toISOString()
          })
          .eq('id', hashtag.id);

        if (updateError) {
          console.warn(`[Hashtag Cleanup] Error updating ${hashtag.tag}:`, updateError);
        } else {
          stats.updated++;
        }
      }
    }

    // After cleanup, update trending rankings
    // Only hashtags with daily_mentions > 0 can be trending
    const { data: topHashtags, error: topError } = await supabase
      .from('hashtags')
      .select('id, tag, daily_mentions, trending_score')
      .gt('daily_mentions', 0)
      .order('trending_score', { ascending: false })
      .order('daily_mentions', { ascending: false })
      .limit(5);

    if (!topError) {
      // Reset all trending status first
      await supabase
        .from('hashtags')
        .update({ is_trending: false });

      // Set top hashtags as trending (only if we have any)
      if (topHashtags && topHashtags.length > 0) {
        const topIds = topHashtags.map(h => h.id);
        const { error: trendingError } = await supabase
          .from('hashtags')
          .update({ is_trending: true })
          .in('id', topIds);

        if (!trendingError) {
          stats.trendingUpdated = topHashtags.length;
          console.log('[Hashtag Cleanup] Updated trending hashtags:', 
            topHashtags.map(h => h.tag).join(', '));
        }
      } else {
        console.log('[Hashtag Cleanup] No hashtags qualify for trending (all have 0 daily mentions)');
      }
    }

    console.log('[Hashtag Cleanup] Completed. Stats:', stats);

    return NextResponse.json({
      success: true,
      message: 'Hashtag cleanup completed successfully',
      stats,
      timestamp: now.toISOString(),
      nextRun: 'Tomorrow at 12:00 AM IST'
    });

  } catch (error: any) {
    console.error('[Hashtag Cleanup] Error:', error);
    
    return NextResponse.json({
      success: false,
      error: 'Failed to perform hashtag cleanup',
      details: error?.message
    }, { status: 500 });
  }
}
