import { createHash, timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import Razorpay from 'razorpay';
import { supabase } from '@/lib/db';
import { releaseHeldTransfersForClosedRequests } from '@/lib/service-request-payments';
import { autoRejectExpiredServiceOffers } from '@/lib/admin-offer-automation';
import { processCsrCapabilityDailyCompliance, markCsrProjectCompleted, syncAllCsrCapabilityRentalsDelhivery } from '@/lib/csr-agent/campaign';
import { getDocumentExpiries, dropExpiredCaComplianceTags } from '@/lib/auth';
import { backfillServiceOfferEmbeddings } from '@/lib/embeddings';
import { parseJsonObject, getErrorMessage } from '@/lib/utils';
import { isMissingStoreError } from '@/lib/auth-store';

function secretsMatch(provided: string, expected: string) {
  const digest = (value: string) => createHash('sha256').update(value).digest();
  return timingSafeEqual(digest(provided), digest(expected));
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
      const profileData = parseJsonObject(user.profile_data);
      if (profileData.reverification_pending) continue;

      stats.scanned += 1;
      const dropped = dropExpiredCaComplianceTags(profileData);
      const rawExpiries = parseJsonObject(profileData.document_expiries);
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

      // Mid-project edge: if CSR-1 lapsed, stop new CSR takeovers on this NGO's open projects.
      // Ongoing assigned work is not deleted; company funding is blocked separately via live CSR-1 checks.
      if (dropped.dropped.includes('csr1')) {
        const { error: lockError } = await supabase
          .from('service_request_projects')
          .update({
            csr_project_available_for_csr: false,
            updated_at: reviewedAt,
          })
          .eq('ngo_id', user.id)
          .eq('csr_project_available_for_csr', true)
          .not('status', 'in', '(completed,cancelled,expired)');
        if (lockError) {
          console.error(`document expiry: failed to lock CSR availability for user ${user.id}`, lockError);
        }
      }
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
 * 2. Expire projects and their needs
 * 3. CSR capability daily compliance / Delhivery sync
 * 4. Drop expired optional CA compliance tags (12A / 80G / CSR-1 / FCRA). Never unverify.
 * 5. Embed active service offers that have no embedding yet
 * 6. Release held financial-need contributions once the need stops collecting
 * 7. Purge stale auth rate-limit hits and one-time codes
 */
export async function GET(request: NextRequest) {
  try {
    const cronSecret = String(process.env.CRON_SECRET || '').trim();
    const authHeader = request.headers.get('authorization') || '';
    const providedSecret = authHeader.replace(/^Bearer\s+/i, '').trim();

    const authorized = cronSecret
      ? secretsMatch(providedSecret, cronSecret)
      : process.env.NODE_ENV === 'development';
    if (!authorized) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let autoRejectExpired: Awaited<ReturnType<typeof autoRejectExpiredServiceOffers>> = { rejectedCount: 0, rejectedOffers: [] };
    try {
      autoRejectExpired = await autoRejectExpiredServiceOffers();
    } catch (autoRejectErr) {
      console.error('Error auto-rejecting expired offers:', autoRejectErr);
    }

    // Expire capability offers past valid_until.

    const nowIso = new Date().toISOString();
    const { data: validityExpiredOffers, error: validityExpiredError } = await supabase
      .from('service_offers')
      .select('id, title, valid_until')
      .eq('status', 'active')
      .not('valid_until', 'is', null)
      .lt('valid_until', nowIso)
      .limit(1000);

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
        }
      }
    }

    // Expire projects and their needs.
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
          } catch (procErr) {
            console.error('Error processing project expiry:', procErr);
          }
        }

      }
    } catch (expireErr) {
      console.error('Error in project expiry task:', expireErr);
    }

    // CSR capability rentals: SLAs, fines, reminders.
    let csrComplianceStats = { refunds: 0, fines: 0, reminders: 0, suspended: 0 };
    let csrDelhiverySyncStats = { synced: 0, retried: 0 };
    try {
      csrDelhiverySyncStats = await syncAllCsrCapabilityRentalsDelhivery();
      csrComplianceStats = await processCsrCapabilityDailyCompliance();

      const todayIso = new Date().toISOString();
      const { data: endedCampaigns } = await supabase
        .from('campaigns')
        .select('id, end_date, status, impact_metrics')
        .eq('status', 'active')
        .not('end_date', 'is', null)
        .lt('end_date', todayIso)
        .limit(200);

      for (const campaign of endedCampaigns || []) {
        await markCsrProjectCompleted({ campaignId: String(campaign.id) });
        await supabase
          .from('campaigns')
          .update({
            status: 'completed',
            impact_metrics: { ...parseJsonObject(campaign.impact_metrics), completed_at: todayIso },
            updated_at: todayIso,
          })
          .eq('id', campaign.id);

        try {
          const { processCompletedCampaignVolunteerOutcomes } = await import('@/lib/db');
          await processCompletedCampaignVolunteerOutcomes(String(campaign.id), {
            treatAsCompleted: true,
          });
        } catch (volunteerOutcomeErr) {
          console.error('Campaign volunteer outcome processing failed:', volunteerOutcomeErr);
        }
      }
    } catch (csrComplianceErr) {
      console.error('Error in CSR capability compliance task:', csrComplianceErr);
    }

    // Drop expired optional CA compliance tags.
    let documentExpiryStats = { scanned: 0, reminded: 0, tags_dropped: 0, errors: 0 };
    try {
      documentExpiryStats = await processNgoDocumentExpiryJobs();
    } catch (documentExpiryErr) {
      console.error('Error in NGO document expiry task:', documentExpiryErr);
    }

    // Embed active offers that were missed when they were saved.
    let offerEmbeddingStats = { embedded: 0, failed: 0 };
    try {
      offerEmbeddingStats = await backfillServiceOfferEmbeddings();
    } catch (offerEmbeddingErr) {
      console.error('Error in offer embedding backfill:', offerEmbeddingErr);
    }

    // Release held contributions for needs that stopped collecting.
    let heldTransfersReleased = 0;
    try {
      const keyId = process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID;
      const keySecret = process.env.RAZORPAY_KEY_SECRET;
      if (keyId && keySecret) {
        heldTransfersReleased = await releaseHeldTransfersForClosedRequests(
          new Razorpay({ key_id: keyId, key_secret: keySecret })
        );
      }
    } catch (heldTransferErr) {
      console.error('Error releasing held contribution transfers:', heldTransferErr);
    }

    // Purge old rate-limit hits and used or expired one-time codes.
    let authThrottleRowsDeleted = 0;
    try {
      const { data, error } = await supabase.rpc('auth_throttle_cleanup');
      if (error && !isMissingStoreError(error)) throw error;
      authThrottleRowsDeleted = data ?? 0;
    } catch (authThrottleErr) {
      console.error('Error in auth throttle cleanup:', authThrottleErr);
    }

    return NextResponse.json({
      success: true,
      message: 'Daily cleanup completed successfully',
      timestamp: new Date().toISOString(),
      tasks: {
        autoRejectExpired,
        documentExpiry: documentExpiryStats,
        csrDelhiverySync: csrDelhiverySyncStats,
        csrCapabilityCompliance: csrComplianceStats,
        offerEmbeddings: offerEmbeddingStats,
        heldTransfersReleased,
        authThrottleCleanup: { deleted: authThrottleRowsDeleted },
      }
    });

  } catch (error) {
    console.error('Daily cleanup cron job error:', error);
    return NextResponse.json({ 
      error: 'Daily cleanup cron job failed',
      details: getErrorMessage(error) || 'Unknown error',
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}

// Support POST method for manual triggering
export async function POST(request: NextRequest) {
  return GET(request);
}
