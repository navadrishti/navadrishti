import { NextRequest, NextResponse } from 'next/server'
import Razorpay from 'razorpay'
import { supabase } from '@/lib/db'
import { getTokenClaims } from '@/lib/auth'
import {
  createEngagementSettlementOrder,
  getAssignmentOutstandingAmount,
  isDailyRentalAssignment,
  resolveEngagementSettlementParties,
  settleEngagementFromCapturedPayment,
  verifyRazorpaySignature,
} from '@/lib/engagement-settlement'
import { PayeeNotConnectedError } from '@/lib/razorpay-route'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const decoded = getTokenClaims(request)
    if (!decoded) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }
    const { id } = await params
    const body = await request.json()
    const action = String(body.action || 'start').toLowerCase()

    const { data: assignment, error } = await supabase
      .from('service_engagement_assignments')
      .select('*')
      .eq('id', id)
      .maybeSingle()

    if (error || !assignment) {
      return NextResponse.json({ error: 'Assignment not found' }, { status: 404 })
    }

    const parties = resolveEngagementSettlementParties(assignment)
    if (!parties.settleable) {
      return NextResponse.json({ error: parties.reason }, { status: 400 })
    }
    if (parties.payerUserId !== Number(decoded.id)) {
      return NextResponse.json({ error: 'Only the paying party can settle this engagement' }, { status: 403 })
    }

    if (!isDailyRentalAssignment(assignment)) {
      return NextResponse.json({ error: 'Settlement is only available for daily rental engagements' }, { status: 400 })
    }

    if (action === 'verify') {
      const razorpay_order_id = String(body.razorpay_order_id || '').trim()
      const razorpay_payment_id = String(body.razorpay_payment_id || '').trim()
      const razorpay_signature = String(body.razorpay_signature || '').trim()

      if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
        return NextResponse.json({ error: 'Missing Razorpay verification fields' }, { status: 400 })
      }

      if (!verifyRazorpaySignature(razorpay_order_id, razorpay_payment_id, razorpay_signature)) {
        return NextResponse.json({ error: 'Invalid payment signature' }, { status: 400 })
      }

      const keyId = process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID
      const keySecret = process.env.RAZORPAY_KEY_SECRET
      if (!keyId || !keySecret) {
        return NextResponse.json({ error: 'Razorpay is not configured' }, { status: 500 })
      }

      const razorpay = new Razorpay({ key_id: keyId, key_secret: keySecret })
      const [payment, providerOrder] = await Promise.all([
        razorpay.payments.fetch(razorpay_payment_id),
        razorpay.orders.fetch(razorpay_order_id),
      ])
      if (
        !payment ||
        payment.id !== razorpay_payment_id ||
        payment.order_id !== razorpay_order_id ||
        providerOrder?.id !== razorpay_order_id
      ) {
        return NextResponse.json({ error: 'Order and payment mismatch' }, { status: 400 })
      }
      if (String(payment.status || '').toLowerCase() !== 'captured') {
        return NextResponse.json({ error: 'Payment not captured yet' }, { status: 409 })
      }

      const result = await settleEngagementFromCapturedPayment({
        razorpay,
        razorpayOrderId: razorpay_order_id,
        razorpayPaymentId: razorpay_payment_id,
        paidInr: Number((Number(payment.amount || 0) / 100).toFixed(2)),
        orderNotes: providerOrder.notes && Object.keys(providerOrder.notes).length > 0 ? providerOrder.notes : undefined,
        orderAmountPaise: providerOrder.amount,
        expected: { assignmentId: String(assignment.id), payerUserId: Number(decoded.id) },
      })
      if (!result.ok) {
        return NextResponse.json({ error: result.error }, { status: result.status })
      }

      return NextResponse.json({
        success: true,
        data: {
          settled: true,
          settledAmount: result.settledAmount,
          paidInr: result.paidInr,
          meta: result.meta,
          ...(result.alreadyProcessed ? { alreadyProcessed: true } : {}),
        },
      })
    }

    const settlement = getAssignmentOutstandingAmount(assignment)
    if (settlement.settlementStatus === 'settled') {
      return NextResponse.json({ error: 'This engagement is already settled' }, { status: 409 })
    }
    if (!['active', 'in_progress'].includes(String(assignment.status || '').toLowerCase())) {
      return NextResponse.json({ error: 'Only an active engagement can be settled' }, { status: 409 })
    }

    const result = await createEngagementSettlementOrder(assignment, parties)
    if (!result.paymentRequired) {
      return NextResponse.json({
        success: true,
        data: {
          settled: true,
          paymentRequired: false,
          settledAmount: 0,
          meta: result.meta,
        },
      })
    }

    if (!('orderId' in result)) {
      throw new Error('Failed to create settlement payment order')
    }

    return NextResponse.json({
      success: true,
      data: {
        settled: false,
        paymentRequired: true,
        outstanding: result.outstanding,
        orderId: result.orderId,
        amount: result.amount,
        currency: result.currency,
        keyId: result.keyId,
      },
    })
  } catch (error) {
    if (error instanceof PayeeNotConnectedError) {
      return NextResponse.json({ error: error.message }, { status: 409 })
    }
    console.error('Engagement settlement error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to settle engagement' },
      { status: 500 }
    )
  }
}
