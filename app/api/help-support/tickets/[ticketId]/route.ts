import { NextRequest, NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';
import { db } from '@/lib/db';
import { sendEmail } from '@/lib/email';
import { JWT_SECRET } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type JWTPayload = {
  id: number;
  user_type: string;
  name?: string;
  email?: string;
};

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const getAuthenticatedUser = async (request: NextRequest) => {
  const authHeader = request.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }

  try {
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET) as JWTPayload;
    const user = await db.users.findById(decoded.id);
    if (!user) return null;
    return {
      id: user.id,
      name: user.name || decoded.name,
      email: user.email || decoded.email,
      user_type: decoded.user_type || user.user_type,
    };
  } catch {
    return null;
  }
};

const sanitizeTicketForUser = (ticket: any) => ({
  id: ticket.id,
  ticket_id: ticket.ticket_id,
  title: ticket.title,
  description: ticket.description,
  proof_url: ticket.proof_url,
  status: ticket.status,
  created_at: ticket.created_at,
  updated_at: ticket.updated_at,
  resolved_at: ticket.resolved_at,
});

export async function GET(request: NextRequest, { params }: { params: Promise<{ ticketId: string }> }) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const { ticketId } = await params;
    if (!ticketId) {
      return NextResponse.json({ error: 'Ticket ID is required' }, { status: 400 });
    }

    const ticket = await db.supportTickets.getByTicketId(ticketId);
    if (!ticket) {
      return NextResponse.json({ error: 'Ticket not found' }, { status: 404 });
    }

    if (Number(ticket.user_id) !== Number(user.id)) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const messages = await db.supportTicketMessages.getByTicketId(ticketId);
    const userMessages = messages.map((message: any) => ({
      id: message.id,
      sender_type: message.sender_type,
      message_type: message.message_type,
      content: message.content,
      attachment_url: message.attachment_url,
      created_at: message.created_at,
    }));

    return NextResponse.json({
      success: true,
      ticket: sanitizeTicketForUser(ticket),
      messages: userMessages,
    });
  } catch (error: any) {
    console.error('User support ticket fetch error:', error);
    return NextResponse.json({ error: error?.message || 'Failed to load ticket' }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ ticketId: string }> }) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const { ticketId } = await params;
    const body = await request.json();
    const message = String(body?.message || '').trim();

    if (!ticketId) {
      return NextResponse.json({ error: 'Ticket ID is required' }, { status: 400 });
    }

    if (message.length < 2) {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 });
    }

    const ticket = await db.supportTickets.getByTicketId(ticketId);
    if (!ticket) {
      return NextResponse.json({ error: 'Ticket not found' }, { status: 404 });
    }

    if (Number(ticket.user_id) !== Number(user.id)) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    if (ticket.status === 'closed') {
      return NextResponse.json({ error: 'This ticket is closed. Open a new ticket if you need further help.' }, { status: 400 });
    }

    await db.supportTicketMessages.create({
      ticket_id: ticketId,
      sender_id: user.id,
      sender_type: user.user_type,
      message_type: 'user_reply',
      content: message,
      created_at: new Date().toISOString(),
    });

    const nextStatus = ticket.status === 'resolved' ? 'open' : ticket.status === 'open' ? 'open' : 'in_progress';

    const updatedTicket = await db.supportTickets.update(ticket.id, {
      status: nextStatus,
      updated_at: new Date().toISOString(),
      resolved_at: null,
    });

    const adminEmail = process.env.SUPPORT_EMAIL || process.env.EMAIL_REPLY_TO || process.env.SMTP_FROM || process.env.SMTP_USER;
    if (adminEmail) {
      await sendEmail({
        to: adminEmail,
        subject: `[Support Reply] ${ticketId} - ${ticket.title}`,
        html: `
          <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #1f2937;">
            <h2 style="margin: 0 0 12px; color: #1d4ed8;">Support Ticket Reply</h2>
            <p><strong>Ticket ID:</strong> ${escapeHtml(ticketId)}</p>
            <p><strong>From:</strong> ${escapeHtml(String(user.name || 'User'))} (${escapeHtml(String(user.email || ''))})</p>
            <div style="white-space: pre-wrap; background: #f9fafb; border: 1px solid #e5e7eb; padding: 12px; border-radius: 8px;">${escapeHtml(message)}</div>
          </div>
        `,
        text: `Ticket ${ticketId}\nFrom: ${user.name || 'User'} (${user.email || ''})\n\n${message}`,
        replyTo: user.email || undefined,
      });
    }

    const messages = await db.supportTicketMessages.getByTicketId(ticketId);

    return NextResponse.json({
      success: true,
      ticket: sanitizeTicketForUser(updatedTicket || ticket),
      messages: messages.map((item: any) => ({
        id: item.id,
        sender_type: item.sender_type,
        message_type: item.message_type,
        content: item.content,
        attachment_url: item.attachment_url,
        created_at: item.created_at,
      })),
    });
  } catch (error: any) {
    console.error('User support ticket reply error:', error);
    return NextResponse.json({ error: error?.message || 'Failed to send message' }, { status: 500 });
  }
}
