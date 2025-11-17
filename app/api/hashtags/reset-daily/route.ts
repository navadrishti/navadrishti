import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/db';

export async function POST(request: NextRequest) {
  try {
    const today = new Date();
    const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).toISOString();
    const weekStart = new Date(today.getTime() - (7 * 24 * 60 * 60 * 1000)).toISOString();
    
    // Get all hashtags and recalculate their daily/weekly mentions based on actual post dates
    const { data: hashtags, error: hashtagsError } = await supabase
      .from('hashtags')
      .select('*');
    
    if (hashtagsError) throw hashtagsError;

    for (const hashtag of hashtags || []) {
      // Count actual mentions from posts created today
      const { data: todayPosts, error: todayError } = await supabase
        .from('posts')
        .select('content, created_at')
        .gte('created_at', todayStart);
      
      if (todayError) {
        console.warn(`Error fetching today's posts:`, todayError);
        continue;
      }

      // Count actual mentions from posts created this week
      const { data: weekPosts, error: weekError } = await supabase
        .from('posts')
        .select('content, created_at')
        .gte('created_at', weekStart);
      
      if (weekError) {
        console.warn(`Error fetching this week's posts:`, weekError);
        continue;
      }

      // Count how many times this hashtag appears in today's posts
      let dailyCount = 0;
      const hashtagRegex = new RegExp(`#${hashtag.tag}\\b`, 'gi');
      
      for (const post of todayPosts || []) {
        const matches = post.content.match(hashtagRegex);
        dailyCount += matches ? matches.length : 0;
      }

      // Count how many times this hashtag appears in this week's posts
      let weeklyCount = 0;
      for (const post of weekPosts || []) {
        const matches = post.content.match(hashtagRegex);
        weeklyCount += matches ? matches.length : 0;
      }

      // Calculate trending score
      const trendingScore = Math.round(
        (dailyCount * 4.0) + 
        (weeklyCount * 2.0) + 
        (hashtag.total_mentions * 0.2) + 
        (dailyCount > weeklyCount * 0.3 ? dailyCount * 0.5 : 0)
      * 100) / 100;

      // Update the hashtag with correct counts
      const { error: updateError } = await supabase
        .from('hashtags')
        .update({
          daily_mentions: dailyCount,
          weekly_mentions: weeklyCount,
          trending_score: trendingScore,
          is_trending: dailyCount >= 2 && trendingScore > 5,
          updated_at: new Date().toISOString()
        })
        .eq('id', hashtag.id);

      if (updateError) {
        console.warn(`Error updating hashtag ${hashtag.tag}:`, updateError);
      }
    }

    // Update trending rankings after all counts are corrected
    const { data: topHashtags, error: topError } = await supabase
      .from('hashtags')
      .select('id')
      .gte('daily_mentions', 1)
      .order('trending_score', { ascending: false })
      .order('daily_mentions', { ascending: false })
      .limit(5);

    if (!topError && topHashtags) {
      // Reset all trending status
      await supabase
        .from('hashtags')
        .update({ is_trending: false });

      // Set top 5 as trending
      if (topHashtags.length > 0) {
        const topIds = topHashtags.map(h => h.id);
        await supabase
          .from('hashtags')
          .update({ is_trending: true })
          .in('id', topIds);
      }
    }

    // Clean up hashtags with no total mentions
    await supabase
      .from('hashtags')
      .delete()
      .eq('total_mentions', 0);

    return NextResponse.json({
      success: true,
      message: 'Daily hashtag counts have been reset based on actual post dates',
      processed: hashtags?.length || 0,
      timestamp: new Date().toISOString()
    });

  } catch (error: any) {
    console.error('Error resetting daily hashtag counts:', error);
    
    return NextResponse.json({
      success: false,
      error: 'Failed to reset daily hashtag counts',
      details: error?.message
    }, { status: 500 });
  }
}