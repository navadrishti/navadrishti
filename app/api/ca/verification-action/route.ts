import { NextRequest, NextResponse } from 'next/server';
import { applyCAVerificationAction, requireCA } from '@/lib/ca-review';
import type { CAQueueType } from '@/lib/ca-review-types';

const allowedTypes: CAQueueType[] = ['individuals', 'companies', 'ngos'];

export async function POST(request: NextRequest) {
  try {
    const ca = requireCA(request);
    const body = await request.json();
    const { entity_type, entity_id, action, reason, compliance_tags } = body;

    if (!allowedTypes.includes(entity_type)) {
      return NextResponse.json({ error: 'Invalid entity type' }, { status: 400 });
    }

    if (!['approve', 'reject'].includes(action)) {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }

    const id = Number(entity_id);
    if (!Number.isFinite(id) || id <= 0) {
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
    if (error instanceof Error && error.message === 'CA authentication required') {
      return NextResponse.json({ error: 'CA authentication required' }, { status: 401 });
    }
    console.error('Verification action error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to process verification' },
      { status: 500 }
    );
  }
}
