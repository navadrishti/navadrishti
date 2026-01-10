import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/db';
import { emailService } from '@/lib/email-service';

/**
 * Combined Daily Cleanup Cron Job
 * Runs once daily at 2:00 AM
 * 
 * Performs:
 * 1. Auto-rejection of expired service offers (pending > 5 days)
 * 2. Hashtag cleanup (removes inactive hashtags, updates trending)
 */
export async function GET(request: NextRequest) {
  try {
    // Verify this is coming from Vercel Cron
    const authHeader = request.headers.get('authorization');
    
    // Security check with custom secret
    if (process.env.CRON_SECRET) {
      const providedSecret = authHeader?.replace('Bearer ', '');
      if (providedSecret !== process.env.CRON_SECRET) {
        console.log('Cron job unauthorized access attempt');
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
    }
    
    // Vercel cron jobs include this header
    const cronHeader = request.headers.get('x-vercel-cron');
    if (!cronHeader && process.env.NODE_ENV === 'production') {
      console.log('Not a Vercel cron request');
      return NextResponse.json({ error: 'Not authorized' }, { status: 401 });
    }

    console.log('🔄 Starting daily cleanup process...');

    // ========== TASK 1: AUTO-REJECT EXPIRED SERVICE OFFERS ==========
    console.log('\n📋 Task 1: Auto-rejecting expired service offers...');
    
    const fiveDaysAgo = new Date();
    fiveDaysAgo.setDate(fiveDaysAgo.getDate() - 5);
    
    const { data: expiredOffers, error: fetchError } = await supabase
      .from('service_offers')
      .select(`
        *,
        organization:ngo_id (
          id,
          name,
          email
        )
      `)
      .eq('admin_status', 'pending')
      .lt('submitted_for_review_at', fiveDaysAgo.toISOString());

    let rejectedCount = 0;
    const rejectedOffers = [];

    if (fetchError) {
      console.error('Error fetching expired offers:', fetchError);
    } else if (expiredOffers && expiredOffers.length > 0) {
      console.log(`Found ${expiredOffers.length} expired offers to auto-reject`);
      
      for (const offer of expiredOffers) {
        try {
          const { error: updateError } = await supabase
            .from('service_offers')
            .update({
              admin_status: 'rejected',
              admin_reviewed_at: new Date().toISOString(),
              admin_comments: 'Automatically rejected: Review deadline exceeded (5 days). Please resubmit if still needed.'
            })
            .eq('id', offer.id);

          if (updateError) {
            console.error(`Error updating offer ${offer.id}:`, updateError);
            continue;
          }

          rejectedOffers.push(offer);
          rejectedCount++;

          // Send email notification
          if (offer.organization?.email) {
            try {
              await emailService.sendEmail({
                to: offer.organization.email,
                subject: '⏰ Service Offer Auto-Rejected - Review Deadline Exceeded',
                html: `
                  <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                    <h2 style="color: #dc2626;">Service Offer Auto-Rejected</h2>
                    
                    <p>Dear ${offer.organization.name},</p>
                    
                    <p>Your service offer "<strong>${offer.title}</strong>" has been automatically rejected due to exceeding the 5-day review deadline.</p>
                    
                    <div style="background-color: #fef2f2; padding: 15px; border-left: 4px solid #dc2626; margin: 20px 0;">
                      <h3 style="color: #dc2626; margin: 0 0 10px 0;">Auto-Rejection Details</h3>
                      <p style="margin: 5px 0;"><strong>Offer:</strong> ${offer.title}</p>
                      <p style="margin: 5px 0;"><strong>Submitted:</strong> ${new Date(offer.submitted_for_review_at).toLocaleDateString()}</p>
                      <p style="margin: 5px 0;"><strong>Auto-Rejected:</strong> ${new Date().toLocaleDateString()}</p>
                      <p style="margin: 5px 0;"><strong>Reason:</strong> 5-day review deadline exceeded</p>
                    </div>
                    
                    <h3>What happens next?</h3>
                    <ul>
                      <li>Your offer is no longer visible to potential applicants</li>
                      <li>You can view this in your "Track Offers" tab</li>
                      <li>You may create a new offer if still needed</li>
                      <li>Our admin team will prioritize future submissions</li>
                    </ul>
                    
                    <p>We apologize for the delay in reviewing your submission. Our team is working to improve response times.</p>
                    
                    <p>If you have any questions, please don't hesitate to contact our support team.</p>
                    
                    <p>Best regards,<br>The Navdrishti Team</p>
                  </div>
                `
              });
            } catch (emailError) {
              console.error(`Error sending email for offer ${offer.id}:`, emailError);
            }
          }

          console.log(`✅ Auto-rejected offer ${offer.id}: "${offer.title}"`);
        } catch (offerError) {
          console.error(`Error processing offer ${offer.id}:`, offerError);
        }
      }
    } else {
      console.log('✅ No expired offers found');
    }

    // ========== TASK 2: HASHTAG CLEANUP ==========
    console.log('\n#️⃣ Task 2: Cleaning up hashtags...');
    
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(todayStart.getTime() - 24 * 60 * 60 * 1000);

    const { data: allHashtags, error: hashtagFetchError } = await supabase
      .from('hashtags')
      .select('*');

    const hashtagStats = {
      total: allHashtags?.length || 0,
      removed: 0,
      updated: 0,
      trendingUpdated: 0
    };

    if (hashtagFetchError) {
      console.error('Error fetching hashtags:', hashtagFetchError);
    } else if (allHashtags && allHashtags.length > 0) {
      for (const hashtag of allHashtags) {
        const { data: recentPosts, error: postsError } = await supabase
          .from('posts')
          .select('content, created_at')
          .gte('created_at', yesterday.toISOString());

        if (postsError) {
          console.warn(`Error fetching posts for ${hashtag.tag}:`, postsError);
          continue;
        }

        const hashtagRegex = new RegExp(`#${hashtag.tag}\\b`, 'gi');
        let dailyMentions = 0;

        for (const post of recentPosts || []) {
          const matches = post.content.match(hashtagRegex);
          dailyMentions += matches ? matches.length : 0;
        }

        if (dailyMentions === 0) {
          const { error: deleteError } = await supabase
            .from('hashtags')
            .delete()
            .eq('id', hashtag.id);

          if (!deleteError) {
            console.log(`Removed hashtag: ${hashtag.tag} (0 mentions in 24h)`);
            hashtagStats.removed++;
          }
        } else {
          const { error: updateError } = await supabase
            .from('hashtags')
            .update({
              daily_mentions: dailyMentions,
              updated_at: now.toISOString()
            })
            .eq('id', hashtag.id);

          if (!updateError) {
            hashtagStats.updated++;
          }
        }
      }

      // Update trending rankings
      const { data: topHashtags, error: topError } = await supabase
        .from('hashtags')
        .select('id, tag, daily_mentions, trending_score')
        .gt('daily_mentions', 0)
        .order('trending_score', { ascending: false })
        .order('daily_mentions', { ascending: false })
        .limit(5);

      if (!topError) {
        await supabase.from('hashtags').update({ is_trending: false });

        if (topHashtags && topHashtags.length > 0) {
          const topIds = topHashtags.map(h => h.id);
          const { error: trendingError } = await supabase
            .from('hashtags')
            .update({ is_trending: true })
            .in('id', topIds);

          if (!trendingError) {
            hashtagStats.trendingUpdated = topHashtags.length;
            console.log('Updated trending hashtags:', topHashtags.map(h => h.tag).join(', '));
          }
        }
      }
    }

    console.log('✅ Hashtag cleanup completed. Stats:', hashtagStats);

    // ========== FINAL SUMMARY ==========
    console.log('\n🎉 Daily cleanup process complete!');

    return NextResponse.json({
      success: true,
      message: 'Daily cleanup completed successfully',
      timestamp: new Date().toISOString(),
      tasks: {
        autoRejectExpired: {
          rejectedCount,
          rejectedOffers: rejectedOffers.map(offer => ({
            id: offer.id,
            title: offer.title,
            organization: offer.organization?.name
          }))
        },
        hashtagCleanup: hashtagStats
      }
    });

  } catch (error: any) {
    console.error('❌ Daily cleanup cron job error:', error);
    return NextResponse.json({ 
      error: 'Daily cleanup cron job failed',
      details: error?.message || 'Unknown error',
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}

// Support POST method for manual triggering
export async function POST(request: NextRequest) {
  return GET(request);
}
