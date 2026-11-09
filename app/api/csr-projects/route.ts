import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/db';
import { parseJsonObject } from '@/lib/utils';
import { listActiveAssignedProjectIdsForCompanyCa } from '@/lib/company-ca';
import { getAuthUserFromRequest, assertUserType, hasActiveCASession, getCompanyCAFromRequest } from '@/lib/server-auth';
import {
  deriveCsrProjectFinance,
  deriveCsrProjectMetrics,
  isPaidCompletedMilestoneStatus,
} from '@/lib/csr-agent/project-metrics';
import {
  loadPaymentRefundTotalsByReferences,
  withConfirmedRefunds,
} from '@/lib/csr-agent/milestone-refund-accounting';
import type { Tables } from '@/lib/database.types';
import { isProjectFinancialLead } from '@/lib/csr-agent/project-financial-access';
import { resolveNgoProjectViewer } from '@/lib/csr-agent/ngo-project-viewer';
import { loadProjectExpenseTotals } from '@/lib/csr-agent/project-expense-totals';

type MilestoneWithDueDate = Tables<'csr_project_milestones'> & { due_date: string };

export async function GET(request: NextRequest) {
  try {
    const ngoViewer = await resolveNgoProjectViewer(request);
    const caMode = ngoViewer ? false : await hasActiveCASession(request);
    const hasCompanyCAToken = Boolean(request.cookies.get('evidence-verification-token')?.value);
    const companyCAContext = (!ngoViewer && !caMode && hasCompanyCAToken)
      ? await getCompanyCAFromRequest(request)
      : null;
    const user = ngoViewer || ((!caMode && !companyCAContext) ? await getAuthUserFromRequest(request) : null);
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
      const assignedProjectIds = await listActiveAssignedProjectIdsForCompanyCa(
        companyCAContext.user.id
      );
      if (assignedProjectIds.length === 0) {
        return NextResponse.json({ success: true, data: [] });
      }
      query = query
        .eq('company_user_id', companyCAContext.identity.company_user_id)
        .in('id', assignedProjectIds);
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

    const authorizedProjects = (data ?? []).filter(
      (project) => user?.user_type !== 'ngo' || isProjectFinancialLead(project, user.id)
    );
    const expenseTotals = await loadProjectExpenseTotals(authorizedProjects.map((project) => project.id));
    const attendanceSummary = (metadata: unknown) => parseJsonObject(parseJsonObject(metadata).attendance_summary);
    // One batched refund-ledger lookup for the whole list — never derive net without it.
    const refundTotals = await loadPaymentRefundTotalsByReferences(
      authorizedProjects.flatMap((project) =>
        (Array.isArray(project.csr_payment_confirmations) ? project.csr_payment_confirmations : []).map(
          (payment) => payment.payment_reference
        )
      )
    )
    const projects = (data ?? []).map((project) => {
      if (user?.user_type === 'ngo' && !isProjectFinancialLead(project, user.id)) {
        return {
          id: project.id,
          title: project.title,
          region: project.region,
          project_status: project.project_status,
          campaign_id: project.campaign_id,
          schedule_start: project.campaigns?.start_date ?? null,
          schedule_end: project.campaigns?.end_date ?? null,
          campaign_status: project.campaigns?.status ?? null,
          ngo_role: project.campaigns?.lead_ngo_user_id != null && project.campaigns.lead_ngo_user_id !== user.id
            ? 'participant' as const : 'unconfirmed' as const,
          financial_access: false as const,
        };
      }
      const impactRows = Array.isArray(project.csr_impact_metrics) ? project.csr_impact_metrics : []
      const payments = withConfirmedRefunds(
        Array.isArray(project.csr_payment_confirmations) ? project.csr_payment_confirmations : [],
        refundTotals.processedByPaymentRef
      )
      const metrics = deriveCsrProjectMetrics({
        milestones: Array.isArray(project.csr_project_milestones) ? project.csr_project_milestones : [],
        payments,
        impactRows,
      })
      const latestImpact = impactRows[0] ?? null
      const finance = deriveCsrProjectFinance({
        totalBudget: project.total_budget,
        verifiedExpenditure: expenseTotals?.get(project.id) ?? null,
        confirmedFunds: metrics.confirmed_funds,
        pendingPaymentFunds: metrics.pending_payment_funds,
        approvedAwaitingPaymentFunds: metrics.approved_awaiting_payment_funds,
      })
      return {
      ...project,
      ngo_role: user?.user_type === 'ngo' ? 'lead' as const : undefined,
      schedule_start: project.campaigns?.start_date ?? null,
      schedule_end: project.campaigns?.end_date ?? null,
      campaign_status: project.campaigns?.status ?? null,
      financial_access: true as const,
      csr_payment_confirmations: payments,
      days_attended: Number(attendanceSummary(project.metadata).days_attended ?? attendanceSummary(project.metadata).total_entries ?? 0),
      last_attendance_at: attendanceSummary(project.metadata).last_attendance_at ?? null,
      milestones_count: metrics.milestones_count,
      completed_milestones_count: metrics.completed_milestones_count,
      milestone_progress_percentage: metrics.milestone_progress_percentage,
      paid_completed_milestones_count: metrics.paid_completed_milestones_count,
      pending_milestones_count: metrics.pending_milestones_count,
      overall_completion_percentage: metrics.overall_completion_percentage,
      latest_impact: latestImpact,
      impact_metrics_available: metrics.impact_table.available,
      // Next open field milestone skips only payment-complete rows (approved still blocks unlock).
      next_milestone: Array.isArray(project.csr_project_milestones)
        ? project.csr_project_milestones
            .filter((m) => !isPaidCompletedMilestoneStatus(m.status))
            .sort((a, b) => Number(a.milestone_order) - Number(b.milestone_order))[0] ?? null
        : null,
      deadline_at: Array.isArray(project.csr_project_milestones)
        ? project.csr_project_milestones
            .filter(
              (m): m is MilestoneWithDueDate =>
                !isPaidCompletedMilestoneStatus(m.status) && Boolean(m.due_date)
            )
            .sort((a, b) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime())[0]
            ?.due_date ?? null
        : null,
      confirmed_funds: metrics.confirmed_funds,
      confirmed_funds_available: metrics.confirmed_funds_available,
      refunds_reconciled: metrics.refunds_reconciled,
      unreconciled_payment_count: metrics.unreconciled_payment_count,
      gross_confirmed_funds: metrics.gross_confirmed_funds,
      confirmed_refund_funds: metrics.confirmed_refund_funds,
      pending_payment_funds: metrics.pending_payment_funds,
      approved_awaiting_payment_funds: metrics.approved_awaiting_payment_funds,
      finance,
      }
    });

    return NextResponse.json({ success: true, data: projects });
  } catch (error) {
    if (error instanceof Error && ['Authentication required', 'Invalid authentication token'].includes(error.message)) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

    if (
      error instanceof Error &&
      [
        'Evidence Verifier authentication required',
        'Invalid company CA token',
        'Evidence Verifier identity not found',
        'Evidence Verifier identity is not active'
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
