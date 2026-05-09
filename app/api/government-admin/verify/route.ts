import { NextRequest, NextResponse } from 'next/server';
import { getGovernmentAdminFromRequest } from '@/lib/government-admin-auth';

export async function GET(request: NextRequest) {
  try {
    const account = await getGovernmentAdminFromRequest(request);
    if (!account) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    return NextResponse.json({
      success: true,
      account: {
        id: account.id,
        username: account.username,
        email: account.email,
        display_name: account.display_name,
        role: account.role,
        active: account.active,
        must_change_password: account.must_change_password,
        last_login_at: account.last_login_at,
      },
    });
  } catch (error) {
    console.error('Government admin verify error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
