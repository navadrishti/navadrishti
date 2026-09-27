import { NextRequest, NextResponse } from 'next/server';
import { getPlatformCAFromRequest } from '@/lib/platform-ca-auth';
export async function GET(request: NextRequest) {
  try {
    const caAccount = await getPlatformCAFromRequest(request);
    if (!caAccount) {
      return NextResponse.json({ error: 'No CA token found' }, { status: 401 });
    }

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
  } catch (error) {
    console.error('CA verification error:', error);
    return NextResponse.json({ error: 'Verification failed' }, { status: 500 });
  }
}
