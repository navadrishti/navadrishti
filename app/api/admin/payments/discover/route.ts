import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/db'
import { getAdminUser } from '@/lib/server-auth'
import { getErrorMessage, parseJsonObject } from '@/lib/utils'

export async function GET(request: NextRequest) {
  try {
    const admin = getAdminUser(request)
    if (!admin) return NextResponse.json({ error: 'Admin authentication required' }, { status: 401 })

    const url = new URL(request.url)
    const paymentId = String(url.searchParams.get('paymentId') || '').trim()
    if (!paymentId) return NextResponse.json({ error: 'paymentId query is required' }, { status: 400 })

    const { data: paymentRow } = await supabase
      .from('razorpay_payments')
      .select('id, order_id, razorpay_order_id, amount_inr, amount_paise, paid_at, provider_payload')
      .eq('razorpay_payment_id', paymentId)
      .maybeSingle()

    if (paymentRow?.id) {
      // look up order for service_request linkage
      let serviceRequestId = null
      const providerPayload = parseJsonObject(paymentRow.provider_payload)
      if (providerPayload.service_request_id) {
        serviceRequestId = Number(providerPayload.service_request_id)
      }

      if (!serviceRequestId && paymentRow.order_id) {
        const { data: orderRow } = await supabase.from('razorpay_payment_orders').select('service_request_id, amount_inr, razorpay_order_id').eq('id', paymentRow.order_id).maybeSingle()
        if (orderRow?.service_request_id) serviceRequestId = Number(orderRow.service_request_id)
      }

      return NextResponse.json({ success: true, data: { service_request_id: serviceRequestId, amount_inr: paymentRow.amount_inr, paid_at: paymentRow.paid_at } })
    }

    const { data: orderRow } = await supabase.from('razorpay_payment_orders').select('id, service_request_id, amount_inr, razorpay_order_id').or(`razorpay_order_id.eq.${paymentId},receipt.eq.${paymentId}`).maybeSingle()
    if (orderRow?.id) {
      return NextResponse.json({ success: true, data: { service_request_id: orderRow.service_request_id ? Number(orderRow.service_request_id) : null, amount_inr: orderRow.amount_inr } })
    }

    return NextResponse.json({ success: false, error: 'Payment not found' }, { status: 404 })
  } catch (error) {
    console.error('Payment discover error:', error)
    return NextResponse.json({ error: getErrorMessage(error) || 'Internal error' }, { status: 500 })
  }
}
