import { NextRequest, NextResponse } from 'next/server';
import { caErrorResponse, listCAQueue, requireCA } from '@/lib/ca-review';
import { CA_QUEUE_TYPES, type CAQueueType } from '@/lib/ca-review-types';

export async function GET(request: NextRequest) {
  try {
    await requireCA(request);
    const status = request.nextUrl.searchParams.get('status') || 'unverified';
    const typeParam = request.nextUrl.searchParams.get('type');

    if (typeParam) {
      if (!CA_QUEUE_TYPES.includes(typeParam as CAQueueType)) {
        return NextResponse.json({ error: 'Invalid queue type' }, { status: 400 });
      }
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
    const handled = caErrorResponse(error);
    if (handled) return handled;
    console.error('CA queue API error:', error);
    return NextResponse.json({ error: 'Failed to fetch verification queue' }, { status: 500 });
  }
}
