import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/db';
import { getAuthUserFromRequest, assertUserType } from '@/lib/server-auth';
import { isCARequest } from '@/lib/server-ca-auth';
import { getCompanyCAFromRequest } from '@/lib/server-company-ca-auth';

export async function GET(request: NextRequest) {
  try {
    const caMode = isCARequest(request);
    const hasCompanyCAToken = Boolean(request.cookies.get('company-ca-token')?.value);
    const companyCAContext = (!caMode && hasCompanyCAToken)
      ? await getCompanyCAFromRequest(request)
      : null;
    const user = (!caMode && !companyCAContext) ? getAuthUserFromRequest(request) : null;
    if (user) {
      assertUserType(user, ['company', 'ngo']);
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const companyUserId = searchParams.get('company_user_id');

    let query = supabase
      .from('csr_projects')
      .select('*, campaigns(*), csr_impact_metrics(*), csr_project_milestones(*), csr_payment_confirmations(*)')
      .order('created_at', { ascending: false });

    if (user?.user_type === 'company') {
      query = query.eq('company_user_id', user.id);
    }

    if (user?.user_type === 'ngo') {
      query = query.eq('ngo_user_id', user.id);
    }

    if (companyCAContext) {
      query = query.eq('company_user_id', companyCAContext.identity.company_user_id);
    }

    if (caMode && companyUserId) {
      query = query.eq('company_user_id', Number(companyUserId));
    }

    if (status) {
      query = query.eq('project_status', status);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Failed to fetch CSR projects:', error);
      return NextResponse.json({ error: 'Failed to fetch CSR projects' }, { status: 500 });
    }

    const projects = (data ?? []).map((project: any) => ({
      ...project,
      milestones_count: Array.isArray(project.csr_project_milestones)
        ? project.csr_project_milestones.length
        : 0,
      completed_milestones_count: Array.isArray(project.csr_project_milestones)
        ? project.csr_project_milestones.filter((m: any) => m.status === 'approved').length
        : 0,
      latest_impact: Array.isArray(project.csr_impact_metrics)
        ? project.csr_impact_metrics[0] ?? null
        : null,
      next_milestone: Array.isArray(project.csr_project_milestones)
        ? project.csr_project_milestones
            .filter((m: any) => m.status !== 'completed')
            .sort((a: any, b: any) => Number(a.milestone_order) - Number(b.milestone_order))[0] ?? null
        : null,
      deadline_at: Array.isArray(project.csr_project_milestones)
        ? project.csr_project_milestones
            .filter((m: any) => m.status !== 'completed' && m.due_date)
            .sort((a: any, b: any) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime())[0]?.due_date ?? null
        : null,
      confirmed_funds: Array.isArray(project.csr_payment_confirmations)
        ? project.csr_payment_confirmations
            .filter((payment: any) => payment.payment_status === 'confirmed')
            .reduce((sum: number, payment: any) => sum + Number(payment.amount || 0), 0)
        : 0
    }));

    return NextResponse.json({ success: true, data: projects });
  } catch (error) {
    if (error instanceof Error && error.message === 'Authentication required') {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

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

    if (error instanceof Error && error.message === 'Insufficient permissions') {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }

    console.error('CSR project list error:', error);
    return NextResponse.json({ error: 'Failed to fetch CSR projects' }, { status: 500 });
  }
}
