import { NextRequest, NextResponse } from 'next/server';
import { assertAdminUser } from '@/lib/admin-auth';
import { supabase } from '@/lib/db';

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
  } catch (error: any) {
    console.error('Delete government admin account error:', error);
    return NextResponse.json({ error: error?.message || 'Failed to delete government admin account' }, { status: 500 });
  }
}
