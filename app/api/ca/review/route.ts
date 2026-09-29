import { NextRequest, NextResponse } from 'next/server';
import { caErrorResponse, getCAReview, requireCA } from '@/lib/ca-review';
import type { CAQueueType } from '@/lib/ca-review-types';

const allowedTypes: CAQueueType[] = ['individuals', 'companies', 'ngos'];

export async function GET(request: NextRequest) {
  try {
    await requireCA(request);
    const type = request.nextUrl.searchParams.get('type') as CAQueueType;
    const id = Number(request.nextUrl.searchParams.get('id'));

    if (!allowedTypes.includes(type) || !Number.isInteger(id) || id <= 0) {
      return NextResponse.json({ error: 'Valid type and id are required' }, { status: 400 });
    }

    const data = await getCAReview(type, id);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    const handled = caErrorResponse(error);
    if (handled) return handled;
    console.error('CA review error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to load review' },
      { status: 500 }
    );
  }
}
