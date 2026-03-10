import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/db';
import { verifyToken } from '@/lib/auth';
import { emailService } from '@/lib/email';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ offerId: string }> }
) {
  try {
    const { offerId } = await params;
    const { action, comments } = await request.json();

    // Check for admin token authentication
    const adminToken = request.cookies.get('admin-token')?.value;
    
    if (!adminToken) {
      return NextResponse.json({ error: 'Admin authentication required' }, { status: 401 });
    }

    // Verify admin token
    try {
      const decoded = verifyToken(adminToken);
      if (!decoded || decoded.id !== -1) {
        return NextResponse.json({ error: 'Invalid admin token' }, { status: 401 });
      }
    } catch (error) {
      return NextResponse.json({ error: 'Invalid admin token' }, { status: 401 });
    }

    if (!['approve', 'reject'].includes(action)) {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }

    if (!comments || comments.trim().length === 0) {
      return NextResponse.json({ error: 'Review comments are required' }, { status: 400 });
    }

    // Get the service offer with organization details
    const { data: serviceOffer, error: fetchError } = await supabase
      .from('service_offers')
      .select(`
        *,
        organization:ngo_id (
          id,
          name,
          email,
          profile_image
        )
      `)
      .eq('id', parseInt(offerId))
      .single();

    if (fetchError || !serviceOffer) {
      return NextResponse.json({ error: 'Service offer not found' }, { status: 404 });
    }

    // Update the service offer with admin decision
    const updateData = {
      admin_status: action === 'approve' ? 'approved' : 'rejected',
      admin_reviewed_at: new Date().toISOString(),
      admin_reviewed_by: null, // No admin user in database, using environment auth
      admin_comments: comments.trim(),
      // If approved, set the offer as active
      ...(action === 'approve' ? { status: 'active' } : {})
    };

    const { error: updateError } = await supabase
      .from('service_offers')
      .update(updateData)
      .eq('id', parseInt(offerId));

    if (updateError) {
      console.error('Error updating service offer:', updateError);
      return NextResponse.json({ error: 'Failed to update service offer' }, { status: 500 });
    }

    // Create detailed audit record in service_offer_reviews table
    const { error: auditError } = await supabase
      .from('service_offer_reviews')
      .insert({
        service_offer_id: parseInt(offerId),
        review_action: action === 'approve' ? 'approved' : 'rejected',
        admin_comments: comments.trim(),
        offer_snapshot: serviceOffer, // Store complete offer data for audit
        admin_username: 'admin',
        admin_ip_address: request.headers.get('x-forwarded-for') || 
                         request.headers.get('x-real-ip') || 
                         '127.0.0.1',
        admin_user_agent: request.headers.get('user-agent'),
        review_priority: 3, // Default priority
        review_category: 'standard_review'
      });

    if (auditError) {
      console.error('Error creating audit record:', auditError);
      // Don't fail the request, just log the error
    }

    if (updateError) {
      console.error('Error updating service offer:', updateError);
      return NextResponse.json({ error: 'Failed to update service offer' }, { status: 500 });
    }

    // Send notification email to the organization
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

      // Create notification record before sending
      const { data: notificationRecord } = await supabase
        .from('service_offer_notifications')
        .insert({
          service_offer_id: parseInt(offerId),
          notification_type: isApproved ? 'approval' : 'rejection',
          recipient_email: serviceOffer.organization.email,
          recipient_user_id: serviceOffer.organization.id,
          subject: subject,
          email_body: emailBody,
          delivery_status: 'pending'
        })
        .select()
        .single();

      // Send the email
      const emailResult = await emailService.sendEmail({
        to: serviceOffer.organization.email,
        subject,
        html: emailBody
      });

      // Update notification record with delivery status
      if (notificationRecord) {
        await supabase
          .from('service_offer_notifications')
          .update({
            sent_at: new Date().toISOString(),
            delivery_status: 'sent',
            email_service_response: emailResult || {}
          })
          .eq('id', notificationRecord.id);
      }

    } catch (emailError) {
      console.error('Error sending notification email:', emailError);
      
      // Update notification record with failure status if record exists
      try {
        await supabase
          .from('service_offer_notifications')
          .update({
            delivery_status: 'failed',
            failure_reason: emailError instanceof Error ? emailError.message : 'Unknown email error'
          })
          .eq('service_offer_id', parseInt(offerId))
          .eq('delivery_status', 'pending')
          .order('created_at', { ascending: false })
          .limit(1);
      } catch (updateError) {
        console.error('Error updating notification status:', updateError);
      }
      
      // Don't fail the entire operation if email fails
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