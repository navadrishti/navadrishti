import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/db';

export async function POST(request: NextRequest) {
  try {
    // Manual fix for hashtag inconsistencies
    
    // Step 1: Get all posts and their hashtags
    const { data: allPosts, error: postsError } = await supabase
      .from('posts')
      .select('id, content');
    
    if (postsError) throw postsError;

    // Step 2: Build a count of actual hashtag usage
    const hashtagCounts = new Map<string, number>();
    
    for (const post of allPosts || []) {
      const hashtagRegex = /#([a-zA-Z0-9_]+)/g;
      const hashtags = post.content.match(hashtagRegex)?.map(tag => tag.replace('#', '').toLowerCase()) || [];
      
      hashtags.forEach(tag => {
        hashtagCounts.set(tag, (hashtagCounts.get(tag) || 0) + 1);
      });
    }

    // Step 3: Get all stored hashtags
    const { data: storedHashtags, error: hashtagsError } = await supabase
      .from('hashtags')
      .select('*');
    
    if (hashtagsError) throw hashtagsError;

    const results = {
      corrected: 0,
      deleted: 0,
      created: 0,
      errors: [] as string[]
    };

    // Step 4: Fix or remove incorrect hashtags
    for (const storedHashtag of storedHashtags || []) {
      const actualCount = hashtagCounts.get(storedHashtag.tag) || 0;
      
      if (actualCount === 0) {
        // Delete hashtags that don't exist in any posts
        const { error: deleteError } = await supabase
          .from('hashtags')
          .delete()
          .eq('id', storedHashtag.id);
        
        if (deleteError) {
          results.errors.push(`Failed to delete ${storedHashtag.tag}: ${deleteError.message}`);
        } else {
          results.deleted++;
        }
      } else if (actualCount !== storedHashtag.total_mentions) {
        // Fix incorrect counts
        const trendingScore = Math.round((actualCount * 4.0 + actualCount * 2.0 + actualCount * 0.2) * 100) / 100;
        
        const { error: updateError } = await supabase
          .from('hashtags')
          .update({
            total_mentions: actualCount,
            daily_mentions: Math.min(actualCount, storedHashtag.daily_mentions || 0),
            weekly_mentions: Math.min(actualCount, storedHashtag.weekly_mentions || 0),
            trending_score: trendingScore,
            is_trending: actualCount >= 2 && trendingScore > 5,
            updated_at: new Date().toISOString()
          })
          .eq('id', storedHashtag.id);
        
        if (updateError) {
          results.errors.push(`Failed to update ${storedHashtag.tag}: ${updateError.message}`);
        } else {
          results.corrected++;
        }
      }
      
      // Remove from actual counts after processing
      hashtagCounts.delete(storedHashtag.tag);
    }

    // Step 5: Create missing hashtags
    for (const [tag, count] of hashtagCounts.entries()) {
      const trendingScore = Math.round((count * 4.0 + count * 2.0 + count * 0.2) * 100) / 100;
      
      const { error: insertError } = await supabase
        .from('hashtags')
        .insert({
          tag,
          total_mentions: count,
          daily_mentions: count,
          weekly_mentions: count,
          trending_score: trendingScore,
          is_trending: count >= 2 && trendingScore > 5,
          category: 'general',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        });
      
      if (insertError) {
        results.errors.push(`Failed to create ${tag}: ${insertError.message}`);
      } else {
        results.created++;
      }
    }

    // Step 6: Update trending rankings
    try {
      await supabase.rpc('update_trending_rankings');
    } catch (error) {
      // This might fail if the function doesn't exist, which is OK
      console.warn('Could not update trending rankings via RPC, using manual update');
      
      // Manual trending update
      await supabase.from('hashtags').update({ is_trending: false }).neq('id', 0);
      
      const { data: topHashtags } = await supabase
        .from('hashtags')
        .select('id')
        .gte('daily_mentions', 2)
        .gt('trending_score', 5)
        .order('trending_score', { ascending: false })
        .limit(5);
      
      if (topHashtags && topHashtags.length > 0) {
        const topIds = topHashtags.map(h => h.id);
        await supabase
          .from('hashtags')
          .update({ is_trending: true })
          .in('id', topIds);
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Hashtag inconsistencies have been fixed',
      data: {
        message: 'Hashtag maintenance completed',
        ...results,
        totalProcessed: (storedHashtags?.length || 0) + hashtagCounts.size
      },
      timestamp: new Date().toISOString()
    });

  } catch (error: any) {
    console.error('Error fixing hashtag system:', error);
    
    return NextResponse.json({
      success: false,
      error: 'Failed to fix hashtag system',
      details: error?.message
    }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    // Get current hashtag status for debugging
    const { data: hashtags, error } = await supabase
      .from('hashtags')
      .select('*')
      .order('trending_score', { ascending: false });

    if (error) throw error;

    // Get total posts count for comparison
    const { count: postsCount } = await supabase
      .from('posts')
      .select('*', { count: 'exact', head: true });

    return NextResponse.json({
      success: true,
      data: {
        hashtags: hashtags || [],
        total_hashtags: hashtags?.length || 0,
        total_posts: postsCount || 0,
        trending_hashtags: hashtags?.filter(h => h.is_trending) || [],
        zero_mentions: hashtags?.filter(h => h.total_mentions === 0) || []
      },
      timestamp: new Date().toISOString()
    });

  } catch (error: any) {
    console.error('Error getting hashtag status:', error);
    
    return NextResponse.json({
      success: false,
      error: 'Failed to get hashtag status',
      details: error?.message
    }, { status: 500 });
  }
}