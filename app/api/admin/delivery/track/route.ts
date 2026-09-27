import { NextRequest, NextResponse } from 'next/server';

import { getAdminUser } from '@/lib/server-auth';
import { getDelhiveryTrackingSnapshot } from '@/lib/delhivery';
import { getErrorMessage } from '@/lib/utils';

export async function POST(request: NextRequest) {
  try {
    const admin = getAdminUser(request);
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
  } catch (error) {
    console.error('Admin Delhivery tracking error:', error);
    return NextResponse.json({ error: getErrorMessage(error) || 'Failed to fetch Delhivery tracking' }, { status: 500 });
  }
}
