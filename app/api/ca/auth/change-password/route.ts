import { NextRequest, NextResponse } from 'next/server';
import {
  getPlatformCAFromRequest,
  generatePlatformCAToken,
  updatePlatformCAPassword,
  verifyPlatformCAPassword,
} from '@/lib/platform-ca-auth';
import { setPlatformCaTokenCookie } from '@/lib/server-auth';

export async function POST(request: NextRequest) {
  try {
    const account = await getPlatformCAFromRequest(request);
    if (!account) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const { currentPassword, newPassword } = await request.json();
    if (!currentPassword || !newPassword) {
      return NextResponse.json({ error: 'Current password and new password required' }, { status: 400 });
    }

    const isValid = await verifyPlatformCAPassword(account.id, String(currentPassword));
    if (!isValid) {
      return NextResponse.json({ error: 'Current password is incorrect' }, { status: 401 });
    }

    const updatedAccount = await updatePlatformCAPassword(account.id, String(newPassword));
    const token = generatePlatformCAToken(updatedAccount);

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

    setPlatformCaTokenCookie(response, token, 12 * 60 * 60);

    return response;
  } catch (error: any) {
    console.error('CA change-password error:', error);
    return NextResponse.json({ error: error?.message || 'Password update failed' }, { status: 500 });
  }
}
