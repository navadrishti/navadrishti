import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { supabase } from '@/lib/db';
import { getAuthUserFromRequest, assertUserType } from '@/lib/server-auth';

const updateSchema = z.object({
  status: z.enum(['active', 'inactive'])
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: { identityId: string } | Promise<{ identityId: string }> }
) {
  try {
    const user = getAuthUserFromRequest(request);
    assertUserType(user, ['company']);

    const body = await request.json();
    const parsed = updateSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message || 'Invalid payload' }, { status: 400 });
    }

    const resolvedParams = await Promise.resolve(params);
    const identityIdRaw = resolvedParams?.identityId;
    const identityId = typeof identityIdRaw === 'string' ? decodeURIComponent(identityIdRaw).trim() : '';

    if (!identityId) {
      return NextResponse.json({ error: 'Invalid company CA identity id' }, { status: 400 });
    }

    const { status } = parsed.data;

    const { data: existing, error: findError } = await supabase
      .from('company_ca_identities')
      .select('*')
      .eq('id', identityId)
      .eq('company_user_id', user.id)
      .single();

    if (findError || !existing) {
      return NextResponse.json({ error: 'Company CA identity not found' }, { status: 404 });
    }

    const { data: updated, error: updateError } = await supabase
      .from('company_ca_identities')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', identityId)
      .eq('company_user_id', user.id)
      .select('*')
      .single();

    if (updateError) {
      console.error('Failed to update company CA status:', updateError);
      return NextResponse.json({ error: 'Failed to update company CA status' }, { status: 500 });
    }

    await supabase.from('csr_audit_log').insert({
      entity_type: 'company_ca_identity',
      entity_id: identityId,
      event_type: `company_ca_${status}`,
      event_hash: `company_ca_${status}:${identityId}:${Date.now()}`,
      event_payload: {
        company_user_id: user.id,
        company_ca_user_id: existing.user_id,
        previous_status: existing.status,
        new_status: status
      },
      created_by: user.id
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    if (error instanceof Error && error.message === 'Authentication required') {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

    if (error instanceof Error && error.message === 'Insufficient permissions') {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }

    console.error('Company CA account update error:', error);
    return NextResponse.json({ error: 'Failed to update Company CA account' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { identityId: string } | Promise<{ identityId: string }> }
) {
  try {
    const user = getAuthUserFromRequest(request);
    assertUserType(user, ['company']);

    const resolvedParams = await Promise.resolve(params);
    const identityIdRaw = resolvedParams?.identityId;
    const identityId = typeof identityIdRaw === 'string' ? decodeURIComponent(identityIdRaw).trim() : '';

    if (!identityId) {
      return NextResponse.json({ error: 'Invalid company CA identity id' }, { status: 400 });
    }

    // Verify the company CA belongs to the current company
    const { data: existing, error: findError } = await supabase
      .from('company_ca_identities')
      .select('*')
      .eq('id', identityId)
      .eq('company_user_id', user.id)
      .single();

    if (findError || !existing) {
      return NextResponse.json({ error: 'Company CA identity not found' }, { status: 404 });
    }

    // Delete the company CA identity
    const { error: deleteError } = await supabase
      .from('company_ca_identities')
      .delete()
      .eq('id', identityId)
      .eq('company_user_id', user.id);

    if (deleteError) {
      console.error('Failed to delete company CA identity:', deleteError);
      return NextResponse.json({ error: 'Failed to delete company CA account' }, { status: 500 });
    }

    // Log the deletion event
    await supabase.from('csr_audit_log').insert({
      entity_type: 'company_ca_identity',
      entity_id: identityId,
      event_type: 'company_ca_deleted',
      event_hash: `company_ca_deleted:${identityId}:${Date.now()}`,
      event_payload: {
        company_user_id: user.id,
        company_ca_user_id: existing.user_id,
        company_ca_id: existing.ca_id
      },
      created_by: user.id
    });

    return NextResponse.json({ success: true, message: 'Company CA account permanently deleted' });
  } catch (error) {
    if (error instanceof Error && error.message === 'Authentication required') {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

    if (error instanceof Error && error.message === 'Insufficient permissions') {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }

    console.error('Company CA account delete error:', error);
    return NextResponse.json({ error: 'Failed to delete Company CA account' }, { status: 500 });
  }
}
