import { NextRequest, NextResponse } from 'next/server';
import { getNavadrishtCAFromRequest } from '@/lib/navadrishti-ca-auth';
import { verifyToken } from '@/lib/auth';

export async function GET(request: NextRequest) {
  try {
    // Try new Navadrishti CA token first
    const caAccount = await getNavadrishtCAFromRequest(request);
    if (caAccount) {
      return NextResponse.json({
        success: true,
        account: {
          id: caAccount.id,
          ca_id: caAccount.ca_id,
          username: caAccount.username,
          display_name: caAccount.display_name,
          active: caAccount.active,
          must_change_password: caAccount.must_change_password,
        },
      });
    }

    // Fallback to old token for backwards compatibility
    const caToken = request.cookies.get('ca-token')?.value;
    if (!caToken) {
      return NextResponse.json({ error: 'No CA token found' }, { status: 401 });
    }

    const decoded = verifyToken(caToken);
    if (!decoded || decoded.id !== -2) {
      return NextResponse.json({ error: 'Invalid CA token' }, { status: 401 });
    }

    return NextResponse.json({
      success: true,
      ca: {
        username: process.env.CA_USERNAME || 'ca',
        icai_membership_number: process.env.CA_MEMBERSHIP_NUMBER || '123456'
      }
    });
  } catch (error) {
    console.error('CA verification error:', error);
    return NextResponse.json({ error: 'Verification failed' }, { status: 500 });
  }
}