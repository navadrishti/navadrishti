import { NextRequest, NextResponse } from 'next/server';
import { getCAFromRequest } from '@/lib/server-ca-auth';

export async function POST(request: NextRequest) {
  try {
    getCAFromRequest(request);

    const body = await request.json();
    const { entity_type, entity_id, action, reason } = body;

    if (!['individuals', 'companies', 'ngos'].includes(entity_type)) {
      return NextResponse.json({ error: 'Invalid entity type' }, { status: 400 });
    }

    if (!['approve', 'reject'].includes(action)) {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }

    // Mock processing - in real implementation, this would update the database
    const verification_record = {
      entity_type,
      entity_id,
      action,
      reason: reason || '',
      status: action === 'approve' ? 'verified' : 'rejected',
      reviewed_at: new Date().toISOString(),
      reviewed_by: 'CA Panel'
    };

    console.log('Verification processed:', verification_record);

    return NextResponse.json({
      success: true,
      message: `${entity_type} entity ${action}d successfully`,
      data: verification_record
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'CA authentication required') {
      return NextResponse.json({ error: 'CA authentication required' }, { status: 401 });
    }
    console.error('Verification action error:', error);
    return NextResponse.json({ error: 'Failed to process verification' }, { status: 500 });
  }
}
