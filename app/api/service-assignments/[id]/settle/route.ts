import { NextRequest, NextResponse } from 'next/server'
import jwt from 'jsonwebtoken'
import Razorpay from 'razorpay'
import { supabase } from '@/lib/db'
import { JWT_SECRET } from '@/lib/auth'
import {
  createEngagementSettlementOrder,
  finalizeEngagementSettlement,
  getAssignmentOutstandingAmount,
  isDailyRentalAssignment,
  verifyRazorpaySignature,
} from '@/lib/engagement-settlement'

interface JWTPayload {
  id: number
  user_type: string
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const token = authHeader.split(' ')[1]
    const decoded = jwt.verify(token, JWT_SECRET) as JWTPayload
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

    if (decoded.user_type !== 'ngo' || Number(assignment.owner_user_id) !== Number(decoded.id)) {
      return NextResponse.json({ error: 'Only the owning NGO can settle this engagement' }, { status: 403 })
    }

    if (!isDailyRentalAssignment(assignment)) {
      return NextResponse.json({ error: 'Settlement is only available for daily rental engagements' }, { status: 400 })
    }

    const settlement = getAssignmentOutstandingAmount(assignment)
    if (settlement.settlementStatus === 'settled') {
      return NextResponse.json({ error: 'This engagement is already settled' }, { status: 409 })
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
      const payment = await razorpay.payments.fetch(razorpay_payment_id)
      if (String(payment.status) !== 'captured') {
        return NextResponse.json({ error: 'Payment not captured yet' }, { status: 409 })
      }

      const paidInr = Number((Number(payment.amount || 0) / 100).toFixed(2))
      const meta = await finalizeEngagementSettlement(assignment, {
        settledAmount: paidInr,
        settlementMode: 'razorpay',
        razorpayOrderId: razorpay_order_id,
        razorpayPaymentId: razorpay_payment_id,
      })

      await supabase.from('razorpay_payment_orders').update({
        order_status: 'paid',
        updated_at: new Date().toISOString(),
      }).eq('razorpay_order_id', razorpay_order_id)

      return NextResponse.json({
        success: true,
        data: { settled: true, settledAmount: paidInr, meta },
      })
    }

    const result = await createEngagementSettlementOrder(assignment, decoded.id)
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
    console.error('Engagement settlement error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to settle engagement' },
      { status: 500 }
    )
  }
}
