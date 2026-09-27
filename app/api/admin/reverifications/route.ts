import { NextRequest, NextResponse } from 'next/server';
import { assertAdminUser } from '@/lib/server-auth';
import { listPendingReverifications } from '@/lib/reverification';
import { getErrorMessage } from '@/lib/utils';

export async function GET(request: NextRequest) {
  try {
    assertAdminUser(request);

    const { searchParams } = new URL(request.url);
    const limit = Math.min(Number(searchParams.get('limit') || '100'), 500);
    const reverifications = await listPendingReverifications(limit);

    return NextResponse.json({
      success: true,
      count: reverifications.length,
      reverifications,
    });
  } catch (error) {
    console.error('Admin reverifications list error:', error);
    if (getErrorMessage(error) === 'Admin authentication required') {
      return NextResponse.json({ error: 'Admin authentication required' }, { status: 401 });
    }
    return NextResponse.json({ error: getErrorMessage(error) || 'Internal server error' }, { status: 500 });
  }
}
