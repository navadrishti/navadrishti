import { NextRequest, NextResponse } from 'next/server';
import { applyCAVerificationAction, caErrorResponse, requireCA } from '@/lib/ca-review';
import { parseCAQueueType } from '@/lib/ca-review-types';
import { getErrorMessage } from '@/lib/utils';

export async function POST(request: NextRequest) {
  try {
    const ca = await requireCA(request);
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }
    const { entity_type, entity_id, action, reason, compliance_tags } = body;

    const type = parseCAQueueType(entity_type);
    if (!type) {
      return NextResponse.json({ error: 'Invalid entity type' }, { status: 400 });
    }

    const decision = action === 'approve' ? 'approve' : action === 'reject' ? 'reject' : null;
    if (!decision) {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }

    const id = Number(entity_id);
    if (!Number.isInteger(id) || id <= 0) {
      return NextResponse.json({ error: 'Invalid entity id' }, { status: 400 });
    }

    if (action === 'reject' && !String(reason || '').trim()) {
      return NextResponse.json({ error: 'Rejection reason is required' }, { status: 400 });
    }

    const data = await applyCAVerificationAction({
      type,
      id,
      action: decision,
      reason: String(reason || '').trim(),
      compliance_tags,
      ca,
    });

    return NextResponse.json({
      success: true,
      message: data.message,
      data,
    });
  } catch (error) {
    const handled = caErrorResponse(error);
    if (handled) return handled;
    console.error('Verification action error:', error);
    return NextResponse.json(
      { error: getErrorMessage(error) || 'Failed to process verification' },
      { status: 500 }
    );
  }
}
