import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/db';
import { getCompanyCAFromRequest } from '@/lib/server-auth';

export async function POST(request: NextRequest) {
  try {
    const companyCA = await getCompanyCAFromRequest(request);

    // Mark must_change_password as false
    const { error: updateError } = await supabase
      .from('company_ca_identities')
      .update({ must_change_password: false, updated_at: new Date().toISOString() })
      .eq('id', companyCA.identity.id);

    if (updateError) {
      console.error('Failed to mark password as changed:', updateError);
      return NextResponse.json({ error: 'Failed to mark password as changed' }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: 'Password marked as changed' });
  } catch (error) {
    if (
      error instanceof Error &&
      [
        'Company CA authentication required',
        'Invalid company CA token',
        'Company CA identity not found',
        'Company CA identity is not active'
      ].includes(error.message)
    ) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

    console.error('Mark password changed error:', error);
    return NextResponse.json({ error: 'Failed to mark password as changed' }, { status: 500 });
  }
}
