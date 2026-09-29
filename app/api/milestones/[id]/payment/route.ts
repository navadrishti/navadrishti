import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/db';
import {
  assertNgoLiveCsr1,
  CSR_PAYMENT_REQUIRES_LIVE_CSR1_MESSAGE,
  getEvidenceApproverContext,
  authErrorStatus,
  type EvidenceApproverContext,
} from '@/lib/server-auth';
import { finalizeMilestonePayment, isUniqueViolation } from '@/lib/milestone-payments';
import { getErrorMessage, parseAmountToInr } from '@/lib/utils';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: milestoneId } = await params;

    let approver: EvidenceApproverContext;
    try {
      approver = await getEvidenceApproverContext(request, undefined, { requiredPermission: 'can_confirm_payments' });
    } catch (error) {
      return NextResponse.json({ error: getErrorMessage(error) || 'CA authentication required' }, { status: authErrorStatus(error) });
    }

    const body = await request.json();
    const paymentReference = String(body?.payment_reference || '').trim();
    const receiptUrl = body?.receipt_url ? String(body.receipt_url) : null;
    const statusToPersist = body?.payment_status === undefined ? 'pending' : String(body.payment_status);

    if (!paymentReference) {
      return NextResponse.json({ error: 'payment_reference is required' }, { status: 400 });
    }

    if (!['pending', 'confirmed'].includes(statusToPersist)) {
      return NextResponse.json({ error: 'payment_status must be pending or confirmed' }, { status: 400 });
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

    const leadNgoUserId = Number(project.ngo_user_id || 0);
    if (Number.isFinite(leadNgoUserId) && leadNgoUserId > 0) {
      const csrGate = await assertNgoLiveCsr1(leadNgoUserId, CSR_PAYMENT_REQUIRES_LIVE_CSR1_MESSAGE);
      if (!csrGate.ok) {
        return NextResponse.json({ error: csrGate.error }, { status: 403 });
      }
    }

    if (String(milestone.status || '').toLowerCase() !== 'approved') {
      return NextResponse.json(
        { error: 'Milestone payment is available only after evidence approval' },
        { status: 409 }
      );
    }

    const amount = parseAmountToInr(milestone.amount);
    if (amount <= 0) {
      return NextResponse.json({ error: 'Milestone amount is not configured' }, { status: 400 });
    }

    const { data: existingConfirmed, error: existingError } = await supabase
      .from('csr_payment_confirmations')
      .select('id')
      .eq('milestone_id', milestoneId)
      .eq('payment_status', 'confirmed')
      .limit(1);

    if (existingError) {
      console.error('Failed to check existing payment confirmations:', existingError);
      return NextResponse.json({ error: 'Failed to create payment confirmation' }, { status: 500 });
    }

    if ((existingConfirmed || []).length > 0) {
      return NextResponse.json({ error: 'This milestone has already been paid' }, { status: 409 });
    }

    const createdBy = approver.reviewerUserId ?? null;

    const payload = {
      milestone_id: milestoneId,
      project_id: project.id,
      payment_reference: paymentReference,
      amount,
      receipt_url: receiptUrl,
      payment_status: statusToPersist,
      confirmed_at: statusToPersist === 'confirmed' ? new Date().toISOString() : null
    };

    const { data, error } = await supabase
      .from('csr_payment_confirmations')
      .insert(payload)
      .select('*')
      .single();

    if (isUniqueViolation(error)) {
      return NextResponse.json({ error: 'This milestone has already been paid' }, { status: 409 });
    }

    if (error || !data) {
      console.error('Failed to create payment confirmation:', error);
      return NextResponse.json({ error: 'Failed to create payment confirmation' }, { status: 500 });
    }

    const { error: auditError } = await supabase.from('csr_audit_log').insert({
      entity_type: 'payment_confirmation',
      entity_id: data.id,
      event_type: 'payment_confirmation_created',
      event_hash: `payment_confirmation:${data.id}:${Date.now()}`,
      event_payload: {
        actor_type: approver.actorType,
        company_ca_identity_id: approver.companyCAIdentityId,
        milestone_id: milestoneId,
        project_id: project.id,
        payment_reference: paymentReference,
        amount,
        payment_status: statusToPersist
      },
      created_by: createdBy
    });
    if (auditError) console.error('Failed to write payment confirmation audit log:', auditError);

    if (approver.actorType === 'company_ca' && approver.companyCAIdentityId) {
      const { error: actionLogError } = await supabase.from('company_ca_action_log').insert({
        company_ca_identity_id: approver.companyCAIdentityId,
        project_id: project.id,
        milestone_id: milestoneId,
        payment_confirmation_id: data.id,
        action_type: 'payment_confirmation_created',
        payload: {
          payment_reference: paymentReference,
          payment_status: statusToPersist,
          amount
        }
      });
      if (actionLogError) console.error('Failed to write Company CA action log:', actionLogError);
    }

    if (statusToPersist === 'confirmed') {
      await finalizeMilestonePayment(milestoneId, project.id);
    }

    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (error) {
    console.error('Milestone payment error:', error);
    return NextResponse.json({ error: 'Failed to create payment confirmation' }, { status: 500 });
  }
}
