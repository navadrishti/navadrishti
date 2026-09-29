import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/db';
import { getAdminUser } from '@/lib/server-auth';
import { emailService } from '@/lib/email';
import { getClientIp } from '@/lib/rate-limit';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ offerId: string }> }
) {
  try {
    if (!getAdminUser(request)) {
      return NextResponse.json({ error: 'Admin authentication required' }, { status: 401 });
    }

    const { offerId } = await params;
    const serviceOfferId = Number.parseInt(offerId, 10) || 0;
    const body = await request.json().catch(() => ({}));
    const action = body?.action;
    const comments = typeof body?.comments === 'string' ? body.comments : '';

    if (!['approve', 'reject'].includes(action)) {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }

    if (!comments.trim()) {
      return NextResponse.json({ error: 'Review comments are required' }, { status: 400 });
    }

    const { data: serviceOffer, error: fetchError } = await supabase
      .from('service_offers')
      .select(`
        *,
        organization:users!creator_id (
          id,
          name,
          email,
          profile_image
        )
      `)
      .eq('id', serviceOfferId)
      .maybeSingle();

    if (fetchError || !serviceOffer) {
      return NextResponse.json({ error: 'Service offer not found' }, { status: 404 });
    }

    const updateData = {
      admin_status: action === 'approve' ? 'approved' : 'rejected',
      admin_reviewed_at: new Date().toISOString(),
      admin_reviewed_by: null,
      admin_comments: comments.trim(),
      ...(action === 'approve' ? { status: 'active' } : {})
    };

    const { error: updateError } = await supabase
      .from('service_offers')
      .update(updateData)
      .eq('id', serviceOfferId);

    if (updateError) {
      console.error('Error updating service offer:', updateError);
      return NextResponse.json({ error: 'Failed to update service offer' }, { status: 500 });
    }

    const { error: auditError } = await supabase
      .from('service_offer_reviews')
      .insert({
        service_offer_id: serviceOfferId,
        review_action: action === 'approve' ? 'approved' : 'rejected',
        admin_comments: comments.trim(),
        offer_snapshot: serviceOffer,
        admin_username: 'admin',
        admin_ip_address: getClientIp(request),
        admin_user_agent: request.headers.get('user-agent'),
        review_priority: 3,
        review_category: 'standard_review'
      });

    if (auditError) {
      console.error('Error creating audit record:', auditError);
    }

    try {
      const isApproved = action === 'approve';
      const subject = `Service Offer ${isApproved ? 'Approved' : 'Rejected'} - ${serviceOffer.title}`;
      
      const emailBody = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: ${isApproved ? '#16a34a' : '#dc2626'};">
            Service Offer ${isApproved ? 'Approved' : 'Rejected'}
          </h2>
          
          <p>Dear ${serviceOffer.organization.name},</p>
          
          <p>Your service offer "<strong>${serviceOffer.title}</strong>" has been <strong>${action}d</strong> by our admin team.</p>
          
          <div style="background-color: #f3f4f6; padding: 15px; border-radius: 8px; margin: 20px 0;">
            <h3 style="margin-top: 0;">Admin Comments:</h3>
            <p style="margin-bottom: 0;">${comments}</p>
          </div>
          
          ${isApproved ? `
            <p><strong>Great news!</strong> Your service offer is now live and visible to potential candidates on our platform.</p>
            <p>You can manage your service offer and view applications through your dashboard.</p>
          ` : `
            <p>Please review the admin comments and feel free to create a new service offer that addresses the feedback provided.</p>
          `}
          
          <p>If you have any questions, please don't hesitate to contact our support team.</p>
          
          <hr style="margin: 30px 0; border: none; border-top: 1px solid #e5e7eb;">
          <p style="color: #6b7280; font-size: 14px;">
            This is an automated email. Please do not reply directly to this message.
          </p>
        </div>
      `;

      const emailResult = await emailService.sendEmail({
        to: serviceOffer.organization.email,
        subject,
        html: emailBody
      });

      if (emailResult) {
        const { error: updateReviewError } = await supabase
          .from('service_offer_reviews')
          .update({
            review_category: isApproved ? 'approval_email_sent' : 'rejection_email_sent'
          })
          .eq('service_offer_id', serviceOfferId)
          .eq('review_action', action === 'approve' ? 'approved' : 'rejected')
          .order('created_at', { ascending: false })
          .limit(1);

        if (updateReviewError) {
          console.error('Error updating review audit record:', updateReviewError);
        }
      }

    } catch (emailError) {
      console.error('Error sending notification email:', emailError);
    }

    return NextResponse.json({ 
      success: true, 
      message: `Service offer ${action}d successfully` 
    });

  } catch (error) {
    console.error('Admin review error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}