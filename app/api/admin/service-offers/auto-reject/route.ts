import { NextRequest, NextResponse } from 'next/server';
import { autoRejectExpiredServiceOffers } from '@/lib/admin-offer-automation';
import { getAdminUser } from '@/lib/server-auth';

export async function POST(request: NextRequest) {
  if (!getAdminUser(request)) {
    return NextResponse.json({ error: 'Admin authentication required' }, { status: 401 });
  }

  try {
    const result = await autoRejectExpiredServiceOffers();

    return NextResponse.json({
      success: true,
      message: 'Capability offers post live without admin review',
      rejectedCount: result.rejectedCount,
      rejectedOffers: result.rejectedOffers,
    });

  } catch (error) {
    console.error('Auto-rejection process error:', error);
    return NextResponse.json({ error: 'Auto-rejection process failed' }, { status: 500 });
  }
}