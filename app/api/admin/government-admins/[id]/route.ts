import { NextRequest, NextResponse } from 'next/server';
import { assertAdminUser, authErrorResponse } from '@/lib/server-auth';
import { supabase } from '@/lib/db';
import { getErrorMessage } from '@/lib/utils';

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    assertAdminUser(request);

    const { id } = await params;
    const accountId = Number(id);
    if (!Number.isFinite(accountId)) {
      return NextResponse.json({ error: 'Valid account id required' }, { status: 400 });
    }

    const { error } = await supabase
      .from('government_admin_accounts')
      .delete()
      .eq('id', accountId);

    if (error) {
      throw error;
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    const authResponse = authErrorResponse(error);
    if (authResponse) return authResponse;
    console.error('Delete government admin account error:', error);
    return NextResponse.json({ error: getErrorMessage(error) || 'Failed to delete government admin account' }, { status: 500 });
  }
}
