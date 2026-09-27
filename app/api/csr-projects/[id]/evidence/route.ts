import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/db';
import { getAuthUserFromRequest, isCARequest, getCompanyCAFromRequest } from '@/lib/server-auth';
import type { Tables } from '@/lib/database.types';

type EvidenceRow = Tables<'csr_milestone_evidence'>;
type ReviewRow = Tables<'csr_milestone_reviews'>;
type PaymentRow = Tables<'csr_payment_confirmations'>;
type MediaRow = Tables<'csr_milestone_evidence_media'>;
type DocumentRow = Tables<'csr_milestone_evidence_documents'>;
type EvidenceWithUploads = EvidenceRow & { media: MediaRow[]; documents: DocumentRow[] };

async function canAccessProject(
  request: NextRequest,
  project: Pick<Tables<'csr_projects'>, 'company_user_id' | 'ngo_user_id'>
): Promise<boolean> {
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
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: projectId } = await params;

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

    const [mediaResult, documentsResult] = await Promise.all([
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
        : Promise.resolve({ data: [] as DocumentRow[], error: null })
    ]);

    if (mediaResult.error || documentsResult.error) {
      console.error('Failed to fetch evidence media/documents:', {
        mediaError: mediaResult.error,
        documentsError: documentsResult.error
      });
      return NextResponse.json({ error: 'Failed to load evidence uploads' }, { status: 500 });
    }

    const reviewsByMilestone = (reviewResult.data ?? []).reduce((acc: Record<string, ReviewRow[]>, row) => {
      if (!acc[row.milestone_id]) {
        acc[row.milestone_id] = [];
      }
      acc[row.milestone_id].push(row);
      return acc;
    }, {});

    const paymentsByMilestone = (paymentResult.data ?? []).reduce((acc: Record<string, PaymentRow[]>, row) => {
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
      acc[row.milestone_id].push({
        ...row,
        media: mediaByEvidence[row.id] ?? [],
        documents: documentsByEvidence[row.id] ?? []
      });
      return acc;
    }, {});

    const timeline = (milestones ?? []).map((milestone) => {
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
    const nextMilestone = (milestones ?? []).find((milestone) => {
      if (!milestone.due_date) {
        return milestone.status !== 'completed';
      }

      return milestone.status !== 'completed' && new Date(milestone.due_date) >= today;
    }) ?? (milestones ?? []).find((milestone) => milestone.status !== 'completed') ?? null;

    const confirmedFunds = (paymentResult.data ?? [])
      .filter((payment) => payment.payment_status === 'confirmed')
      .reduce((sum, payment) => sum + Number(payment.amount || 0), 0);

    return NextResponse.json({
      success: true,
      data: {
        project,
        summary: {
          total_milestones: milestones?.length ?? 0,
          completed_milestones: (milestones ?? []).filter((item) => item.status === 'completed').length,
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

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: projectId } = await params;
    const body = await request.json();
    const action = String(body?.action || '').trim();
    const offerId = Number(body?.offer_id || 0);
    const campaignId = String(body?.campaign_id || projectId).trim();

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

    const {
      linkCsrCapabilityRentalTracking,
      syncCsrCapabilityRentalDelhivery,
    } = await import('@/lib/csr-agent/campaign');

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
    console.error('CSR project capability dispatch error:', error);
    return NextResponse.json({ error: 'Failed to update capability delivery' }, { status: 500 });
  }
}
