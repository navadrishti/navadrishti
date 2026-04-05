import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/db';
import { getAuthUserFromRequest, assertUserType } from '@/lib/server-auth';

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = getAuthUserFromRequest(request);
    assertUserType(user, ['company']);

    const projectId = params.id;
    const body = await request.json();
    const ngoUserId = Number(body.ngo_user_id);

    if (!ngoUserId || Number.isNaN(ngoUserId)) {
      return NextResponse.json({ error: 'ngo_user_id is required' }, { status: 400 });
    }

    const { data: project, error: projectError } = await supabase
      .from('csr_projects')
      .select('*')
      .eq('id', projectId)
      .eq('company_user_id', user.id)
      .single();

    if (projectError || !project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    const { data: ngoUser, error: ngoError } = await supabase
      .from('users')
      .select('id, user_type')
      .eq('id', ngoUserId)
      .single();

    if (ngoError || !ngoUser || ngoUser.user_type !== 'ngo') {
      return NextResponse.json({ error: 'Target user is not a valid NGO account' }, { status: 400 });
    }

    const { data: updatedProject, error: updateError } = await supabase
      .from('csr_projects')
      .update({
        ngo_user_id: ngoUserId,
        updated_at: new Date().toISOString()
      })
      .eq('id', projectId)
      .select('*')
      .single();

    if (updateError) {
      console.error('Failed to assign NGO:', updateError);
      return NextResponse.json({ error: 'Failed to assign NGO to project' }, { status: 500 });
    }

    await supabase.from('csr_audit_log').insert({
      entity_type: 'project',
      entity_id: projectId,
      event_type: 'ngo_invited_to_project',
      event_hash: `ngo_invite:${projectId}:${ngoUserId}:${Date.now()}`,
      event_payload: {
        previous_ngo_user_id: project.ngo_user_id,
        invited_ngo_user_id: ngoUserId
      },
      created_by: user.id
    });

    return NextResponse.json({ success: true, data: updatedProject });
  } catch (error) {
    if (error instanceof Error && error.message === 'Authentication required') {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

    if (error instanceof Error && error.message === 'Insufficient permissions') {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }

    console.error('CSR project invite error:', error);
    return NextResponse.json({ error: 'Failed to invite NGO to project' }, { status: 500 });
  }
}
