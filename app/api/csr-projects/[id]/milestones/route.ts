import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/db';
import { getAuthUserFromRequest, assertUserType } from '@/lib/server-auth';
import { isCARequest } from '@/lib/server-ca-auth';

async function getProjectById(projectId: string) {
  const { data, error } = await supabase
    .from('csr_projects')
    .select('*')
    .eq('id', projectId)
    .single();

  if (error) {
    return null;
  }

  return data;
}

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const caMode = isCARequest(request);
    const user = caMode ? null : getAuthUserFromRequest(request);

    if (user) {
      assertUserType(user, ['company', 'ngo']);
    }

    const projectId = params.id;

    const project = await getProjectById(projectId);
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    if (
      user?.user_type === 'company' &&
      project.company_user_id !== user.id
    ) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
    }

    if (
      user?.user_type === 'ngo' &&
      project.ngo_user_id !== user.id
    ) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
    }

    const { data, error } = await supabase
      .from('csr_project_milestones')
      .select('*')
      .eq('project_id', projectId)
      .order('milestone_order', { ascending: true });

    if (error) {
      console.error('Failed to fetch milestones:', error);
      return NextResponse.json({ error: 'Failed to fetch milestones' }, { status: 500 });
    }

    return NextResponse.json({ success: true, data: data ?? [] });
  } catch (error) {
    if (error instanceof Error && error.message === 'Authentication required') {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

    if (error instanceof Error && error.message === 'Insufficient permissions') {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }

    console.error('Milestone list error:', error);
    return NextResponse.json({ error: 'Failed to fetch milestones' }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = getAuthUserFromRequest(request);
    assertUserType(user, ['company']);

    const projectId = params.id;
    const project = await getProjectById(projectId);

    if (!project || project.company_user_id !== user.id) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    const body = await request.json();
    const {
      title,
      description,
      milestone_order,
      amount,
      evidence_requirements,
      due_date,
      company_approval_required
    } = body;

    if (!title || amount === undefined || amount === null) {
      return NextResponse.json(
        { error: 'title and amount are required' },
        { status: 400 }
      );
    }

    const orderNumber = Number(milestone_order);

    const payload = {
      project_id: projectId,
      campaign_id: project.campaign_id,
      title,
      description: description ?? null,
      milestone_order: Number.isFinite(orderNumber) ? orderNumber : 1,
      amount,
      evidence_requirements: evidence_requirements ?? [],
      due_date: due_date ?? null,
      company_approval_required:
        company_approval_required === undefined ? true : Boolean(company_approval_required),
      status: 'pending'
    };

    const { data, error } = await supabase
      .from('csr_project_milestones')
      .insert(payload)
      .select('*')
      .single();

    if (error) {
      console.error('Failed to create milestone:', error);
      return NextResponse.json({ error: 'Failed to create milestone' }, { status: 500 });
    }

    await supabase.from('csr_audit_log').insert({
      entity_type: 'milestone',
      entity_id: data.id,
      event_type: 'milestone_created',
      event_hash: `milestone_created:${data.id}:${Date.now()}`,
      event_payload: {
        project_id: projectId,
        title: data.title,
        amount: data.amount
      },
      created_by: user.id
    });

    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === 'Authentication required') {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

    if (error instanceof Error && error.message === 'Insufficient permissions') {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }

    console.error('Milestone create error:', error);
    return NextResponse.json({ error: 'Failed to create milestone' }, { status: 500 });
  }
}
