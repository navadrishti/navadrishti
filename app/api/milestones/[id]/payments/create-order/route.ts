import { NextRequest, NextResponse } from 'next/server';
import Razorpay from 'razorpay';
import { supabase } from '@/lib/db';
import { getEvidenceApproverContext } from '@/lib/server-auth';
import {
  assertNgoLiveCsr1,
  CSR_PAYMENT_REQUIRES_LIVE_CSR1_MESSAGE,
} from '@/lib/server-auth';
import {
  assertBeneficiaryRouteReady,
  buildPricingOrderNotes,
  buildPricingResponse,
  calculatePlatformCheckoutPricing,
  createRoutedRazorpayOrder,
  createStandardRazorpayOrder,
  isRazorpayRouteEnabled,
} from '@/lib/razorpay-route';

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

    const { data: milestone, error: milestoneError } = await supabase
      .from('csr_project_milestones')
      .select('*')
      .eq('id', milestoneId)
      .single();

    if (milestoneError || !milestone) {
      return NextResponse.json({ error: 'Milestone not found' }, { status: 404 });
    }

    if (String(milestone.status || '').toLowerCase() !== 'approved') {
      return NextResponse.json(
        { error: 'Milestone payment is available only after evidence approval' },
        { status: 400 }
      );
    }

    const { data: project, error: projectError } = await supabase
      .from('csr_projects')
      .select('*')
      .eq('id', milestone.project_id)
      .single();

    if (projectError || !project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    await getEvidenceApproverContext(request, project.company_user_id);

    const { data: existingConfirmed } = await supabase
      .from('csr_payment_confirmations')
      .select('id')
      .eq('milestone_id', milestoneId)
      .eq('payment_status', 'confirmed')
      .limit(1);

    if ((existingConfirmed || []).length > 0) {
      return NextResponse.json({ error: 'This milestone has already been paid' }, { status: 400 });
    }

    const baseAmountInr = parseAmountToInr(milestone.amount);
    if (baseAmountInr <= 0) {
      return NextResponse.json({ error: 'Milestone amount is not configured' }, { status: 400 });
    }

    const leadNgoUserId = Number(project.ngo_user_id || 0);
    if (!Number.isFinite(leadNgoUserId) || leadNgoUserId <= 0) {
      return NextResponse.json({ error: 'Lead NGO is not configured for this project' }, { status: 400 });
    }

    const csrGate = await assertNgoLiveCsr1(leadNgoUserId, CSR_PAYMENT_REQUIRES_LIVE_CSR1_MESSAGE);
    if (!csrGate.ok) {
      return NextResponse.json({ error: csrGate.error }, { status: 403 });
    }

    const { data: leadNgo } = await supabase
      .from('users')
      .select('id, name')
      .eq('id', leadNgoUserId)
      .maybeSingle();

    const keyId = process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;
    if (!keyId || !keySecret) {
      return NextResponse.json({ error: 'Razorpay is not configured' }, { status: 500 });
    }

    const pricing = calculatePlatformCheckoutPricing(baseAmountInr);
    const razorpay = new Razorpay({ key_id: keyId, key_secret: keySecret });

    let beneficiaryLinkedAccountId: string | null = null;
    if (isRazorpayRouteEnabled()) {
      const routeReady = await assertBeneficiaryRouteReady(leadNgoUserId, leadNgo?.name || 'Lead NGO');
      beneficiaryLinkedAccountId = routeReady.linkedAccountId;
    }

    const orderNotes = buildPricingOrderNotes(pricing, {
      source: 'csr_milestone_payment',
      payment_kind: 'csr_milestone',
      milestone_id: String(milestoneId),
      project_id: String(project.id),
      beneficiary_user_id: String(leadNgoUserId),
      company_user_id: String(project.company_user_id),
      transfer_on_hold: false,
    });

    const receipt = `csr_ms_${milestoneId}_${Date.now()}`;
    const order = beneficiaryLinkedAccountId
      ? await createRoutedRazorpayOrder({
          razorpay,
          pricing,
          receipt,
          notes: orderNotes,
          beneficiaryLinkedAccountId,
          paymentKind: 'csr_milestone',
          onHold: false,
        })
      : await createStandardRazorpayOrder({
          razorpay,
          pricing,
          receipt,
          notes: orderNotes,
        });

    const nowIso = new Date().toISOString();
    await supabase.from('razorpay_payment_orders').upsert(
      {
        service_request_id: null,
        contribution_id: null,
        volunteer_assignment_id: null,
        payer_user_id: Number(project.company_user_id),
        ngo_user_id: leadNgoUserId,
        razorpay_order_id: String(order.id),
        receipt,
        amount_inr: Number(pricing.totalChargeInr.toFixed(2)),
        amount_paise: pricing.totalChargePaise,
        currency: 'INR',
        order_status: 'created',
        order_notes: orderNotes,
        updated_at: nowIso,
      },
      { onConflict: 'razorpay_order_id' }
    );

    return NextResponse.json({
      success: true,
      data: {
        orderId: order.id,
        keyId,
        currency: order.currency,
        milestoneId,
        projectId: project.id,
        leadNgoName: leadNgo?.name || 'Lead NGO',
        ...buildPricingResponse(pricing),
        routeEnabled: isRazorpayRouteEnabled(),
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

    console.error('Milestone payment create-order error:', error);
    return NextResponse.json({ error: error?.message || 'Failed to create milestone payment order' }, { status: 500 });
  }
}
