import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getTokenClaims } from '@/lib/auth';
import { getErrorMessage } from '@/lib/utils';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const getAuthenticatedUser = async (request: NextRequest) => {
  const claims = getTokenClaims(request);
  if (!claims) return null;
  const user = await db.users.findById(claims.id);
  if (!user) return null;
  return { ...user, user_type: claims.user_type || user.user_type };
};

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const statusParam = String(request.nextUrl.searchParams.get('status') || 'all').toLowerCase();
    const status = statusParam === 'open' || statusParam === 'closed' ? statusParam : undefined;

    const tickets = await db.supportTickets.getByUserId(user.id, status ? { status } : {});

    const sanitized = tickets.map((ticket) => ({
      id: ticket.id,
      ticket_id: ticket.ticket_id,
      title: ticket.title,
      description: ticket.description,
      proof_url: ticket.proof_url,
      status: ticket.status,
      created_at: ticket.created_at,
      updated_at: ticket.updated_at,
      resolved_at: ticket.resolved_at,
    }));

    return NextResponse.json({ success: true, tickets: sanitized });
  } catch (error) {
    console.error('User support tickets list error:', error);
    return NextResponse.json({ error: getErrorMessage(error) || 'Failed to load tickets' }, { status: 500 });
  }
}
