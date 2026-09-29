import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import Razorpay from 'razorpay';
import { supabase } from '@/lib/db';
import {
  assertNgoLiveCsr1,
  CSR_PAYMENT_REQUIRES_LIVE_CSR1_MESSAGE,
  getEvidenceApproverContext,
  authErrorStatus,
  type EvidenceApproverContext,
} from '@/lib/server-auth';
import { confirmMilestonePayment } from '@/lib/milestone-payments';
import { getErrorMessage } from '@/lib/utils';

function safeSignatureMatch(expected: string, received: string): boolean {
  const expectedBuffer = Buffer.from(String(expected || ''), 'utf8');
  const receivedBuffer = Buffer.from(String(received || ''), 'utf8');
  if (expectedBuffer.length !== receivedBuffer.length) return false;
  return crypto.timingSafeEqual(expectedBuffer, receivedBuffer);
}

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

    const result = await confirmMilestonePayment({
      milestoneId,
      razorpayOrderId: razorpay_order_id,
      razorpayPaymentId: razorpay_payment_id,
      razorpaySignature: razorpay_signature,
      paidInr: Number((Number(providerPayment.amount || 0) / 100).toFixed(2)),
      paymentMethod: providerPayment.method || null,
      paidAt: new Date((providerPayment.created_at || 0) * 1000).toISOString(),
      orderNotes: providerOrder.notes || {},
      orderAmountPaise: providerOrder.amount,
      receipt: providerOrder.receipt ? String(providerOrder.receipt) : null,
      actor: approver,
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json({
      success: true,
      data: {
        message: result.alreadyRecorded
          ? 'Milestone payment already recorded'
          : 'Milestone payment verified and transferred to lead NGO',
        paymentConfirmationId: result.paymentConfirmationId,
        baseAmountInr: result.baseAmountInr,
        totalPaidInr: result.paidInr,
      },
    });
  } catch (error) {
    console.error('Milestone payment verify error:', error);
    return NextResponse.json({ error: getErrorMessage(error) || 'Failed to verify milestone payment' }, { status: 500 });
  }
}
