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
    const paymentReference = body.payment_reference as string;
    const amount = body.amount;
    const receiptUrl = body.receipt_url as string | undefined;
    const paymentStatus = body.payment_status as string | undefined;

    if (!paymentReference || amount === undefined || amount === null) {
      return NextResponse.json(
        { error: 'payment_reference and amount are required' },
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
    const createdBy = approver.reviewerUserId ?? null;

    const statusToPersist = paymentStatus ?? 'pending';

    const payload = {
      milestone_id: milestoneId,
      project_id: project.id,
      payment_reference: paymentReference,
      amount,
      receipt_url: receiptUrl ?? null,
      payment_status: statusToPersist,
      confirmed_at: statusToPersist === 'confirmed' ? new Date().toISOString() : null
    };

    const { data, error } = await supabase
      .from('csr_payment_confirmations')
      .insert(payload)
      .select('*')
      .single();

    if (error) {
      console.error('Failed to create payment confirmation:', error);
      return NextResponse.json({ error: 'Failed to create payment confirmation' }, { status: 500 });
    }

    await supabase.from('csr_audit_log').insert({
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

    if (approver.actorType === 'company_ca' && approver.companyCAIdentityId) {
      await supabase.from('company_ca_action_log').insert({
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
    }

    if (statusToPersist === 'confirmed') {
      await supabase
        .from('csr_project_milestones')
        .update({ status: 'completed', updated_at: new Date().toISOString() })
        .eq('id', milestoneId);

      const { data: allMilestones } = await supabase
        .from('csr_project_milestones')
        .select('id, status')
        .eq('project_id', project.id);

      const totalMilestones = allMilestones?.length ?? 0;
      const completedMilestones = (allMilestones ?? []).filter((m: any) => m.status === 'completed').length;
      const progressPercentage = totalMilestones > 0
        ? Math.round((completedMilestones / totalMilestones) * 100)
        : 0;

      const { data: allPayments } = await supabase
        .from('csr_payment_confirmations')
        .select('amount, payment_status')
        .eq('project_id', project.id);

      const fundsUtilized = (allPayments ?? [])
        .filter((payment: any) => payment.payment_status === 'confirmed')
        .reduce((sum: number, payment: any) => sum + Number(payment.amount || 0), 0);

      await supabase
        .from('csr_projects')
        .update({
          funds_utilized: fundsUtilized,
          progress_percentage: progressPercentage,
          updated_at: new Date().toISOString()
        })
        .eq('id', project.id);
    }

    return NextResponse.json({ success: true, data }, { status: 201 });
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

    console.error('Milestone payment error:', error);
    return NextResponse.json({ error: 'Failed to create payment confirmation' }, { status: 500 });
  }
}
