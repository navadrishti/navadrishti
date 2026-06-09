import { NextRequest, NextResponse } from 'next/server';
import {
  getNavadrishtCAFromRequest,
  generateNavadrishtCAToken,
  updateNavadrishtCAPassword,
  verifyNavadrishtCAPassword,
} from '@/lib/navadrishti-ca-auth';

export async function POST(request: NextRequest) {
  try {
    const account = await getNavadrishtCAFromRequest(request);
    if (!account) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const { currentPassword, newPassword } = await request.json();
    if (!currentPassword || !newPassword) {
      return NextResponse.json({ error: 'Current password and new password required' }, { status: 400 });
    }

    const isValid = await verifyNavadrishtCAPassword(account.id, String(currentPassword));
    if (!isValid) {
      return NextResponse.json({ error: 'Current password is incorrect' }, { status: 401 });
    }

    const updatedAccount = await updateNavadrishtCAPassword(account.id, String(newPassword));
    const token = generateNavadrishtCAToken(updatedAccount);

    const response = NextResponse.json({
      success: true,
      message: 'Password updated successfully',
      account: {
        id: updatedAccount.id,
        ca_id: updatedAccount.ca_id,
        username: updatedAccount.username,
        display_name: updatedAccount.display_name,
        must_change_password: updatedAccount.must_change_password,
      },
    });

    response.cookies.set('navadrishti-ca-token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 12 * 60 * 60,
      path: '/',
    });

    return response;
  } catch (error: any) {
    console.error('CA password change error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
