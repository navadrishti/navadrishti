import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@/lib/auth';

export async function GET(request: NextRequest) {
  try {
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