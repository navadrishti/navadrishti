import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/db';
import { emailService } from '@/lib/email';
import { processCsrCapabilityDailyCompliance, markCsrProjectCompleted, syncAllCsrCapabilityRentalsDelhivery } from '@/lib/csr-agent/campaign';
import { getDocumentExpiries, dropExpiredCaComplianceTags } from '@/lib/auth';

function asRecord(value: unknown): Record<string, any> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, any>)
    : {};
}

async function processNgoDocumentExpiryJobs(now = new Date()) {
  const stats = {
    scanned: 0,
    reminded: 0,
    tags_dropped: 0,
    errors: 0,
  };

  const { data: users, error } = await supabase
    .from('users')
    .select('id, verification_status, profile_data')
    .eq('user_type', 'ngo')
    .eq('verification_status', 'verified')
    .limit(2000);

  if (error) {
    console.error('document expiry: failed to load NGOs', error);
    return { ...stats, error: error.message };
  }

  for (const user of users || []) {
    try {
      const profileData = asRecord(user.profile_data);
      if (profileData.reverification_pending) continue;

      stats.scanned += 1;
      const dropped = dropExpiredCaComplianceTags(profileData);
      const rawExpiries = asRecord(profileData.document_expiries);
      const nextExpiries = getDocumentExpiries(profileData);
      const stripLegacyBankStatement = Object.prototype.hasOwnProperty.call(
        rawExpiries,
        'bank_statement'
      );
      if (!dropped.changed && !stripLegacyBankStatement) continue;

      const reviewedAt = now.toISOString();
      const { error: tagUpdateError } = await supabase
        .from('users')
        .update({
          profile_data: {
            ...dropped.profileData,
            document_expiries: nextExpiries,
          },
          updated_at: reviewedAt,
        })
        .eq('id', user.id);
      if (tagUpdateError) throw tagUpdateError;
      stats.tags_dropped += dropped.dropped.length;
    } catch (err) {
      stats.errors += 1;
      console.error(`document expiry: failed for user ${user.id}`, err);
    }
  }

  return stats;
}

/**
 * Combined Daily Cleanup Cron Job
 * Runs once daily (see vercel.json)
 * 
 * Performs:
 * 1. Auto-rejection of expired service offers (pending > 5 days)
 * 2. Hashtag cleanup (removes inactive hashtags, updates trending)
 * 3. Expire projects and their needs
 * 4. CSR capability daily compliance / Delhivery sync
 * 5. Drop expired optional CA compliance tags (12A / 80G / CSR-1 / FCRA). Never unverify.
 */
export async function GET(request: NextRequest) {
  try {
    // Verify this is coming from Vercel Cron
    const authHeader = request.headers.get('authorization');
    
    // Security check with custom secret
    if (process.env.CRON_SECRET) {
      const providedSecret = authHeader?.replace('Bearer ', '');
      if (providedSecret !== process.env.CRON_SECRET) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
    }
    
    // Vercel cron jobs include this header
    const cronHeader = request.headers.get('x-vercel-cron');
    if (!cronHeader && process.env.NODE_ENV === 'production') {
      return NextResponse.json({ error: 'Not authorized' }, { status: 401 });
    }


    // ========== TASK 1: AUTO-REJECT EXPIRED SERVICE OFFERS ==========
    
    const fiveDaysAgo = new Date();
    fiveDaysAgo.setDate(fiveDaysAgo.getDate() - 5);
    
    const { data: expiredOffers, error: fetchError } = await supabase
      .from('service_offers')
      .select(`
        *,
        organization:creator_id (
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

        } catch (offerError) {
          console.error(`Error processing offer ${offer.id}:`, offerError);
        }
      }
    } else {
    }

    // ========== TASK 1B: EXPIRE CAPABILITY OFFERS PAST VALID_UNTIL ==========

    const nowIso = new Date().toISOString();
    const { data: validityExpiredOffers, error: validityExpiredError } = await supabase
      .from('service_offers')
      .select('id, title, valid_until')
      .eq('status', 'active')
      .not('valid_until', 'is', null)
      .lt('valid_until', nowIso)
      .limit(1000);

    let deactivatedOfferCount = 0;
    if (validityExpiredError) {
      console.error('Error fetching validity-expired capability offers:', validityExpiredError);
    } else if (validityExpiredOffers && validityExpiredOffers.length > 0) {
      for (const offer of validityExpiredOffers) {
        const { error: deactivateError } = await supabase
          .from('service_offers')
          .update({ status: 'inactive', updated_at: nowIso })
          .eq('id', offer.id);

        if (deactivateError) {
          console.error(`Error deactivating offer ${offer.id}:`, deactivateError);
          continue;
        }

        deactivatedOfferCount++;
      }
    } else {
    }

    // ========== TASK 2: HASHTAG CLEANUP ==========
    
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
          }
        }
      }
    }


    // ========== TASK 3: EXPIRE PROJECTS AND THEIR NEEDS ==========
    try {
      const nowIso = new Date().toISOString();
      const { data: expiredProjects, error: expiredProjectsError } = await supabase
        .from('service_request_projects')
        .select('id, title, valid_until')
        .lt('valid_until', nowIso)
        .neq('status', 'expired')
        .limit(1000);

      if (expiredProjectsError) {
        console.error('Error fetching expired projects:', expiredProjectsError);
      } else if (expiredProjects && expiredProjects.length > 0) {
        let expiredProjectCount = 0;

        for (const proj of expiredProjects) {
          try {
            const { error: updateProjErr } = await supabase
              .from('service_request_projects')
              .update({ status: 'expired', updated_at: nowIso })
              .eq('id', proj.id);

            if (updateProjErr) {
              console.error(`Error expiring project ${proj.id}:`, updateProjErr);
              continue;
            }

            // Expire related needs
            const { error: updateNeedsErr } = await supabase
              .from('service_requests')
              .update({ status: 'expired', updated_at: nowIso })
              .eq('project_id', proj.id)
              .neq('status', 'expired');

            if (updateNeedsErr) {
              console.error(`Error expiring needs for project ${proj.id}:`, updateNeedsErr);
            }

            expiredProjectCount++;
          } catch (procErr) {
            console.error('Error processing project expiry:', procErr);
          }
        }

      } else {
      }
    } catch (expireErr) {
      console.error('Error in project expiry task:', expireErr);
    }

    // ========== TASK 4: CSR CAPABILITY RENTAL SLAs, FINES, REMINDERS ==========
    let csrComplianceStats = { refunds: 0, fines: 0, reminders: 0, suspended: 0 };
    let csrDelhiverySyncStats = { synced: 0, retried: 0 };
    try {
      csrDelhiverySyncStats = await syncAllCsrCapabilityRentalsDelhivery();
      csrComplianceStats = await processCsrCapabilityDailyCompliance();

      const todayIso = new Date().toISOString();
      const { data: endedCampaigns } = await supabase
        .from('campaigns')
        .select('id, end_date, status')
        .eq('status', 'active')
        .not('end_date', 'is', null)
        .lt('end_date', todayIso)
        .limit(200);

      for (const campaign of endedCampaigns || []) {
        await markCsrProjectCompleted({ campaignId: String(campaign.id) });
        await supabase
          .from('campaigns')
          .update({ status: 'completed', updated_at: todayIso })
          .eq('id', campaign.id);
      }
    } catch (csrComplianceErr) {
      console.error('Error in CSR capability compliance task:', csrComplianceErr);
    }

    // ========== TASK 5: DROP EXPIRED OPTIONAL CA COMPLIANCE TAGS ==========
    let documentExpiryStats = { scanned: 0, reminded: 0, tags_dropped: 0, errors: 0 };
    try {
      documentExpiryStats = await processNgoDocumentExpiryJobs();
    } catch (documentExpiryErr) {
      console.error('Error in NGO document expiry task:', documentExpiryErr);
    }

    // ========== FINAL SUMMARY ==========

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
        documentExpiry: documentExpiryStats,
        hashtagCleanup: hashtagStats,
        csrDelhiverySync: csrDelhiverySyncStats,
        csrCapabilityCompliance: csrComplianceStats,
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
