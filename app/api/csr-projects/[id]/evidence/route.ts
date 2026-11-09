import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/db';
import { looksTechnicalError, toUserFacingError } from '@/lib/user-facing-error';
import { isCompanyCaAssignedToProject } from '@/lib/company-ca';
import { findAuthUser, getAuthUserFromRequest, hasActiveCASession, getCompanyCAFromRequest, authErrorResponse } from '@/lib/server-auth';
import {
  deriveCsrProjectFinance,
  deriveCsrProjectMetrics,
  deriveMilestoneLifecycleStage,
  isPaidCompletedMilestoneStatus,
} from '@/lib/csr-agent/project-metrics';
import { enrichCsrPaymentsWithRefundLedger } from '@/lib/csr-agent/milestone-refund-accounting';
import type { UserData } from '@/lib/auth';
import type { Tables } from '@/lib/database.types';
import { isProjectFinancialLead } from '@/lib/csr-agent/project-financial-access';
import { resolveNgoProjectViewer } from '@/lib/csr-agent/ngo-project-viewer';
import { loadProjectExpenseTotals } from '@/lib/csr-agent/project-expense-totals';

type EvidenceRow = Tables<'csr_milestone_evidence'>;
type ReviewRow = Tables<'csr_milestone_reviews'>;
type PaymentRow = Tables<'csr_payment_confirmations'>;
type MediaRow = Tables<'csr_milestone_evidence_media'>;
type DocumentRow = Tables<'csr_milestone_evidence_documents'>;
type EvidenceUploader = { id: number; name: string | null; email: string | null };
type EvidenceWithUploads = EvidenceRow & {
  media: MediaRow[];
  documents: DocumentRow[];
  uploader?: EvidenceUploader | null;
  submitted_by_label?: string | null;
};

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

    const { data: milestones, error: milestoneError } = await supabase
      .from('csr_project_milestones')
      .select('*')
      .eq('project_id', projectId)
      .order('milestone_order', { ascending: true });

    if (milestoneError) {
      console.error('Failed to fetch milestones for evidence timeline:', milestoneError);
      return NextResponse.json({ error: 'Failed to load project timeline' }, { status: 500 });
    }

    const milestoneIds = (milestones ?? []).map((item) => item.id);

    const [evidenceResult, reviewResult, paymentResult] = await Promise.all([
      milestoneIds.length > 0
        ? supabase
            .from('csr_milestone_evidence')
            .select('*')
            .in('milestone_id', milestoneIds)
            .order('created_at', { ascending: false })
        : Promise.resolve({ data: [] as EvidenceRow[], error: null }),
      milestoneIds.length > 0
        ? supabase
            .from('csr_milestone_reviews')
            .select('*')
            .in('milestone_id', milestoneIds)
            .order('created_at', { ascending: false })
        : Promise.resolve({ data: [] as ReviewRow[], error: null }),
      milestoneIds.length > 0
        ? supabase
            .from('csr_payment_confirmations')
            .select('*')
            .in('milestone_id', milestoneIds)
            .order('created_at', { ascending: false })
        : Promise.resolve({ data: [] as PaymentRow[], error: null })
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
    const evidenceIds = evidenceRows.map((item) => item.id);
    const uploaderIds = Array.from(
      new Set(
        evidenceRows
          .map((item) => Number(item.uploaded_by))
          .filter((id) => Number.isFinite(id) && id > 0)
      )
    );

    const [mediaResult, documentsResult, uploadersResult] = await Promise.all([
      evidenceIds.length > 0
        ? supabase
            .from('csr_milestone_evidence_media')
            .select('*')
            .in('evidence_id', evidenceIds)
            .order('created_at', { ascending: true })
        : Promise.resolve({ data: [] as MediaRow[], error: null }),
      evidenceIds.length > 0
        ? supabase
            .from('csr_milestone_evidence_documents')
            .select('*')
            .in('evidence_id', evidenceIds)
            .order('created_at', { ascending: true })
        : Promise.resolve({ data: [] as DocumentRow[], error: null }),
      uploaderIds.length > 0
        ? supabase.from('users').select('id, name, email').in('id', uploaderIds)
        : Promise.resolve({ data: [] as EvidenceUploader[], error: null }),
    ]);

    if (mediaResult.error || documentsResult.error) {
      console.error('Failed to fetch evidence media/documents:', {
        mediaError: mediaResult.error,
        documentsError: documentsResult.error
      });
      return NextResponse.json({ error: 'Failed to load evidence uploads' }, { status: 500 });
    }

    if (uploadersResult.error) {
      console.error('Failed to fetch evidence uploaders:', uploadersResult.error);
    }

    const uploadersById = new Map<number, EvidenceUploader>();
    for (const row of uploadersResult.data ?? []) {
      uploadersById.set(Number(row.id), {
        id: Number(row.id),
        name: row.name == null ? null : String(row.name),
        email: row.email == null ? null : String(row.email),
      });
    }

    const reviewsByMilestone = (reviewResult.data ?? []).reduce((acc: Record<string, ReviewRow[]>, row) => {
      if (!acc[row.milestone_id]) {
        acc[row.milestone_id] = [];
      }
      acc[row.milestone_id].push(row);
      return acc;
    }, {});

    const { payments: paymentsWithRefunds } = await enrichCsrPaymentsWithRefundLedger(
      paymentResult.data ?? []
    )

    const paymentsByMilestone = paymentsWithRefunds.reduce((acc: Record<string, typeof paymentsWithRefunds>, row) => {
      if (!acc[row.milestone_id]) {
        acc[row.milestone_id] = [];
      }
      acc[row.milestone_id].push(row);
      return acc;
    }, {});

    const mediaByEvidence = (mediaResult.data ?? []).reduce((acc: Record<string, MediaRow[]>, row) => {
      if (!acc[row.evidence_id]) {
        acc[row.evidence_id] = [];
      }
      acc[row.evidence_id].push(row);
      return acc;
    }, {});

    const documentsByEvidence = (documentsResult.data ?? []).reduce((acc: Record<string, DocumentRow[]>, row) => {
      if (!acc[row.evidence_id]) {
        acc[row.evidence_id] = [];
      }
      acc[row.evidence_id].push(row);
      return acc;
    }, {});

    const evidenceByMilestone = evidenceRows.reduce((acc: Record<string, EvidenceWithUploads[]>, row) => {
      if (!acc[row.milestone_id]) {
        acc[row.milestone_id] = [];
      }
      const uploader = uploadersById.get(Number(row.uploaded_by)) ?? null;
      const summary =
        row.evidence_summary && typeof row.evidence_summary === 'object' && !Array.isArray(row.evidence_summary)
          ? (row.evidence_summary as Record<string, unknown>)
          : null;
      const foIdentityId = summary?.field_officer_identity_id
        ? String(summary.field_officer_identity_id)
        : null;
      const isFieldOfficerSubmission =
        Boolean(foIdentityId) || Number(row.uploaded_by) !== Number(row.ngo_user_id);
      const submittedByLabel = uploader
        ? `${isFieldOfficerSubmission ? 'Field Officer' : 'NGO'} · ${
            uploader.name || uploader.email || `User ${uploader.id}`
          }`
        : Number(row.uploaded_by) === Number(row.ngo_user_id)
          ? 'NGO account'
          : `User ${row.uploaded_by}`;
      acc[row.milestone_id].push({
        ...row,
        media: mediaByEvidence[row.id] ?? [],
        documents: documentsByEvidence[row.id] ?? [],
        uploader,
        submitted_by_label: submittedByLabel,
      });
      return acc;
    }, {});

    const timeline = (milestones ?? []).map((milestone) => {
      const evidence = evidenceByMilestone[milestone.id] ?? [];
      const reviews = reviewsByMilestone[milestone.id] ?? [];
      const payments = paymentsByMilestone[milestone.id] ?? [];

      const latestReview = reviews[0] ?? null;
      const latestPayment = payments[0] ?? null;
      const lifecycle = deriveMilestoneLifecycleStage({
        milestoneStatus: milestone.status,
        hasEvidence: evidence.length > 0,
        reviewDecision: latestReview?.decision ?? null,
        paymentStatus: latestPayment?.payment_status ?? null,
      });

      return {
        milestone,
        evidence,
        latest_review: latestReview,
        reviews,
        latest_payment: latestPayment,
        payments,
        lifecycle,
      };
    });

    const today = new Date();
    const openMilestones = (milestones ?? []).filter(
      (milestone) => !isPaidCompletedMilestoneStatus(milestone.status)
    );
    const nextMilestone = openMilestones.find((milestone) => {
      if (!milestone.due_date) return true;
      return new Date(milestone.due_date) >= today;
    }) ?? openMilestones[0] ?? null;

    const currentMilestone =
      timeline.find((row) => row.lifecycle.stage !== 'completed')?.milestone ??
      nextMilestone ??
      null;
    const currentLifecycle =
      timeline.find((row) => row.milestone.id === currentMilestone?.id)?.lifecycle ?? null;

    // Same formulas as GET /api/csr-projects so dashboard and timeline agree.
    const metrics = deriveCsrProjectMetrics({
      milestones: milestones ?? [],
      payments: paymentsWithRefunds,
      impactRows: null,
    });
    const finance = deriveCsrProjectFinance({
      totalBudget: project.total_budget,
      verifiedExpenditure: (await loadProjectExpenseTotals([project.id]))?.get(project.id) ?? null,
      confirmedFunds: metrics.confirmed_funds,
      pendingPaymentFunds: metrics.pending_payment_funds,
      approvedAwaitingPaymentFunds: metrics.approved_awaiting_payment_funds,
    });

    return NextResponse.json({
      success: true,
      data: {
        project,
        summary: {
          total_milestones: metrics.milestones_count,
          completed_milestones: metrics.completed_milestones_count,
          paid_completed_milestones: metrics.paid_completed_milestones_count,
          pending_milestones: metrics.pending_milestones_count,
          overall_completion_percentage: metrics.overall_completion_percentage,
          confirmed_funds: metrics.confirmed_funds,
          confirmed_funds_available: metrics.confirmed_funds_available,
          refunds_reconciled: metrics.refunds_reconciled,
          unreconciled_payment_count: metrics.unreconciled_payment_count,
          gross_confirmed_funds: metrics.gross_confirmed_funds,
          confirmed_refund_funds: metrics.confirmed_refund_funds,
          pending_payment_funds: metrics.pending_payment_funds,
          approved_awaiting_payment_funds: metrics.approved_awaiting_payment_funds,
          next_milestone: nextMilestone,
          current_milestone: currentMilestone,
          current_lifecycle: currentLifecycle,
          finance,
        },
        timeline
      }
    });
  } catch (error) {
    const authResponse = authErrorResponse(error);
    if (authResponse) return authResponse;
    console.error('CSR project evidence timeline error:', error);
    return NextResponse.json({ error: 'Failed to load project evidence timeline' }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: projectId } = await params;

    const viewer = await resolveProjectViewer(request);
    if (!viewer) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const body = await request.json();
    const action = String(body?.action || '').trim();
    const offerId = Number(body?.offer_id || 0);

    const { data: project, error: projectError } = await supabase
      .from('csr_projects')
      .select('*')
      .eq('id', projectId)
      .single();

    if (projectError || !project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    if (!(await canAccessProject(viewer, project))) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
    }

    if (
      !['capability_rental_dispatch', 'capability_rental_link_tracking', 'capability_rental_sync_delivery'].includes(action) ||
      !Number.isFinite(offerId) ||
      offerId <= 0
    ) {
      return NextResponse.json({ error: 'Invalid capability delivery action' }, { status: 400 });
    }

    const dispatchType = String(body?.dispatch_type || '').trim();
    const leg =
      String(body?.leg || '').trim() === 'return' || dispatchType === 'return_delivered'
        ? 'return'
        : 'outbound';
    const trackingId = String(body?.tracking_id || body?.trackingId || '').trim();

    const campaignId = String(project.campaign_id || '').trim();
    if (!campaignId) {
      return NextResponse.json({ error: 'Project is not linked to a campaign' }, { status: 400 });
    }

    const {
      assertCsrCapabilityDeliveryAccess,
      linkCsrCapabilityRentalTracking,
      loadCampaignRentalByOffer,
      syncCsrCapabilityRentalDelhivery,
    } = await import('@/lib/csr-agent/campaign');

    const actingUserId = Number(viewer.user?.id || 0);
    if (!actingUserId) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
    }

    let rentalRecord;
    try {
      rentalRecord = (await loadCampaignRentalByOffer(campaignId, offerId)).rental;
    } catch {
      return NextResponse.json({ error: 'CSR capability rental not found' }, { status: 404 });
    }

    try {
      assertCsrCapabilityDeliveryAccess({ userId: actingUserId, rental: rentalRecord, leg });
    } catch (accessError) {
      const message = accessError instanceof Error ? accessError.message : 'Insufficient permissions';
      return NextResponse.json({ error: message }, { status: 403 });
    }

    if (action === 'capability_rental_link_tracking') {
      const rental = await linkCsrCapabilityRentalTracking({
        campaignId,
        offerId,
        leg,
        trackingId,
      });
      return NextResponse.json({ success: true, data: { rental } });
    }

    const rental = await syncCsrCapabilityRentalDelhivery({
      campaignId,
      offerId,
      leg,
      trackingId: trackingId || undefined,
    });
    return NextResponse.json({ success: true, data: { rental } });
  } catch (error) {
    const authResponse = authErrorResponse(error);
    if (authResponse) return authResponse;
    console.error('CSR project capability dispatch error:', error);
    const message = error instanceof Error ? error.message : 'Failed to update capability delivery';
    const text = message.toLowerCase();
    const status = text.includes('not found')
      ? 404
      : (text.includes('permission') || text.includes('only the') || text.includes('insufficient'))
        ? 403
        : (text.includes('required') || text.includes('must ') || text.includes('applies to') || text.includes('invalid'))
          ? 400
          : 500;
    return NextResponse.json({ error: looksTechnicalError(message) ? toUserFacingError(message) : message }, { status });
  }
}
