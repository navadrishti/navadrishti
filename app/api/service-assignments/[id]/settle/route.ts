import { NextRequest, NextResponse } from 'next/server'
import Razorpay from 'razorpay'
import { supabase } from '@/lib/db'
import { AuthError, getTokenClaims } from '@/lib/auth'
import {
  authErrorResponse,
  getCompanyCAFromRequest,
  hasCompanyCaPermission,
  requireCaVerifiedPayer,
} from '@/lib/server-auth'
import {
  createEngagementSettlementOrder,
  isDailyRentalAssignment,
  loadAssignmentOutstanding,
  resolveEngagementSettlementParties,
  settleEngagementFromCapturedPayment,
  verifyRazorpaySignature,
} from '@/lib/engagement-settlement'
import { PayeeNotConnectedError } from '@/lib/razorpay-route'
import { getErrorMessage } from '@/lib/utils'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const decoded = await getTokenClaims(request)
    let payerUserId = decoded ? Number(decoded.id) : 0

    if (!decoded) {
      try {
        const companyCA = await getCompanyCAFromRequest(request)
        if (!hasCompanyCaPermission(companyCA.identity, 'can_confirm_payments')) {
          return NextResponse.json({ error: 'Evidence Verifier does not have permission to confirm payments' }, { status: 403 })
        }
        payerUserId = Number(companyCA.identity.company_user_id)
      } catch (error) {
        if (error instanceof AuthError) {
          return NextResponse.json({ error: error.message }, { status: error.status })
        }
        return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
      }
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
    if (parties.payerUserId !== payerUserId) {
      return NextResponse.json({ error: 'Only the paying party can settle this engagement' }, { status: 403 })
    }

    if (!isDailyRentalAssignment(assignment)) {
      return NextResponse.json({ error: 'Settlement is only available for daily rental engagements' }, { status: 400 })
    }

    if (action !== 'verify' && decoded) {
      const payerGate = await requireCaVerifiedPayer(decoded.id, decoded.user_type)
      if (!payerGate.ok) {
        return NextResponse.json({ error: payerGate.error }, { status: 403 })
      }
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
        expected: { assignmentId: String(assignment.id), payerUserId },
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

    // Work completion may close the assignment before wages are paid. Allow delayed settlement
    // on completed engagements; cancelled / other terminal statuses stay ineligible.
    const assignmentStatus = String(assignment.status || '').toLowerCase()
    if (!['active', 'in_progress', 'completed'].includes(assignmentStatus)) {
      return NextResponse.json(
        { error: 'Only an active or completed engagement with unsettled wages can be settled' },
        { status: 409 }
      )
    }

    // Eligibility and outstanding come from attendance rows — never from cached settlement_status.
    const liveLedger = await loadAssignmentOutstanding(String(assignment.id))

    const requestedAmountRaw = body.amount ?? body.settle_amount_inr ?? body.settleAmountInr
    const requestedAmountInr =
      requestedAmountRaw == null || requestedAmountRaw === ''
        ? null
        : Number(requestedAmountRaw)
    if (requestedAmountInr != null && (!Number.isFinite(requestedAmountInr) || requestedAmountInr <= 0)) {
      return NextResponse.json({ error: 'Settlement amount must be a positive number' }, { status: 400 })
    }
    if (requestedAmountInr != null && requestedAmountInr > liveLedger.outstanding + 0.001) {
      return NextResponse.json(
        {
          error:
            'Settlement amount cannot exceed the outstanding wage balance. Amounts must cover whole attendance days only.',
        },
        { status: 400 }
      )
    }

    const entryIdsRaw = body.entry_ids ?? body.entryIds
    const entryIds = Array.isArray(entryIdsRaw)
      ? entryIdsRaw.map(String).filter(Boolean)
      : typeof entryIdsRaw === 'string' && entryIdsRaw.trim()
        ? entryIdsRaw.split(',').map((id: string) => id.trim()).filter(Boolean)
        : null

    const result = await createEngagementSettlementOrder(assignment, parties, {
      requestedAmountInr,
      entryIds,
    })
    if (!result.paymentRequired) {
      // No eligible unpaid attendance remained (paid and/or waived). Heal meta; no payment order.
      return NextResponse.json({
        success: true,
        data: {
          settled: true,
          paymentRequired: false,
          settledAmount: 0,
          outstanding: liveLedger.outstanding,
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
        settleAmount: result.settleAmount,
        remainingAfter: result.remainingAfter,
        entryIds: result.entryIds,
        orderId: result.orderId,
        amount: result.amount,
        totalCharge: result.totalCharge,
        baseAmount: result.baseAmount,
        currency: result.currency,
        keyId: result.keyId,
      },
    })
  } catch (error) {
    const auth = authErrorResponse(error)
    if (auth) return auth
    if (error instanceof PayeeNotConnectedError) {
      return NextResponse.json({ error: error.message }, { status: 409 })
    }
    console.error('Engagement settlement error:', error)
    return NextResponse.json(
      { error: getErrorMessage(error) || 'Failed to settle engagement' },
      { status: 500 }
    )
  }
}
