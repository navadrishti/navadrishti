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

    const { data: milestones, error: milestoneError } = await supabase
      .from('csr_project_milestones')
      .select('*')
      .eq('project_id', projectId)
      .order('milestone_order', { ascending: true });

    if (milestoneError) {
      console.error('Failed to fetch milestones for evidence timeline:', milestoneError);
      return NextResponse.json({ error: 'Failed to load project timeline' }, { status: 500 });
    }

    const milestoneIds = (milestones ?? []).map((item: any) => item.id);

    const [evidenceResult, reviewResult, paymentResult] = await Promise.all([
      milestoneIds.length > 0
        ? supabase
            .from('csr_milestone_evidence')
            .select('*')
            .in('milestone_id', milestoneIds)
            .order('created_at', { ascending: false })
        : Promise.resolve({ data: [], error: null } as any),
      milestoneIds.length > 0
        ? supabase
            .from('csr_milestone_reviews')
            .select('*')
            .in('milestone_id', milestoneIds)
            .order('created_at', { ascending: false })
        : Promise.resolve({ data: [], error: null } as any),
      milestoneIds.length > 0
        ? supabase
            .from('csr_payment_confirmations')
            .select('*')
            .in('milestone_id', milestoneIds)
            .order('created_at', { ascending: false })
        : Promise.resolve({ data: [], error: null } as any)
    ]);

    if (evidenceResult.error || reviewResult.error || paymentResult.error) {
      console.error('Failed to fetch project evidence details:', {
        evidenceError: evidenceResult.error,
        reviewError: reviewResult.error,
        paymentError: paymentResult.error
      });
      return NextResponse.json({ error: 'Failed to load project evidence details' }, { status: 500 });
    }

    const evidenceRows = evidenceResult.data ?? [];
    const evidenceIds = evidenceRows.map((item: any) => item.id);

    const [mediaResult, documentsResult] = await Promise.all([
      evidenceIds.length > 0
        ? supabase
            .from('csr_milestone_evidence_media')
            .select('*')
            .in('evidence_id', evidenceIds)
            .order('created_at', { ascending: true })
        : Promise.resolve({ data: [], error: null } as any),
      evidenceIds.length > 0
        ? supabase
            .from('csr_milestone_evidence_documents')
            .select('*')
            .in('evidence_id', evidenceIds)
            .order('created_at', { ascending: true })
        : Promise.resolve({ data: [], error: null } as any)
    ]);

    if (mediaResult.error || documentsResult.error) {
      console.error('Failed to fetch evidence media/documents:', {
        mediaError: mediaResult.error,
        documentsError: documentsResult.error
      });
      return NextResponse.json({ error: 'Failed to load evidence uploads' }, { status: 500 });
    }

    const reviewsByMilestone = (reviewResult.data ?? []).reduce((acc: Record<string, any[]>, row: any) => {
      if (!acc[row.milestone_id]) {
        acc[row.milestone_id] = [];
      }
      acc[row.milestone_id].push(row);
      return acc;
    }, {});

    const paymentsByMilestone = (paymentResult.data ?? []).reduce((acc: Record<string, any[]>, row: any) => {
      if (!acc[row.milestone_id]) {
        acc[row.milestone_id] = [];
      }
      acc[row.milestone_id].push(row);
      return acc;
    }, {});

    const mediaByEvidence = (mediaResult.data ?? []).reduce((acc: Record<string, any[]>, row: any) => {
      if (!acc[row.evidence_id]) {
        acc[row.evidence_id] = [];
      }
      acc[row.evidence_id].push(row);
      return acc;
    }, {});

    const documentsByEvidence = (documentsResult.data ?? []).reduce((acc: Record<string, any[]>, row: any) => {
      if (!acc[row.evidence_id]) {
        acc[row.evidence_id] = [];
      }
      acc[row.evidence_id].push(row);
      return acc;
    }, {});

    const evidenceByMilestone = evidenceRows.reduce((acc: Record<string, any[]>, row: any) => {
      if (!acc[row.milestone_id]) {
        acc[row.milestone_id] = [];
      }
      acc[row.milestone_id].push({
        ...row,
        media: mediaByEvidence[row.id] ?? [],
        documents: documentsByEvidence[row.id] ?? []
      });
      return acc;
    }, {});

    const timeline = (milestones ?? []).map((milestone: any) => {
      const evidence = evidenceByMilestone[milestone.id] ?? [];
      const reviews = reviewsByMilestone[milestone.id] ?? [];
      const payments = paymentsByMilestone[milestone.id] ?? [];

      const latestReview = reviews[0] ?? null;
      const latestPayment = payments[0] ?? null;

      return {
        milestone,
        evidence,
        latest_review: latestReview,
        reviews,
        latest_payment: latestPayment,
        payments
      };
    });

    const today = new Date();
    const nextMilestone = (milestones ?? []).find((milestone: any) => {
      if (!milestone.due_date) {
        return milestone.status !== 'completed';
      }

      return milestone.status !== 'completed' && new Date(milestone.due_date) >= today;
    }) ?? (milestones ?? []).find((milestone: any) => milestone.status !== 'completed') ?? null;

    const confirmedFunds = (paymentResult.data ?? [])
      .filter((payment: any) => payment.payment_status === 'confirmed')
      .reduce((sum: number, payment: any) => sum + Number(payment.amount || 0), 0);

    return NextResponse.json({
      success: true,
      data: {
        project,
        summary: {
          total_milestones: milestones?.length ?? 0,
          completed_milestones: (milestones ?? []).filter((item: any) => item.status === 'completed').length,
          confirmed_funds: confirmedFunds,
          next_milestone: nextMilestone
        },
        timeline
      }
    });
  } catch (error) {
    console.error('CSR project evidence timeline error:', error);
    return NextResponse.json({ error: 'Failed to load project evidence timeline' }, { status: 500 });
  }
}
