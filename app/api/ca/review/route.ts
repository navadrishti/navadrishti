import { NextRequest, NextResponse } from 'next/server';
import { caErrorResponse, getCAReview, requireCA } from '@/lib/ca-review';
import { parseCAQueueType } from '@/lib/ca-review-types';
import { getErrorMessage } from '@/lib/utils';

export async function GET(request: NextRequest) {
  try {
    await requireCA(request);
    const type = parseCAQueueType(request.nextUrl.searchParams.get('type'));
    const id = Number(request.nextUrl.searchParams.get('id'));

    if (!type || !Number.isInteger(id) || id <= 0) {
      return NextResponse.json({ error: 'Valid type and id are required' }, { status: 400 });
    }

    const data = await getCAReview(type, id);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    const handled = caErrorResponse(error);
    if (handled) return handled;
    console.error('CA review error:', error);
    return NextResponse.json(
      { error: getErrorMessage(error) || 'Failed to load review' },
      { status: 500 }
    );
  }
}
