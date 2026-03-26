import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';
import { db } from '@/lib/db';
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

    if (!['individual', 'company'].includes(decoded.user_type)) {
      return NextResponse.json({ error: 'Only individuals and companies can contribute' }, { status: 403 });
    }

    const keySecret = process.env.RAZORPAY_KEY_SECRET;
    if (!keySecret) {
      return NextResponse.json({ error: 'Razorpay secret is not configured' }, { status: 500 });
    }

    const body = await request.json();
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      amount
    } = body || {};

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return NextResponse.json({ error: 'Missing payment verification fields' }, { status: 400 });
    }

    const generatedSignature = crypto
      .createHmac('sha256', keySecret)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest('hex');

    if (generatedSignature !== razorpay_signature) {
      return NextResponse.json({ error: 'Invalid payment signature' }, { status: 400 });
    }

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

    const targetInr = parseAmountToInr(
      requirements?.funding_target_inr ?? requirements?.estimated_budget ?? requirements?.budget
    );

    if (targetInr <= 0) {
      return NextResponse.json({ error: 'This request has no valid financial target configured' }, { status: 400 });
    }

    const currentRaisedInr = parseAmountToInr(requirements?.funds_raised_inr);
    const paidInr = parseAmountToInr(amount);

    if (paidInr <= 0) {
      return NextResponse.json({ error: 'Invalid contribution amount' }, { status: 400 });
    }

    const previousPayments = Array.isArray(requirements?.financial_transactions)
      ? requirements.financial_transactions
      : [];

    const alreadyRecorded = previousPayments.some(
      (item: any) => item?.razorpay_payment_id === razorpay_payment_id
    );

    if (alreadyRecorded) {
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
          paid_at: new Date().toISOString()
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
