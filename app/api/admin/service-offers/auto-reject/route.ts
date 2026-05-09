import { NextRequest, NextResponse } from 'next/server';
import { autoRejectExpiredServiceOffers } from '@/lib/admin-offer-automation';

// Auto-reject service offers that have been pending for more than 5 days
export async function POST(request: NextRequest) {
  try {
    const result = await autoRejectExpiredServiceOffers();

    return NextResponse.json({
      success: true,
      message: result.rejectedCount > 0 ? `Auto-rejected ${result.rejectedCount} expired offers` : 'No expired offers found',
      rejectedCount: result.rejectedCount,
      rejectedOffers: result.rejectedOffers,
    });

  } catch (error) {
    console.error('Auto-rejection process error:', error);
    return NextResponse.json({ error: 'Auto-rejection process failed' }, { status: 500 });
  }
}