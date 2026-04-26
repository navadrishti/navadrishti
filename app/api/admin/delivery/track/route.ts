import { NextRequest, NextResponse } from 'next/server';

import { verifyToken } from '@/lib/auth';
import { getDelhiveryTrackingSnapshot } from '@/lib/delhivery';

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

export async function POST(request: NextRequest) {
  try {
    const admin = isAdminRequest(request);
    if (!admin) {
      return NextResponse.json({ error: 'Admin authentication required' }, { status: 401 });
    }

    const body = await request.json();
    const trackingId = String(body?.trackingId || '').trim();

    if (!trackingId) {
      return NextResponse.json({ error: 'Tracking ID is required' }, { status: 400 });
    }

    const snapshot = await getDelhiveryTrackingSnapshot(trackingId);

    return NextResponse.json({
      success: true,
      data: {
        provider: snapshot.provider,
        trackingId: snapshot.trackingId,
        currentStatus: snapshot.currentStatus,
        lastEventAt: snapshot.lastEventAt,
        lastLocation: snapshot.lastLocation,
        events: snapshot.events
      }
    });
  } catch (error: any) {
    console.error('Admin Delhivery tracking error:', error);
    return NextResponse.json({ error: error?.message || 'Failed to fetch Delhivery tracking' }, { status: 500 });
  }
}
