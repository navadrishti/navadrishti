import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/db';
import { getEvidenceApproverContext } from '@/lib/server-evidence-approver-auth';

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const milestoneId = params.id;
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

    const approver = await getEvidenceApproverContext(request, project.company_user_id);
    const reviewerId = approver.reviewerUserId ?? project.company_user_id;

    const reviewPayload = {
      milestone_id: milestoneId,
      evidence_id: evidenceId ?? null,
      reviewer_id: reviewerId,
      decision,
      comments: comments ?? null
    };

    const { data: review, error: reviewError } = await supabase
      .from('csr_milestone_reviews')
      .insert(reviewPayload)
      .select('*')
      .single();

    if (reviewError) {
      console.error('Failed to create milestone review:', reviewError);
      return NextResponse.json({ error: 'Failed to review milestone' }, { status: 500 });
    }

    await supabase
      .from('csr_project_milestones')
      .update({ status: decision, updated_at: new Date().toISOString() })
      .eq('id', milestoneId);

    await supabase.from('csr_audit_log').insert({
      entity_type: 'milestone_review',
      entity_id: review.id,
      event_type: `milestone_${decision}`,
      event_hash: `milestone_review:${review.id}:${Date.now()}`,
      event_payload: {
        actor_type: approver.actorType,
        company_ca_identity_id: approver.companyCAIdentityId,
        milestone_id: milestoneId,
        evidence_id: evidenceId ?? null,
        decision,
        comments: comments ?? null
      },
      created_by: reviewerId
    });

    if (approver.actorType === 'company_ca' && approver.companyCAIdentityId) {
      await supabase.from('company_ca_action_log').insert({
        company_ca_identity_id: approver.companyCAIdentityId,
        project_id: project.id,
        milestone_id: milestoneId,
        action_type: `milestone_${decision}`,
        payload: {
          evidence_id: evidenceId ?? null,
          comments: comments ?? null
        }
      });
    }

    return NextResponse.json({ success: true, data: review });
  } catch (error) {
    if (
      error instanceof Error &&
      [
        'CA authentication required',
        'Invalid CA token',
        'Company CA authentication required',
        'Invalid company CA token',
        'Company CA identity not found',
        'Company CA identity is not active',
        'Company CA is not authorized for this company project'
      ].includes(error.message)
    ) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

    console.error('Milestone review error:', error);
    return NextResponse.json({ error: 'Failed to review milestone' }, { status: 500 });
  }
}
