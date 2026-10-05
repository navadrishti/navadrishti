import crypto from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { getCompanyCAFromRequest, hasCompanyCaPermission } from '@/lib/server-auth'
import Razorpay from 'razorpay'
import { settleCompanyCaPayment } from '@/lib/company-ca-payments'
import { getErrorMessage } from '@/lib/utils'

function safeSignatureMatch(expected: string, received: string): boolean {
  const expectedBuffer = Buffer.from(String(expected || ''), 'utf8')
  const receivedBuffer = Buffer.from(String(received || ''), 'utf8')
  if (expectedBuffer.length !== receivedBuffer.length) return false
  return crypto.timingSafeEqual(expectedBuffer, receivedBuffer)
}

export async function POST(request: NextRequest) {
  try {
    let companyUserId: number
    try {
      const companyCA = await getCompanyCAFromRequest(request)
      if (!hasCompanyCaPermission(companyCA.identity, 'can_confirm_payments')) {
        return NextResponse.json({ error: 'Company CA does not have permission to confirm payments' }, { status: 403 })
      }
      companyUserId = companyCA.identity.company_user_id
    } catch {
      return NextResponse.json({ error: 'Company CA authentication required' }, { status: 401 })
    }
    const keySecret = process.env.RAZORPAY_KEY_SECRET
    const keyId = process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID
    if (!keySecret || !keyId) return NextResponse.json({ error: 'Razorpay not configured' }, { status: 500 })

    const body = await request.json()
    const razorpay_order_id = String(body?.razorpay_order_id || '').trim()
    const razorpay_payment_id = String(body?.razorpay_payment_id || '').trim()
    const razorpay_signature = String(body?.razorpay_signature || '').trim()

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return NextResponse.json({ error: 'Missing payment fields' }, { status: 400 })
    }

    const expected = crypto.createHmac('sha256', keySecret).update(`${razorpay_order_id}|${razorpay_payment_id}`).digest('hex')
    if (!safeSignatureMatch(expected, razorpay_signature)) return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })

    const razorpay = new Razorpay({ key_id: keyId, key_secret: keySecret })
    const provPayment = await razorpay.payments.fetch(razorpay_payment_id)
    if (!provPayment || String(provPayment.id) !== razorpay_payment_id) return NextResponse.json({ error: 'Provider payment not found' }, { status: 400 })
    if (provPayment.status !== 'captured') return NextResponse.json({ error: 'Payment not captured' }, { status: 409 })

    const result = await settleCompanyCaPayment({
      razorpay,
      razorpayOrderId: razorpay_order_id,
      razorpayPaymentId: razorpay_payment_id,
      razorpaySignature: razorpay_signature,
      paidInr: Number((Number(provPayment.amount || 0) / 100).toFixed(2)),
      paymentMethod: provPayment.method || null,
      paidAt: new Date((provPayment.created_at || 0) * 1000).toISOString(),
      expectedPayerUserId: companyUserId,
    })
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })

    return NextResponse.json({
      success: true,
      data: { message: 'Payment verified and reconciled', amountInr: result.paidInr, creditedInr: result.creditedInr },
    })
  } catch (error) {
    console.error('CA verify error:', error)
    return NextResponse.json({ error: getErrorMessage(error) || 'Failed to verify payment' }, { status: 500 })
  }
}
