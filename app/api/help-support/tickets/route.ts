import { NextRequest, NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';
import { db } from '@/lib/db';
import { JWT_SECRET } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type JWTPayload = {
  id: number;
  user_type: string;
};

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
    return { ...user, user_type: decoded.user_type || user.user_type };
  } catch {
    return null;
  }
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

    const sanitized = tickets.map((ticket: any) => ({
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
  } catch (error: any) {
    console.error('User support tickets list error:', error);
    return NextResponse.json({ error: error?.message || 'Failed to load tickets' }, { status: 500 });
  }
}
