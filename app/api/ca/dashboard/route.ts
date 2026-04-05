import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/db';
import { getCAFromRequest } from '@/lib/server-ca-auth';

export async function GET(request: NextRequest) {
  try {
    getCAFromRequest(request);

    const [projectsResult, milestonesResult, paymentsResult] = await Promise.all([
      supabase
        .from('csr_projects')
        .select('id, title, company_user_id, ngo_user_id, region, progress_percentage, total_budget, updated_at')
        .order('updated_at', { ascending: false }),
      supabase
        .from('csr_project_milestones')
        .select('id, project_id, title, status, due_date, milestone_order, amount, updated_at')
        .order('updated_at', { ascending: false }),
      supabase
        .from('csr_payment_confirmations')
        .select('id, project_id, milestone_id, payment_reference, amount, payment_status, confirmed_at, created_at')
        .order('created_at', { ascending: false })
    ]);

    if (projectsResult.error || milestonesResult.error || paymentsResult.error) {
      console.error('CA dashboard query error:', {
        projectsError: projectsResult.error,
        milestonesError: milestonesResult.error,
        paymentsError: paymentsResult.error
      });
      return NextResponse.json(
        { error: 'Failed to fetch CA dashboard data' },
        { status: 500 }
      );
    }

    const projects = projectsResult.data ?? [];
    const milestones = milestonesResult.data ?? [];
    const payments = paymentsResult.data ?? [];

    const pendingEvidenceQueue = milestones
      .filter((item: any) => item.status === 'submitted')
      .slice(0, 10)
      .map((item: any) => {
        const project = projects.find((projectItem: any) => projectItem.id === item.project_id);
        return {
          milestone_id: item.id,
          milestone_title: item.title,
          project_id: item.project_id,
          project_title: project?.title ?? 'Project',
          due_date: item.due_date,
          amount: item.amount,
          milestone_order: item.milestone_order,
          updated_at: item.updated_at
        };
      });

    const pendingPayments = payments
      .filter((item: any) => item.payment_status === 'pending')
      .slice(0, 10)
      .map((item: any) => {
        const project = projects.find((projectItem: any) => projectItem.id === item.project_id);
        return {
          payment_id: item.id,
          payment_reference: item.payment_reference,
          amount: item.amount,
          project_id: item.project_id,
          project_title: project?.title ?? 'Project',
          milestone_id: item.milestone_id,
          created_at: item.created_at
        };
      });

    const today = new Date();
    const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).toISOString();

    const confirmedToday = payments.filter(
      (item: any) => item.payment_status === 'confirmed' && item.confirmed_at && item.confirmed_at >= todayStart
    ).length;

    const totalConfirmedFunds = payments
      .filter((item: any) => item.payment_status === 'confirmed')
      .reduce((sum: number, item: any) => sum + Number(item.amount || 0), 0);

    const overallProgress = projects.length > 0
      ? Math.round(
          projects.reduce((sum: number, item: any) => sum + Number(item.progress_percentage || 0), 0) /
            projects.length
        )
      : 0;

    return NextResponse.json({
      success: true,
      stats: {
        total_projects: projects.length,
        pending_evidence_reviews: pendingEvidenceQueue.length,
        pending_payment_confirmations: pendingPayments.length,
        payments_confirmed_today: confirmedToday,
        total_confirmed_funds: totalConfirmedFunds,
        overall_progress_percentage: overallProgress
      },
      pendingEvidenceQueue,
      pendingPayments
    });

  } catch (error) {
    if (
      error instanceof Error &&
      (error.message === 'CA authentication required' || error.message === 'Invalid CA token')
    ) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

    console.error('CA dashboard error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch dashboard data' },
      { status: 500 }
    );
  }
}
