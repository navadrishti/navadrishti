import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/db';
import { getEvidenceApproverContext,
  authErrorStatus, type EvidenceApproverContext } from '@/lib/server-auth';
import { getErrorMessage } from '@/lib/utils';

const REVIEWABLE_STATUSES = ['submitted'];

/** Undefined column (42703 / PGRST204) or NOT NULL reviewer_id (23502): the attribution migration is not applied. */
function isMissingReviewerColumn(error: { code?: string } | null): boolean {
  return ['42703', 'PGRST204', '23502'].includes(String(error?.code || ''));
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: milestoneId } = await params;

    let approver: EvidenceApproverContext;
    try {
      approver = await getEvidenceApproverContext(request, undefined, { requiredPermission: 'can_review_evidence' });
    } catch (error) {
      return NextResponse.json({ error: getErrorMessage(error) || 'CA authentication required' }, { status: authErrorStatus(error) });
    }

    const body = await request.json();
    const decision = body.decision as string;
    const comments = body.comments as string | undefined;
    const evidenceId = body.evidence_id as string | undefined;

    if (!decision || !['approved', 'rejected'].includes(decision)) {
      return NextResponse.json(
        { error: 'decision must be approved or rejected' },
        { status: 400 }
      );
    }

    const { data: milestone, error: milestoneError } = await supabase
      .from('csr_project_milestones')
      .select('*')
      .eq('id', milestoneId)
      .single();

    if (milestoneError || !milestone) {
      return NextResponse.json({ error: 'Milestone not found' }, { status: 404 });
    }

    const { data: project, error: projectError } = await supabase
      .from('csr_projects')
      .select('*')
      .eq('id', milestone.project_id)
      .single();

    if (projectError || !project) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
    }

    if (approver.companyUserId !== null && approver.companyUserId !== project.company_user_id) {
      return NextResponse.json({ error: 'Company CA is not authorized for this company project' }, { status: 403 });
    }

    if (!REVIEWABLE_STATUSES.includes(String(milestone.status || '').toLowerCase())) {
      return NextResponse.json({ error: 'Milestone is not awaiting review' }, { status: 409 });
    }

    if (evidenceId) {
      const { data: evidence, error: evidenceError } = await supabase
        .from('csr_milestone_evidence')
        .select('id')
        .eq('id', evidenceId)
        .eq('milestone_id', milestoneId)
        .maybeSingle();

      if (evidenceError) {
        console.error('Failed to load milestone evidence:', evidenceError);
        return NextResponse.json({ error: 'Failed to review milestone' }, { status: 500 });
      }

      if (!evidence) {
        return NextResponse.json({ error: 'Evidence not found for this milestone' }, { status: 404 });
      }
    }

    const { data: claimed, error: claimError } = await supabase
      .from('csr_project_milestones')
      .update({ status: decision, updated_at: new Date().toISOString() })
      .eq('id', milestoneId)
      .in('status', REVIEWABLE_STATUSES)
      .select('id');

    if (claimError) {
      console.error('Failed to update milestone status:', claimError);
      return NextResponse.json({ error: 'Failed to review milestone' }, { status: 500 });
    }

    if (!claimed || claimed.length === 0) {
      return NextResponse.json({ error: 'Milestone is not awaiting review' }, { status: 409 });
    }

    const reviewPayload = {
      milestone_id: milestoneId,
      evidence_id: evidenceId ?? null,
      decision,
      comments: comments ?? null
    };
    const insertReview = (reviewer: { reviewer_id: number | null; reviewer_platform_ca_id?: number | null }) =>
      supabase
        .from('csr_milestone_reviews')
        .insert({ ...reviewPayload, ...reviewer })
        .select('*')
        .single();

    let { data: review, error: reviewError } = approver.platformCAId
      ? await insertReview({ reviewer_id: null, reviewer_platform_ca_id: approver.platformCAId })
      : await insertReview({ reviewer_id: approver.reviewerUserId ?? project.company_user_id });

    if (approver.platformCAId && isMissingReviewerColumn(reviewError)) {
      // Before the reviewer attribution migration, reviewer_id is a NOT NULL users FK; the audit log keeps the CA.
      ({ data: review, error: reviewError } = await insertReview({ reviewer_id: project.company_user_id }));
    }

    if (reviewError || !review) {
      console.error('Failed to create milestone review:', reviewError);
      const { error: revertError } = await supabase
        .from('csr_project_milestones')
        .update({ status: milestone.status, updated_at: new Date().toISOString() })
        .eq('id', milestoneId)
        .eq('status', decision);
      if (revertError) console.error('Failed to revert milestone status:', revertError);
      return NextResponse.json({ error: 'Failed to review milestone' }, { status: 500 });
    }

    const { error: auditError } = await supabase.from('csr_audit_log').insert({
      entity_type: 'milestone_review',
      entity_id: review.id,
      event_type: `milestone_${decision}`,
      event_hash: `milestone_review:${review.id}:${Date.now()}`,
      event_payload: {
        actor_type: approver.actorType,
        platform_ca_id: approver.platformCAId,
        company_ca_identity_id: approver.companyCAIdentityId,
        milestone_id: milestoneId,
        evidence_id: evidenceId ?? null,
        decision,
        comments: comments ?? null
      },
      created_by: approver.reviewerUserId ?? null
    });
    if (auditError) console.error('Failed to write milestone review audit log:', auditError);

    if (approver.actorType === 'company_ca' && approver.companyCAIdentityId) {
      const { error: actionLogError } = await supabase.from('company_ca_action_log').insert({
        company_ca_identity_id: approver.companyCAIdentityId,
        project_id: project.id,
        milestone_id: milestoneId,
        action_type: `milestone_${decision}`,
        payload: {
          evidence_id: evidenceId ?? null,
          comments: comments ?? null
        }
      });
      if (actionLogError) console.error('Failed to write Company CA action log:', actionLogError);
    }

    return NextResponse.json({ success: true, data: review });
  } catch (error) {
    console.error('Milestone review error:', error);
    return NextResponse.json({ error: 'Failed to review milestone' }, { status: 500 });
  }
}
