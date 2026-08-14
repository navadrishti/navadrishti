import { NextRequest, NextResponse } from 'next/server';
import { listCAQueue, requireCA } from '@/lib/ca-review';
import { CA_QUEUE_TYPES, type CAQueueType } from '@/lib/ca-review-types';

export async function GET(request: NextRequest) {
  try {
    requireCA(request);
    const status = request.nextUrl.searchParams.get('status') || 'unverified';
    const typeParam = request.nextUrl.searchParams.get('type');

    if (typeParam && CA_QUEUE_TYPES.includes(typeParam as CAQueueType)) {
      const type = typeParam as CAQueueType;
      const data = await listCAQueue(type, status);
      return NextResponse.json({
        success: true,
        data,
        count: data.length,
        type,
      });
    }

    const [individuals, companies, ngos] = await Promise.all(
      CA_QUEUE_TYPES.map((type) => listCAQueue(type, status))
    );

    return NextResponse.json({
      success: true,
      individuals,
      companies,
      ngos,
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'CA authentication required') {
      return NextResponse.json({ error: 'CA authentication required' }, { status: 401 });
    }
    console.error('CA queue API error:', error);
    return NextResponse.json({ error: 'Failed to fetch verification queue' }, { status: 500 });
  }
}
