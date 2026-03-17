import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/db';
import { getAuthUserFromRequest } from '@/lib/server-auth';
import { isCARequest } from '@/lib/server-ca-auth';
import { getCompanyCAFromRequest } from '@/lib/server-company-ca-auth';

async function canAccessProject(request: NextRequest, project: any): Promise<boolean> {
  if (isCARequest(request)) {
    return true;
  }

  try {
    const companyCA = await getCompanyCAFromRequest(request);
    if (companyCA.identity.company_user_id === project.company_user_id) {
      return true;
    }
  } catch {
    // Fall through to user token auth.
  }

  try {
    const user = getAuthUserFromRequest(request);

    if (user.user_type === 'company' && project.company_user_id === user.id) {
      return true;
    }

    if (user.user_type === 'ngo' && project.ngo_user_id === user.id) {
      return true;
    }

    return false;
  } catch {
    return false;
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const projectId = params.id;

    const { data: project, error: projectError } = await supabase
      .from('csr_projects')
      .select('*')
      .eq('id', projectId)
      .single();

    if (projectError || !project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    const hasAccess = await canAccessProject(request, project);
    if (!hasAccess) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
    }

    const { data: milestones } = await supabase
      .from('csr_project_milestones')
      .select('id')
      .eq('project_id', projectId);

    const milestoneIds = (milestones ?? []).map((item: any) => item.id);

    const [evidence, reviews, payments] = await Promise.all([
      milestoneIds.length > 0
        ? supabase.from('csr_milestone_evidence').select('id').in('milestone_id', milestoneIds)
        : Promise.resolve({ data: [] } as any),
      milestoneIds.length > 0
        ? supabase.from('csr_milestone_reviews').select('id').in('milestone_id', milestoneIds)
        : Promise.resolve({ data: [] } as any),
      milestoneIds.length > 0
        ? supabase.from('csr_payment_confirmations').select('id').in('milestone_id', milestoneIds)
        : Promise.resolve({ data: [] } as any)
    ]);

    const auditEntityIds = [
      projectId,
      ...(milestoneIds ?? []),
      ...((evidence.data ?? []).map((item: any) => item.id)),
      ...((reviews.data ?? []).map((item: any) => item.id)),
      ...((payments.data ?? []).map((item: any) => item.id))
    ];

    const { data: logs, error: logError } = await supabase
      .from('csr_audit_log')
      .select('*')
      .in('entity_id', auditEntityIds)
      .order('created_at', { ascending: false })
      .limit(500);

    if (logError) {
      console.error('Failed to fetch audit history:', logError);
      return NextResponse.json({ error: 'Failed to fetch audit history' }, { status: 500 });
    }

    return NextResponse.json({ success: true, data: logs ?? [] });
  } catch (error) {
    console.error('CSR project audit history error:', error);
    return NextResponse.json({ error: 'Failed to fetch CSR audit history' }, { status: 500 });
  }
}
