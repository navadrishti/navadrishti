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
 */
export async function GET(request: NextRequest) {
  try {
    const cronSecret = String(process.env.CRON_SECRET || '').trim();
    const authHeader = request.headers.get('authorization') || '';
    const providedSecret = authHeader.replace(/^Bearer\s+/i, '').trim();

    if (process.env.NODE_ENV === 'production' || cronSecret) {
      if (!cronSecret || providedSecret !== cronSecret) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
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

    // ========== TASK 2: EXPIRE PROJECTS AND THEIR NEEDS ==========
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
        csrDelhiverySync: csrDelhiverySyncStats,
        csrCapabilityCompliance: csrComplianceStats,
      }
    });

  } catch (error: any) {
    console.error('Daily cleanup cron job error:', error);
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
