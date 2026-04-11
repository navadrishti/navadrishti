import { NextRequest, NextResponse } from 'next/server';
import Razorpay from 'razorpay';
import { db, supabase } from '@/lib/db';
import { sendEmail } from '@/lib/email';
import { verifyToken } from '@/lib/auth';

const parseAmountToInr = (value: unknown): number => {
  if (value === null || value === undefined) return 0;
  const text = String(value).trim();
  if (!text) return 0;
  const numericText = text.replace(/[^\d.-]/g, '');
  const parsed = Number(numericText);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
};

const isFinancialRequest = (request: any, requirements: Record<string, any>): boolean => {
  const requestType = String(requirements?.request_type || request?.request_type || request?.category || '').toLowerCase();
  return requestType.includes('financial');
};

const isAdminRequest = (request: NextRequest) => {
  const adminToken = request.cookies.get('admin-token')?.value;
  if (!adminToken) return null;

  try {
    const decoded = verifyToken(adminToken);
    if (!decoded || decoded.id !== -1) return null;
    return decoded;
  } catch {
    return null;
  }
};

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ ticketId: string }> }) {
  try {
    const admin = isAdminRequest(request);
    if (!admin) {
      return NextResponse.json({ error: 'Admin authentication required' }, { status: 401 });
    }

    const { ticketId } = await params;
    const body = await request.json();
    const status = String(body?.status || '').trim().toLowerCase();
    const admin_notes = body?.admin_notes === undefined ? undefined : String(body.admin_notes || '').trim();
    const replyMessage = body?.reply_message === undefined ? undefined : String(body.reply_message || '').trim();

    if (!ticketId) {
      return NextResponse.json({ error: 'Ticket ID is required' }, { status: 400 });
    }

    if (!['open', 'in_progress', 'resolved', 'closed'].includes(status)) {
      return NextResponse.json({ error: 'Invalid ticket status' }, { status: 400 });
    }

    const { data: existingTicket, error: existingError } = await supabase
      .from('support_tickets')
      .select('*')
      .eq('ticket_id', ticketId)
      .single();

    if (existingError) throw existingError;

    const nextAdminNotes = (() => {
      const base = String(existingTicket?.admin_notes || '').trim();
      const notes = admin_notes !== undefined ? admin_notes : base;
      if (!replyMessage) return notes || null;

      const timestamp = new Date().toISOString();
      const replyEntry = `Reply ${timestamp}: ${replyMessage}`;
      return [notes, replyEntry].filter(Boolean).join('\n\n');
    })();

    const updatePayload: Record<string, any> = {
      status,
      updated_at: new Date().toISOString(),
      resolved_at: status === 'resolved' || status === 'closed' ? new Date().toISOString() : null,
    };

    if (nextAdminNotes !== undefined) {
      updatePayload.admin_notes = nextAdminNotes || null;
    }

    const { data, error } = await supabase
      .from('support_tickets')
      .update(updatePayload)
      .eq('ticket_id', ticketId)
      .select(`
        *,
        user:users!user_id(id, name, email, user_type, verification_status, profile_image)
      `)
      .single();

    if (error) throw error;

    if (replyMessage && (data?.user_email || data?.user?.email)) {
      const recipientEmail = data.user_email || data.user.email;
      await db.supportTicketMessages.create({
        ticket_id: ticketId,
        sender_id: admin.id,
        sender_type: 'admin',
        message_type: 'admin_reply',
        content: replyMessage,
        created_at: new Date().toISOString(),
      });

      await sendEmail({
        to: recipientEmail,
        subject: `Update on your support ticket ${ticketId}`,
        html: `
          <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #1f2937;">
            <h2 style="margin: 0 0 12px; color: #1d4ed8;">Support Ticket Reply</h2>
            <p><strong>Ticket ID:</strong> ${ticketId}</p>
            <p><strong>Title:</strong> ${String(data.title || '')}</p>
            <div style="white-space: pre-wrap; background: #f9fafb; border: 1px solid #e5e7eb; padding: 12px; border-radius: 8px;">${replyMessage.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>
          </div>
        `,
        text: `Support Ticket ${ticketId}\n\n${replyMessage}`,
        replyTo: process.env.EMAIL_REPLY_TO || process.env.SMTP_REPLY_TO || undefined,
      });
    }

    return NextResponse.json({ success: true, ticket: data });
  } catch (error: any) {
    console.error('Admin support ticket update error:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ ticketId: string }> }) {
  try {
    const admin = isAdminRequest(request);
    if (!admin) {
      return NextResponse.json({ error: 'Admin authentication required' }, { status: 401 });
    }

    const { ticketId } = await params;
    const body = await request.json();
    const serviceRequestId = Number(body?.service_request_id);
    const refundPaymentId = String(body?.razorpay_payment_id || '').trim();
    const requestedRefundInr = parseAmountToInr(body?.amount);
    const refundReason = String(body?.reason || 'admin_support_refund').trim();

    if (!ticketId) {
      return NextResponse.json({ error: 'Ticket ID is required' }, { status: 400 });
    }

    if (!Number.isFinite(serviceRequestId) || serviceRequestId <= 0) {
      return NextResponse.json({ error: 'Valid service request ID is required for refunds' }, { status: 400 });
    }

    if (!refundPaymentId) {
      return NextResponse.json({ error: 'Razorpay payment ID is required' }, { status: 400 });
    }

    const keySecret = process.env.RAZORPAY_KEY_SECRET;
    const keyId = process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID;
    if (!keySecret || !keyId) {
      return NextResponse.json({ error: 'Razorpay is not configured' }, { status: 500 });
    }

    const serviceRequest = await db.serviceRequests.getById(serviceRequestId);
    if (!serviceRequest) {
      return NextResponse.json({ error: 'Service request not found' }, { status: 404 });
    }

    const requirements = (() => {
      try {
        return typeof serviceRequest.requirements === 'string'
          ? JSON.parse(serviceRequest.requirements)
          : (serviceRequest.requirements || {});
      } catch {
        return {};
      }
    })() as Record<string, any>;

    if (!isFinancialRequest(serviceRequest, requirements)) {
      return NextResponse.json({ error: 'Refunds only apply to financial requests' }, { status: 400 });
    }

    const previousPayments = Array.isArray(requirements?.financial_transactions)
      ? requirements.financial_transactions
      : [];

    const paymentEntry = previousPayments.find((item: any) => item?.razorpay_payment_id === refundPaymentId);
    if (!paymentEntry) {
      return NextResponse.json({ error: 'Payment record not found in this request' }, { status: 404 });
    }

    if (paymentEntry?.refund_status === 'processed') {
      return NextResponse.json({ success: true, data: { message: 'Refund already processed', payment_id: refundPaymentId } });
    }

    const razorpay = new Razorpay({ key_id: keyId, key_secret: keySecret });
    const paidInr = parseAmountToInr(paymentEntry.amount_inr);
    const refundInr = requestedRefundInr > 0 ? Math.min(requestedRefundInr, paidInr) : paidInr;

    const refundPayload: any = {
      notes: {
        service_request_id: String(serviceRequestId),
        admin_ticket_id: String(ticketId),
        reason: refundReason
      }
    };
    if (refundInr > 0) {
      refundPayload.amount = Math.round(refundInr * 100);
    }

    const refund = await razorpay.payments.refund(refundPaymentId, refundPayload);

    const updatedTransactions = previousPayments.map((item: any) => {
      if (item?.razorpay_payment_id !== refundPaymentId) return item;
      return {
        ...item,
        refund_status: 'processed',
        refund_id: refund?.id || null,
        refund_reason: refundReason,
        refunded_amount_inr: refundInr,
        refunded_at: new Date().toISOString(),
        refunded_by_admin_id: admin.id
      };
    });

    const currentRaisedInr = parseAmountToInr(requirements?.funds_raised_inr);
    const nextRaisedInr = Math.max(0, currentRaisedInr - refundInr);
    const targetInr = parseAmountToInr(requirements?.funding_target_inr ?? requirements?.estimated_budget ?? requirements?.budget);

    const nextRequirements = {
      ...requirements,
      funds_raised_inr: Number(nextRaisedInr.toFixed(2)),
      funds_remaining_inr: targetInr > 0 ? Number(Math.max(0, targetInr - nextRaisedInr).toFixed(2)) : null,
      financial_transactions: updatedTransactions
    };

    await db.serviceRequests.update(serviceRequestId, {
      requirements: JSON.stringify(nextRequirements),
      status: nextRaisedInr > 0 ? 'in_progress' : 'active',
      updated_at: new Date().toISOString()
    });

    const { data: ticketRow } = await supabase
      .from('support_tickets')
      .select('*')
      .eq('ticket_id', ticketId)
      .single();

    if (ticketRow) {
      const updatedNotes = [
        String(ticketRow.admin_notes || '').trim(),
        `Refund initiated ${new Date().toISOString()}: payment ${refundPaymentId}, amount INR ${refundInr.toFixed(2)}, reason ${refundReason}`
      ].filter(Boolean).join('\n\n');

      await db.supportTicketMessages.create({
        ticket_id: ticketId,
        sender_id: admin.id,
        sender_type: 'admin',
        message_type: 'refund_initiated',
        content: `Refund initiated for payment ${refundPaymentId}. Amount: INR ${refundInr.toFixed(2)}. Reason: ${refundReason}`,
        created_at: new Date().toISOString(),
      });

      await supabase
        .from('support_tickets')
        .update({
          status: 'resolved',
          resolved_at: new Date().toISOString(),
          admin_notes: updatedNotes,
          updated_at: new Date().toISOString(),
        })
        .eq('ticket_id', ticketId);
    }

    return NextResponse.json({
      success: true,
      data: {
        message: 'Refund initiated successfully',
        refund_id: refund?.id || null,
        refunded_amount_inr: refundInr,
        fundsRaisedInr: Number(nextRaisedInr.toFixed(2)),
        targetInr
      }
    });
  } catch (error: any) {
    console.error('Admin support ticket refund error:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ ticketId: string }> }) {
  try {
    const admin = isAdminRequest(request);
    if (!admin) {
      return NextResponse.json({ error: 'Admin authentication required' }, { status: 401 });
    }

    const { ticketId } = await params;
    if (!ticketId) {
      return NextResponse.json({ error: 'Ticket ID is required' }, { status: 400 });
    }

    const ticket = await db.supportTickets.getById(ticketId);
    if (!ticket) {
      return NextResponse.json({ error: 'Ticket not found' }, { status: 404 });
    }

    const messages = await db.supportTicketMessages.getByTicketId(ticketId);

    return NextResponse.json({ success: true, ticket, messages });
  } catch (error: any) {
    console.error('Admin support ticket fetch error:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
