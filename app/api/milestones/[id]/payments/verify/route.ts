import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import Razorpay from 'razorpay';
import { supabase } from '@/lib/db';
import { getEvidenceApproverContext } from '@/lib/server-evidence-approver-auth';
import {
  assertNgoLiveCsr1,
  CSR_PAYMENT_REQUIRES_LIVE_CSR1_MESSAGE,
} from '@/lib/server-auth';

function safeSignatureMatch(expected: string, received: string): boolean {
  const expectedBuffer = Buffer.from(String(expected || ''), 'utf8');
  const receivedBuffer = Buffer.from(String(received || ''), 'utf8');
  if (expectedBuffer.length !== receivedBuffer.length) return false;
  return crypto.timingSafeEqual(expectedBuffer, receivedBuffer);
}

function parseAmountToInr(value: unknown): number {
  if (value === null || value === undefined) return 0;
  const text = String(value).trim();
  if (!text) return 0;
  const numericText = text.replace(/[^\d.-]/g, '');
  const parsed = Number(numericText);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: milestoneId } = await params;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;
    const keyId = process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID;
    if (!keySecret || !keyId) {
      return NextResponse.json({ error: 'Razorpay is not configured' }, { status: 500 });
    }

    const body = await request.json();
    const razorpay_order_id = String(body?.razorpay_order_id || '').trim();
    const razorpay_payment_id = String(body?.razorpay_payment_id || '').trim();
    const razorpay_signature = String(body?.razorpay_signature || '').trim();

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return NextResponse.json({ error: 'Missing payment verification fields' }, { status: 400 });
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
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    const approver = await getEvidenceApproverContext(request, project.company_user_id);

    const leadNgoUserId = Number(project.ngo_user_id || 0);
    if (Number.isFinite(leadNgoUserId) && leadNgoUserId > 0) {
      const csrGate = await assertNgoLiveCsr1(leadNgoUserId, CSR_PAYMENT_REQUIRES_LIVE_CSR1_MESSAGE);
      if (!csrGate.ok) {
        return NextResponse.json({ error: csrGate.error }, { status: 403 });
      }
    }

    const expected = crypto
      .createHmac('sha256', keySecret)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest('hex');
    if (!safeSignatureMatch(expected, razorpay_signature)) {
      return NextResponse.json({ error: 'Invalid payment signature' }, { status: 400 });
    }

    const razorpay = new Razorpay({ key_id: keyId, key_secret: keySecret });
    const [providerPayment, providerOrder] = await Promise.all([
      razorpay.payments.fetch(razorpay_payment_id),
      razorpay.orders.fetch(razorpay_order_id),
    ]);

    if (String(providerPayment.status || '').toLowerCase() !== 'captured') {
      return NextResponse.json({ error: 'Payment not captured yet' }, { status: 409 });
    }

    const orderNotes = (providerOrder.notes || {}) as Record<string, any>;
    if (String(orderNotes.milestone_id || '') !== String(milestoneId)) {
      return NextResponse.json({ error: 'Payment is linked to a different milestone' }, { status: 403 });
    }

    const paidInr = Number((Number(providerPayment.amount || 0) / 100).toFixed(2));
    const expectedTotalInr = parseAmountToInr(orderNotes.total_charge_inr);
    if (expectedTotalInr > 0 && Math.abs(paidInr - expectedTotalInr) > 0.01) {
      return NextResponse.json({ error: 'Paid amount does not match checkout total' }, { status: 400 });
    }

    const baseAmountInr = parseAmountToInr(orderNotes.base_amount_inr) || parseAmountToInr(milestone.amount);

    const { data: existingConfirmed } = await supabase
      .from('csr_payment_confirmations')
      .select('id')
      .eq('milestone_id', milestoneId)
      .eq('payment_status', 'confirmed')
      .limit(1);

    if ((existingConfirmed || []).length > 0) {
      return NextResponse.json({ success: true, data: { message: 'Milestone payment already recorded' } });
    }

    const nowIso = new Date().toISOString();

    await supabase.from('razorpay_payment_orders').upsert(
      {
        payer_user_id: Number(project.company_user_id),
        ngo_user_id: Number(project.ngo_user_id),
        razorpay_order_id,
        receipt: String(providerOrder.receipt || `csr_ms_${milestoneId}`),
        amount_inr: paidInr,
        amount_paise: Math.round(paidInr * 100),
        currency: 'INR',
        order_status: 'paid',
        order_notes: orderNotes,
        updated_at: nowIso,
      },
      { onConflict: 'razorpay_order_id' }
    );

    const { data: orderRow } = await supabase
      .from('razorpay_payment_orders')
      .select('id')
      .eq('razorpay_order_id', razorpay_order_id)
      .maybeSingle();

    if (orderRow?.id) {
      await supabase.from('razorpay_payments').upsert(
        {
          order_id: orderRow.id,
          razorpay_order_id,
          razorpay_payment_id,
          razorpay_signature,
          amount_inr: paidInr,
          amount_paise: Math.round(paidInr * 100),
          currency: 'INR',
          payment_status: 'captured',
          payment_method: providerPayment.method || null,
          paid_at: new Date((providerPayment.created_at || 0) * 1000).toISOString(),
          provider_payload: {
            milestone_id: milestoneId,
            project_id: project.id,
            base_amount_inr: baseAmountInr,
            source: 'csr_milestone_payment',
          },
          updated_at: nowIso,
        },
        { onConflict: 'razorpay_payment_id' }
      );
    }

    const { data: paymentConfirmation, error: confirmationError } = await supabase
      .from('csr_payment_confirmations')
      .insert({
        milestone_id: milestoneId,
        project_id: project.id,
        payment_reference: razorpay_payment_id,
        amount: baseAmountInr,
        receipt_url: null,
        payment_status: 'confirmed',
        confirmed_at: nowIso,
      })
      .select('*')
      .single();

    if (confirmationError) {
      console.error('Failed to create milestone payment confirmation:', confirmationError);
      return NextResponse.json({ error: 'Failed to record milestone payment' }, { status: 500 });
    }

    await supabase
      .from('csr_project_milestones')
      .update({ status: 'completed', updated_at: nowIso })
      .eq('id', milestoneId);

    const { data: allMilestones } = await supabase
      .from('csr_project_milestones')
      .select('id, status')
      .eq('project_id', project.id);

    const totalMilestones = allMilestones?.length ?? 0;
    const completedMilestones = (allMilestones ?? []).filter((m: any) => m.status === 'completed').length;
    const progressPercentage =
      totalMilestones > 0 ? Math.round((completedMilestones / totalMilestones) * 100) : 0;

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
        updated_at: nowIso,
      })
      .eq('id', project.id);

    await supabase.from('csr_audit_log').insert({
      entity_type: 'payment_confirmation',
      entity_id: paymentConfirmation.id,
      event_type: 'milestone_payment_verified',
      event_hash: `milestone_payment:${paymentConfirmation.id}:${Date.now()}`,
      event_payload: {
        actor_type: approver.actorType,
        company_ca_identity_id: approver.companyCAIdentityId,
        milestone_id: milestoneId,
        project_id: project.id,
        razorpay_payment_id,
        base_amount_inr: baseAmountInr,
        total_paid_inr: paidInr,
      },
      created_by: approver.reviewerUserId ?? null,
    });

    return NextResponse.json({
      success: true,
      data: {
        message: 'Milestone payment verified and transferred to lead NGO',
        paymentConfirmationId: paymentConfirmation.id,
        baseAmountInr,
        totalPaidInr: paidInr,
      },
    });
  } catch (error: any) {
    if (
      error instanceof Error &&
      [
        'CA authentication required',
        'Invalid CA token',
        'Company CA authentication required',
        'Invalid company CA token',
        'Company CA identity not found',
        'Company CA identity is not active',
        'Company CA is not authorized for this company project',
      ].includes(error.message)
    ) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

    console.error('Milestone payment verify error:', error);
    return NextResponse.json({ error: error?.message || 'Failed to verify milestone payment' }, { status: 500 });
  }
}
