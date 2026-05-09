import { NextRequest, NextResponse } from 'next/server';
import { getGovernmentAdminFromRequest, generateGovernmentAdminToken, updateGovernmentAdminPassword, verifyGovernmentAdminPassword } from '@/lib/government-admin-auth';

export async function POST(request: NextRequest) {
  try {
    const account = await getGovernmentAdminFromRequest(request);
    if (!account) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const { currentPassword, newPassword } = await request.json();
    if (!currentPassword || !newPassword) {
      return NextResponse.json({ error: 'Current password and new password required' }, { status: 400 });
    }

    const isValid = await verifyGovernmentAdminPassword(account.id, String(currentPassword));
    if (!isValid) {
      return NextResponse.json({ error: 'Current password is incorrect' }, { status: 401 });
    }

    const updatedAccount = await updateGovernmentAdminPassword(account.id, String(newPassword));
    const token = generateGovernmentAdminToken(updatedAccount);

    const response = NextResponse.json({
      success: true,
      message: 'Password updated successfully',
      account: {
        id: updatedAccount.id,
        username: updatedAccount.username,
        email: updatedAccount.email,
        display_name: updatedAccount.display_name,
        role: updatedAccount.role,
      },
    });

    response.cookies.set('govt-admin-token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/',
    });

    return response;
  } catch (error) {
    console.error('Government admin password change error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
