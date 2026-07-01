import { NextRequest, NextResponse } from 'next/server';
import { db, supabase } from '@/lib/db';
import { sendEmail } from '@/lib/email';
import { verifyToken } from '@/lib/auth';
import { parseAmountToInr, processAdminRefund } from '@/lib/admin-refund';

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
    const statusInput = body?.status;
    const status = statusInput === undefined || statusInput === null || statusInput === ''
      ? undefined
      : String(statusInput).trim().toLowerCase();
    const admin_notes = body?.admin_notes === undefined ? undefined : String(body.admin_notes || '').trim();
    const replyMessage = body?.reply_message === undefined ? undefined : String(body.reply_message || '').trim();

    if (!ticketId) {
      return NextResponse.json({ error: 'Ticket ID is required' }, { status: 400 });
    }

    if (status && !['open', 'in_progress', 'resolved', 'closed'].includes(status)) {
      return NextResponse.json({ error: 'Invalid ticket status' }, { status: 400 });
    }

    const { data: existingTicket, error: existingError } = await supabase
      .from('support_tickets')
      .select('*')
      .eq('ticket_id', ticketId)
      .single();

    if (existingError) throw existingError;

    const nextStatus = status || existingTicket?.status || 'open';

    const nextAdminNotes = (() => {
      const base = String(existingTicket?.admin_notes || '').trim();
      const notes = admin_notes !== undefined ? admin_notes : base;
      if (!replyMessage) return notes || null;

      const timestamp = new Date().toISOString();
      const replyEntry = `Reply ${timestamp}: ${replyMessage}`;
      return [notes, replyEntry].filter(Boolean).join('\n\n');
    })();

    const updatePayload: Record<string, any> = {
      status: nextStatus,
      updated_at: new Date().toISOString(),
      resolved_at: nextStatus === 'resolved' || nextStatus === 'closed' ? new Date().toISOString() : null,
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

    const result = await processAdminRefund({
      admin,
      serviceRequestId,
      refundPaymentId,
      requestedRefundInr,
      refundReason,
      supportTicketId: ticketId,
    });

    return NextResponse.json({ success: true, data: result });
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

    const ticket = await db.supportTickets.getByTicketId(ticketId);
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
