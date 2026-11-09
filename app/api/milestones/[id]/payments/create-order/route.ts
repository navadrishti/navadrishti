import { NextRequest, NextResponse } from 'next/server';
import Razorpay from 'razorpay';
import { supabase } from '@/lib/db';
import {
  createCsrMilestoneCheckoutOrder,
} from '@/lib/csr-milestone-payment-create';
import { PostgresCsrMilestonePaymentIntentStore } from '@/lib/csr-milestone-payment-intents';
import {
  invalidatePendingCsrMilestoneOrders,
  listPendingCsrMilestoneOrders,
  withMilestonePaymentCreateLock,
} from '@/lib/milestone-pending-orders';
import {
  assertEvidenceApproverAssignedToProject,
  CompanyCaAssignmentError,
} from '@/lib/company-ca';
import {
  assertNgoLiveCsr1,
  CSR_PAYMENT_REQUIRES_LIVE_CSR1_MESSAGE,
  getEvidenceApproverContext,
  authErrorStatus,
  type EvidenceApproverContext,
} from '@/lib/server-auth';
import { parseAmountToInr, getErrorMessage } from '@/lib/utils';
import type { Json } from '@/lib/database.types';
import {
  createPlatformPricedOrder,
  PayeeNotConnectedError,
} from '@/lib/razorpay-route';

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

    return await withMilestonePaymentCreateLock(milestoneId, async () => {
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

      try {
        await assertEvidenceApproverAssignedToProject({
          actorType: approver.actorType,
          reviewerUserId: approver.reviewerUserId,
          companyUserId: approver.companyUserId,
          projectCompanyUserId: Number(project.company_user_id),
          projectId: String(project.id),
        });
      } catch (error) {
        if (error instanceof CompanyCaAssignmentError) {
          return NextResponse.json({ error: error.message }, { status: error.status });
        }
        throw error;
      }

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

      const razorpay = new Razorpay({ key_id: keyId, key_secret: keySecret });
      const result = await createCsrMilestoneCheckoutOrder({
        milestoneId,
        projectId: String(project.id),
        payerUserId: Number(project.company_user_id),
        ngoUserId: leadNgoUserId,
        baseAmountInr,
        leadNgoName: leadNgo?.name || 'Lead NGO',
        keyId,
        razorpay,
        deps: {
          intentStore: new PostgresCsrMilestonePaymentIntentStore(),
          listPending: listPendingCsrMilestoneOrders,
          invalidatePending: invalidatePendingCsrMilestoneOrders,
          createRazorpayOrder: createPlatformPricedOrder,
          persistOrder: async (input) => {
            const nowIso = new Date().toISOString();
            const { error: orderRecordError } = await supabase.from('razorpay_payment_orders').upsert(
              {
                service_request_id: null,
                contribution_id: null,
                application_id: null,
                payer_user_id: input.payerUserId,
                ngo_user_id: input.ngoUserId,
                razorpay_order_id: input.razorpayOrderId,
                receipt: input.receipt,
                amount_inr: Number(input.pricing.totalChargeInr.toFixed(2)),
                amount_paise: input.pricing.totalChargePaise,
                currency: 'INR',
                order_status: 'created',
                order_notes: input.orderNotes as Json,
                expires_at: input.expiresAt,
                updated_at: nowIso,
              },
              { onConflict: 'razorpay_order_id' }
            );
            if (orderRecordError) throw orderRecordError;
          },
        },
      });

      if (!result.ok) {
        return NextResponse.json({ error: result.error }, { status: result.status });
      }

      return NextResponse.json({ success: true, data: result.data });
    });
  } catch (error) {
    if (error instanceof PayeeNotConnectedError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    console.error('Milestone payment create-order error:', error);
    return NextResponse.json({ error: getErrorMessage(error) || 'Failed to create milestone payment order' }, { status: 500 });
  }
}
