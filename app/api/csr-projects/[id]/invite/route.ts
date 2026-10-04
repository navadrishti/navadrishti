import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/db';
import { getAuthUserFromRequest, assertUserType, assertNgoCsr1CoversWork } from '@/lib/server-auth';
import { CSR_WORK_END_DATE_REQUIRED_MESSAGE } from '@/lib/auth';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = getAuthUserFromRequest(request);
    assertUserType(user, ['company']);

    const { id: projectId } = await params;
    const body = await request.json();
    const ngoUserId = Number(body.ngo_user_id);

    if (!ngoUserId || Number.isNaN(ngoUserId)) {
      return NextResponse.json({ error: 'ngo_user_id is required' }, { status: 400 });
    }

    const { data: project, error: projectError } = await supabase
      .from('csr_projects')
      .select('*, campaigns(end_date, start_date)')
      .eq('id', projectId)
      .eq('company_user_id', user.id)
      .single();

    if (projectError || !project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    const projectStatus = String(project.project_status || '').toLowerCase();
    if (['completed', 'cancelled', 'closed'].includes(projectStatus)) {
      return NextResponse.json({ error: `A ${projectStatus} project cannot change its NGO` }, { status: 409 });
    }

    const currentNgoId = Number(project.ngo_user_id || 0);
    if (currentNgoId === ngoUserId) {
      return NextResponse.json({ success: true, data: project });
    }
    if (currentNgoId > 0) {
      const { data: startedMilestones, error: milestonesError } = await supabase
        .from('csr_project_milestones')
        .select('id')
        .eq('project_id', projectId)
        .not('status', 'in', '("pending","draft","not_started")')
        .limit(1);
      if (milestonesError) throw milestonesError;
      if ((startedMilestones ?? []).length > 0) {
        return NextResponse.json(
          { error: 'Milestone work has already started with the current NGO, so the project NGO cannot be changed.' },
          { status: 409 }
        );
      }
    }

    const { data: ngoUser, error: ngoError } = await supabase
      .from('users')
      .select('id, user_type')
      .eq('id', ngoUserId)
      .single();

    if (ngoError || !ngoUser || ngoUser.user_type !== 'ngo') {
      return NextResponse.json({ error: 'Target user is not a valid NGO account' }, { status: 400 });
    }

    const campaign = Array.isArray(project.campaigns) ? project.campaigns[0] : project.campaigns;
    const workEnd =
      project.end_date ||
      campaign?.end_date ||
      null;
    if (!workEnd) {
      return NextResponse.json({ error: CSR_WORK_END_DATE_REQUIRED_MESSAGE }, { status: 400 });
    }

    const coverageGate = await assertNgoCsr1CoversWork(ngoUserId, workEnd);
    if (!coverageGate.ok) {
      return NextResponse.json({ error: coverageGate.error }, { status: 403 });
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
    if (error instanceof Error && ['Authentication required', 'Invalid authentication token'].includes(error.message)) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

    if (error instanceof Error && error.message === 'Insufficient permissions') {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }

    console.error('CSR project invite error:', error);
    return NextResponse.json({ error: 'Failed to invite NGO to project' }, { status: 500 });
  }
}
