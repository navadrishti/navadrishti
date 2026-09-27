import { NextRequest, NextResponse } from 'next/server';
import { applyCAVerificationAction, caErrorResponse, requireCA } from '@/lib/ca-review';
import type { CAQueueType } from '@/lib/ca-review-types';

const allowedTypes: CAQueueType[] = ['individuals', 'companies', 'ngos'];

export async function POST(request: NextRequest) {
  try {
    const ca = requireCA(request);
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }
    const { entity_type, entity_id, action, reason, compliance_tags } = body;

    if (!allowedTypes.includes(entity_type)) {
      return NextResponse.json({ error: 'Invalid entity type' }, { status: 400 });
    }

    if (!['approve', 'reject'].includes(action)) {
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
      type: entity_type,
      id,
      action,
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
      { error: error instanceof Error ? error.message : 'Failed to process verification' },
      { status: 500 }
    );
  }
}
