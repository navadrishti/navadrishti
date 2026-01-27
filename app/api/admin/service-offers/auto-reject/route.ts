import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/db';
import { emailService } from '@/lib/email';

// Auto-reject service offers that have been pending for more than 5 days
export async function POST(request: NextRequest) {
  try {
    // Calculate cutoff date (5 days ago)
    const fiveDaysAgo = new Date();
    fiveDaysAgo.setDate(fiveDaysAgo.getDate() - 5);
    
    // Find service offers that are still pending and submitted more than 5 days ago
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

    if (fetchError) {
      console.error('Error fetching expired offers:', fetchError);
      return NextResponse.json({ error: 'Failed to fetch expired offers' }, { status: 500 });
    }

    if (!expiredOffers || expiredOffers.length === 0) {
      return NextResponse.json({ 
        success: true, 
        message: 'No expired offers found',
        rejectedCount: 0 
      });
    }

    const rejectedOffers = [];

    // Auto-reject each expired offer
    for (const offer of expiredOffers) {
      try {
        // Update offer status to rejected
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

        // Send email notification to NGO
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

        console.log(`Auto-rejected offer ${offer.id}: "${offer.title}" for ${offer.organization?.name}`);
      } catch (offerError) {
        console.error(`Error processing offer ${offer.id}:`, offerError);
      }
    }

    console.log(`Auto-rejected ${rejectedOffers.length} expired service offers`);

    return NextResponse.json({
      success: true,
      message: `Auto-rejected ${rejectedOffers.length} expired offers`,
      rejectedCount: rejectedOffers.length,
      rejectedOffers: rejectedOffers.map(offer => ({
        id: offer.id,
        title: offer.title,
        organization: offer.organization?.name
      }))
    });

  } catch (error) {
    console.error('Auto-rejection process error:', error);
    return NextResponse.json({ error: 'Auto-rejection process failed' }, { status: 500 });
  }
}