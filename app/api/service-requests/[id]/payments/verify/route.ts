import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';
import Razorpay from 'razorpay';
import { db, supabase } from '@/lib/db';
import { JWT_SECRET } from '@/lib/auth';

interface JWTPayload {
  id: number;
  user_type: string;
  name?: string;
}

function parseAmountToInr(value: unknown): number {
  if (value === null || value === undefined) return 0;
  const text = String(value).trim();
  if (!text) return 0;

  const numericText = text.replace(/[^\d.-]/g, '');
  const parsed = Number(numericText);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

function isFinancialRequest(request: any, requirements: Record<string, any>): boolean {
  const requestType = String(requirements?.request_type || request?.request_type || request?.category || '').toLowerCase();
  return requestType.includes('financial');
}

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
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET) as JWTPayload;

    const keySecret = process.env.RAZORPAY_KEY_SECRET;
    const keyId = process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID;
    if (!keySecret || !keyId) {
      return NextResponse.json({ error: 'Razorpay is not configured' }, { status: 500 });
    }

    const body = await request.json();
    const action = String(body?.action || '').trim().toLowerCase();

    const { id } = await params;
    const requestId = Number(id);

    if (!Number.isFinite(requestId) || requestId <= 0) {
      return NextResponse.json({ error: 'Invalid request id' }, { status: 400 });
    }

    const serviceRequest = await db.serviceRequests.getById(requestId);
    if (!serviceRequest) {
      return NextResponse.json({ error: 'Service request not found' }, { status: 404 });
    }

    const requirements = (() => {
      try {
        return typeof serviceRequest.requirements === 'string'
          ? JSON.parse(serviceRequest.requirements)
          : (serviceRequest.requirements || {});
      } catch {
        return {};
      }
    })() as Record<string, any>;

    if (!isFinancialRequest(serviceRequest, requirements)) {
      return NextResponse.json({ error: 'Payments are enabled only for Financial Need requests' }, { status: 400 });
    }

    if (action === 'refund') {
      return NextResponse.json(
        { error: 'Refunds are handled by the admin panel only and cannot be initiated from the platform' },
        { status: 403 }
      );
    }

    if (decoded.user_type !== 'individual') {
      return NextResponse.json({ error: 'Only individuals can verify direct contributions' }, { status: 403 });
    }

    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
    } = body || {};

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return NextResponse.json({ error: 'Missing payment verification fields' }, { status: 400 });
    }

    const generatedSignature = crypto
      .createHmac('sha256', keySecret)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest('hex');

    if (!safeSignatureMatch(generatedSignature, String(razorpay_signature))) {
      return NextResponse.json({ error: 'Invalid payment signature' }, { status: 400 });
    }

    const razorpay = new Razorpay({ key_id: keyId, key_secret: keySecret });
    const [providerPayment, providerOrder] = await Promise.all([
      razorpay.payments.fetch(String(razorpay_payment_id)),
      razorpay.orders.fetch(String(razorpay_order_id))
    ]);

    if (!providerPayment || providerPayment.id !== razorpay_payment_id) {
      return NextResponse.json({ error: 'Unable to fetch payment from provider' }, { status: 400 });
    }

    if (providerPayment.order_id !== razorpay_order_id || providerOrder.id !== razorpay_order_id) {
      return NextResponse.json({ error: 'Order and payment mismatch' }, { status: 400 });
    }

    const providerStatus = String(providerPayment.status || '').toLowerCase();
    if (providerStatus !== 'captured') {
      return NextResponse.json({ error: `Payment not captured yet (status: ${providerStatus || 'unknown'})` }, { status: 409 });
    }

    const providerCurrency = String(providerPayment.currency || '').toUpperCase();
    if (providerCurrency !== 'INR') {
      return NextResponse.json({ error: 'Only INR payments are supported' }, { status: 400 });
    }

    const providerNotes = (providerOrder.notes || providerPayment.notes || {}) as Record<string, any>;
    const providerRequestId = Number(providerNotes?.service_request_id || 0);
    if (providerRequestId > 0 && providerRequestId !== requestId) {
      return NextResponse.json({ error: 'Payment is linked to a different request' }, { status: 403 });
    }

    const providerContributorId = Number(providerNotes?.contributor_id || 0);
    if (providerContributorId > 0 && providerContributorId !== Number(decoded.id)) {
      return NextResponse.json({ error: 'Payment belongs to a different contributor' }, { status: 403 });
    }

    const targetInr = parseAmountToInr(
      requirements?.funding_target_inr ?? requirements?.estimated_budget ?? requirements?.budget
    );

    if (targetInr <= 0) {
      return NextResponse.json({ error: 'This request has no valid financial target configured' }, { status: 400 });
    }

    const currentRaisedInr = parseAmountToInr(requirements?.funds_raised_inr);
    const paidInr = Number((Number(providerPayment.amount || 0) / 100).toFixed(2));

    if (paidInr <= 0) {
      return NextResponse.json({ error: 'Invalid contribution amount' }, { status: 400 });
    }

    const previousPayments = Array.isArray(requirements?.financial_transactions)
      ? requirements.financial_transactions
      : [];

    const alreadyRecordedInRequirements = previousPayments.some(
      (item: any) => item?.razorpay_payment_id === razorpay_payment_id
    );

    const { data: existingNormalizedPayment } = await supabase
      .from('razorpay_payments')
      .select('id')
      .eq('razorpay_payment_id', String(razorpay_payment_id))
      .maybeSingle();

    if (alreadyRecordedInRequirements || existingNormalizedPayment?.id) {
      try {
        const ngoUserId = Number(serviceRequest.ngo_id || serviceRequest.requester_id || serviceRequest.requester?.id || 0);
        const nowIso = new Date().toISOString();
        const { data: assignment } = await supabase
          .from('service_volunteers')
          .select('id, status')
          .eq('service_request_id', requestId)
          .eq('volunteer_id', decoded.id)
          .in('status', ['accepted', 'active', 'completed'])
          .order('updated_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        await supabase
          .from('razorpay_payment_orders')
          .upsert({
            service_request_id: requestId,
            volunteer_assignment_id: assignment?.id || null,
            contribution_id: null,
            payer_user_id: decoded.id,
            ngo_user_id: ngoUserId > 0 ? ngoUserId : decoded.id,
            razorpay_order_id,
            receipt: String(providerOrder.receipt || `sr_${requestId}`),
            amount_inr: Number(paidInr.toFixed(2)),
            amount_paise: Math.round(paidInr * 100),
            currency: 'INR',
            order_status: 'paid',
            order_notes: {
              service_request_id: String(requestId),
              contributor_id: String(decoded.id),
              source: 'verify_replay'
            },
            updated_at: nowIso
          }, { onConflict: 'razorpay_order_id' });

        const { data: orderRow } = await supabase
          .from('razorpay_payment_orders')
          .select('id')
          .eq('razorpay_order_id', razorpay_order_id)
          .maybeSingle();

        if (orderRow?.id) {
          await supabase
            .from('razorpay_payments')
            .upsert({
              order_id: orderRow.id,
              razorpay_order_id,
              razorpay_payment_id,
              razorpay_signature,
              amount_inr: Number(paidInr.toFixed(2)),
              amount_paise: Math.round(paidInr * 100),
              currency: 'INR',
              payment_status: 'captured',
              payment_method: null,
              paid_at: new Date((providerPayment.created_at || 0) * 1000).toISOString(),
              provider_payload: {
                contributor_id: decoded.id,
                service_request_id: requestId,
                replay: true,
                provider_payment_status: providerStatus
              },
              updated_at: nowIso
            }, { onConflict: 'razorpay_payment_id' });
        }
      } catch (dualWriteError) {
        console.error('Razorpay payment dual-write skipped (already recorded path):', dualWriteError);
      }

      return NextResponse.json({
        success: true,
        data: {
          message: 'Payment already recorded',
          fundsRaisedInr: currentRaisedInr,
          targetInr,
          status: serviceRequest.status
        }
      });
    }

    const nextRaisedInr = currentRaisedInr + paidInr;
    const reachedTarget = nextRaisedInr >= targetInr;

    const acceptedAssignments = await db.serviceVolunteers.getByRequestId(requestId);
    const matchingAssignment = (acceptedAssignments || []).find((item: any) =>
      item.volunteer_id === decoded.id && ['accepted', 'active', 'completed'].includes(String(item.status || '').toLowerCase())
    );

    if (matchingAssignment) {
      const existingFulfilled = parseAmountToInr(matchingAssignment.fulfilled_amount || 0);
      await db.serviceVolunteers.updateStatus(matchingAssignment.id, matchingAssignment.status || 'active');
      await supabase
        .from('service_volunteers')
        .update({
          fulfilled_amount: Number((existingFulfilled + paidInr).toFixed(2)),
          individual_done_at: matchingAssignment.individual_done_at || new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', matchingAssignment.id)
        .eq('service_request_id', requestId);
    }

    try {
      const ngoUserId = Number(serviceRequest.ngo_id || serviceRequest.requester_id || serviceRequest.requester?.id || 0);
      const nowIso = new Date().toISOString();

      await supabase
        .from('razorpay_payment_orders')
        .upsert({
          service_request_id: requestId,
          volunteer_assignment_id: matchingAssignment?.id || null,
          contribution_id: null,
          payer_user_id: decoded.id,
          ngo_user_id: ngoUserId > 0 ? ngoUserId : decoded.id,
          razorpay_order_id,
          receipt: String(providerOrder.receipt || `sr_${requestId}`),
          amount_inr: Number(paidInr.toFixed(2)),
          amount_paise: Math.round(paidInr * 100),
          currency: 'INR',
          order_status: 'paid',
          order_notes: providerNotes,
          updated_at: nowIso
        }, { onConflict: 'razorpay_order_id' });

      const { data: orderRow } = await supabase
        .from('razorpay_payment_orders')
        .select('id')
        .eq('razorpay_order_id', razorpay_order_id)
        .maybeSingle();

      if (orderRow?.id) {
        const { error: paymentInsertError } = await supabase
          .from('razorpay_payments')
          .insert({
            order_id: orderRow.id,
            razorpay_order_id,
            razorpay_payment_id,
            razorpay_signature,
            amount_inr: Number(paidInr.toFixed(2)),
            amount_paise: Math.round(paidInr * 100),
            currency: 'INR',
            payment_status: 'captured',
            payment_method: providerPayment.method || null,
            paid_at: new Date((providerPayment.created_at || 0) * 1000).toISOString(),
            provider_payload: {
              contributor_id: decoded.id,
              contributor_name: decoded.name || null,
              service_request_id: requestId,
              assignment_id: matchingAssignment?.id || null,
              provider_payment_status: providerStatus,
              provider_order_status: String(providerOrder.status || '').toLowerCase()
            },
            updated_at: nowIso
          });

        if (paymentInsertError && paymentInsertError.code === '23505') {
          return NextResponse.json({
            success: true,
            data: {
              message: 'Payment already recorded',
              fundsRaisedInr: currentRaisedInr,
              targetInr,
              status: serviceRequest.status
            }
          });
        }

        if (paymentInsertError) {
          throw paymentInsertError;
        }
      }
    } catch (dualWriteError) {
      console.error('Razorpay payment dual-write skipped:', dualWriteError);
    }

    const nextRequirements = {
      ...requirements,
      funding_target_inr: targetInr,
      funds_raised_inr: Number(nextRaisedInr.toFixed(2)),
      funds_remaining_inr: Number(Math.max(0, targetInr - nextRaisedInr).toFixed(2)),
      financial_transactions: [
        {
          razorpay_order_id,
          razorpay_payment_id,
          amount_inr: paidInr,
          contributor_id: decoded.id,
          contributor_type: decoded.user_type,
          contributor_name: decoded.name || null,
          paid_at: new Date((providerPayment.created_at || 0) * 1000).toISOString(),
          payment_method: providerPayment.method || null,
          payment_status: providerStatus
        },
        ...previousPayments
      ]
    };

    const updatePayload: Record<string, any> = {
      requirements: JSON.stringify(nextRequirements),
      updated_at: new Date().toISOString()
    };

    if (reachedTarget) {
      updatePayload.status = 'completed';
    } else if (serviceRequest.status === 'active') {
      updatePayload.status = 'in_progress';
    }

    await db.serviceRequests.update(requestId, updatePayload);

    return NextResponse.json({
      success: true,
      data: {
        message: reachedTarget ? 'Payment verified. Request is now fulfilled.' : 'Payment verified successfully',
        fundsRaisedInr: Number(nextRaisedInr.toFixed(2)),
        targetInr,
        status: reachedTarget ? 'completed' : (updatePayload.status || serviceRequest.status)
      }
    });
  } catch (error: any) {
    console.error('Error verifying payment for service request:', error);
    return NextResponse.json({ error: 'Failed to verify payment' }, { status: 500 });
  }
}
