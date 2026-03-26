import { NextRequest, NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';
import Razorpay from 'razorpay';
import { db } from '@/lib/db';
import { JWT_SECRET } from '@/lib/auth';

interface JWTPayload {
  id: number;
  user_type: string;
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

    if (serviceRequest.status === 'completed' || serviceRequest.status === 'cancelled') {
      return NextResponse.json({ error: 'This request is no longer accepting contributions' }, { status: 400 });
    }

    const body = await request.json();
    const desiredAmountInr = parseAmountToInr(body?.amount);

    const targetInr = parseAmountToInr(
      requirements?.funding_target_inr ?? requirements?.estimated_budget ?? requirements?.budget
    );

    if (targetInr <= 0) {
      return NextResponse.json({ error: 'This request has no valid financial target configured' }, { status: 400 });
    }

    const raisedInr = parseAmountToInr(requirements?.funds_raised_inr);
    const remainingInr = Math.max(0, targetInr - raisedInr);

    if (remainingInr <= 0) {
      return NextResponse.json({ error: 'Funding target already reached' }, { status: 400 });
    }

    const contributionInr = Math.min(Math.max(desiredAmountInr, 1), remainingInr);

    const keyId = process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;

    if (!keyId || !keySecret) {
      return NextResponse.json({ error: 'Razorpay is not configured on this environment' }, { status: 500 });
    }

    const razorpay = new Razorpay({ key_id: keyId, key_secret: keySecret });

    const order = await razorpay.orders.create({
      amount: Math.round(contributionInr * 100),
      currency: 'INR',
      receipt: `sr_${requestId}_${Date.now()}`,
      notes: {
        service_request_id: String(requestId),
        contributor_id: String(decoded.id)
      }
    });

    return NextResponse.json({
      success: true,
      data: {
        orderId: order.id,
        amount: contributionInr,
        currency: order.currency,
        keyId,
        requestId,
        requestTitle: serviceRequest.title,
        ngoName: serviceRequest.ngo_name || serviceRequest.requester?.name || 'NGO Request',
        targetInr,
        raisedInr,
        remainingInr
      }
    });
  } catch (error: any) {
    console.error('Error creating Razorpay order for service request:', error);
    return NextResponse.json({ error: 'Failed to create payment order' }, { status: 500 });
  }
}
