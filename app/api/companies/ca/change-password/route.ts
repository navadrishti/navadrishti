import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { supabase } from '@/lib/db';
import { comparePassword, hashPassword } from '@/lib/auth';
import { getCompanyCAFromRequest } from '@/lib/server-company-ca-auth';

const changePasswordSchema = z.object({
  current_password: z.string().min(1),
  new_password: z.string().min(8)
});

export async function POST(request: NextRequest) {
  try {
    const companyCA = await getCompanyCAFromRequest(request);

    const body = await request.json();
    const parsed = changePasswordSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message || 'Invalid payload' }, { status: 400 });
    }

    const { current_password, new_password } = parsed.data;

    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id, password')
      .eq('id', companyCA.user.id)
      .single();

    if (userError || !user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const validCurrentPassword = await comparePassword(current_password, user.password);
    if (!validCurrentPassword) {
      return NextResponse.json({ error: 'Current password is incorrect' }, { status: 400 });
    }

    const newHash = await hashPassword(new_password);

    const { error: updateError } = await supabase
      .from('users')
      .update({ password: newHash, updated_at: new Date().toISOString() })
      .eq('id', companyCA.user.id);

    if (updateError) {
      console.error('Failed to change Company CA password:', updateError);
      return NextResponse.json({ error: 'Failed to change password' }, { status: 500 });
    }

    await supabase.from('csr_audit_log').insert({
      entity_type: 'company_ca_identity',
      entity_id: companyCA.identity.id,
      event_type: 'company_ca_password_changed',
      event_hash: `company_ca_password_changed:${companyCA.identity.id}:${Date.now()}`,
      event_payload: {
        company_user_id: companyCA.identity.company_user_id,
        company_ca_user_id: companyCA.user.id
      },
      created_by: companyCA.user.id
    });

    return NextResponse.json({ success: true, message: 'Password changed successfully' });
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

    console.error('Company CA change password error:', error);
    return NextResponse.json({ error: 'Failed to change password' }, { status: 500 });
  }
}
