import { NextRequest, NextResponse } from 'next/server';
import { isCompanyCaAssignedToProject } from '@/lib/company-ca';
import { supabase } from '@/lib/db';
import { findAuthUser, getAuthUserFromRequest, hasActiveCASession, getCompanyCAFromRequest, authErrorResponse } from '@/lib/server-auth';
import type { UserData } from '@/lib/auth';
import type { Tables } from '@/lib/database.types';
import { isProjectFinancialLead } from '@/lib/csr-agent/project-financial-access';
import { resolveNgoProjectViewer } from '@/lib/csr-agent/ngo-project-viewer';

type IdRow = { id: string };

type ProjectViewer = {
  isPlatformCA: boolean;
  companyCACompanyUserId: number | null;
  companyCALoginUserId: number | null;
  user: UserData | null;
};

async function resolveProjectViewer(request: NextRequest): Promise<ProjectViewer | null> {
  const ngo = await resolveNgoProjectViewer(request);
  if (ngo) {
    return { isPlatformCA: false, companyCACompanyUserId: null, companyCALoginUserId: null, user: ngo };
  }
  if (await hasActiveCASession(request)) {
    return {
      isPlatformCA: true,
      companyCACompanyUserId: null,
      companyCALoginUserId: null,
      user: null,
    };
  }

  let companyCACompanyUserId: number | null = null;
  let companyCALoginUserId: number | null = null;
  try {
    const companyCA = await getCompanyCAFromRequest(request);
    companyCACompanyUserId = companyCA.identity.company_user_id;
    companyCALoginUserId = companyCA.user.id;
  } catch {
    // Fall through to user token auth.
  }

  const user = findAuthUser(request) ? await getAuthUserFromRequest(request) : null;
  if (companyCACompanyUserId === null && !user) {
    return null;
  }

  return { isPlatformCA: false, companyCACompanyUserId, companyCALoginUserId, user };
}

async function canAccessProject(
  viewer: ProjectViewer,
  project: Pick<Tables<'csr_projects'>, 'id' | 'company_user_id' | 'ngo_user_id'>
): Promise<boolean> {
  if (viewer.isPlatformCA) return true;

  if (
    viewer.companyCACompanyUserId != null &&
    viewer.companyCALoginUserId != null &&
    viewer.companyCACompanyUserId === project.company_user_id
  ) {
    return isCompanyCaAssignedToProject({
      companyCaUserId: viewer.companyCALoginUserId,
      companyUserId: viewer.companyCACompanyUserId,
      projectId: String(project.id),
    });
  }

  const { user } = viewer;
  if (!user) {
    return false;
  }

  return (
    (user.user_type === 'company' && project.company_user_id === user.id) ||
    (user.user_type === 'ngo' && project.ngo_user_id === user.id)
  );
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: projectId } = await params;

    const viewer = await resolveProjectViewer(request);
    if (!viewer) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const { data: project, error: projectError } = await supabase
      .from('csr_projects')
      .select('*, campaigns(lead_ngo_user_id)')
      .eq('id', projectId)
      .single();

    if (projectError || !project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    if (!(await canAccessProject(viewer, project))) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
    }
    if (viewer.user?.user_type === 'ngo' && !viewer.isPlatformCA &&
        viewer.companyCACompanyUserId === null && !isProjectFinancialLead(project, viewer.user.id)) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
    }

    const { data: milestones } = await supabase
      .from('csr_project_milestones')
      .select('id')
      .eq('project_id', projectId);

    const milestoneIds = (milestones ?? []).map((item) => item.id);

    const [evidence, reviews, payments] = await Promise.all([
      milestoneIds.length > 0
        ? supabase.from('csr_milestone_evidence').select('id').in('milestone_id', milestoneIds)
        : Promise.resolve({ data: [] as IdRow[] }),
      milestoneIds.length > 0
        ? supabase.from('csr_milestone_reviews').select('id').in('milestone_id', milestoneIds)
        : Promise.resolve({ data: [] as IdRow[] }),
      milestoneIds.length > 0
        ? supabase.from('csr_payment_confirmations').select('id').in('milestone_id', milestoneIds)
        : Promise.resolve({ data: [] as IdRow[] }),
    ]);

    const auditEntityIds = [
      projectId,
      ...(milestoneIds ?? []),
      ...((evidence.data ?? []).map((item) => item.id)),
      ...((reviews.data ?? []).map((item) => item.id)),
      ...((payments.data ?? []).map((item) => item.id)),
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
    const authResponse = authErrorResponse(error);
    if (authResponse) return authResponse;
    console.error('CSR project audit history error:', error);
    return NextResponse.json({ error: 'Failed to fetch CSR audit history' }, { status: 500 });
  }
}
