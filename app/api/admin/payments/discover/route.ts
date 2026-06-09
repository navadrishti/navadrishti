import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/db'
import { verifyToken } from '@/lib/auth'

const isAdminRequest = (request: NextRequest) => {
  const adminToken = request.cookies.get('admin-token')?.value;
  if (!adminToken) return null;
  try {
    const decoded = verifyToken(adminToken);
    if (!decoded || decoded.id !== -1) return null;
    return decoded;
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  try {
    const admin = isAdminRequest(request)
    if (!admin) return NextResponse.json({ error: 'Admin authentication required' }, { status: 401 })

    const url = new URL(request.url)
    const paymentId = String(url.searchParams.get('paymentId') || '').trim()
    if (!paymentId) return NextResponse.json({ error: 'paymentId query is required' }, { status: 400 })

    // Try to find normalized payment row
    const { data: paymentRow } = await supabase
      .from('razorpay_payments')
      .select('id, order_id, razorpay_order_id, amount_inr, amount_paise, paid_at, provider_payload')
      .eq('razorpay_payment_id', paymentId)
      .maybeSingle()

    if (paymentRow?.id) {
      // look up order for service_request linkage
      let serviceRequestId = null
      if (paymentRow.provider_payload && typeof paymentRow.provider_payload === 'object' && paymentRow.provider_payload.service_request_id) {
        serviceRequestId = Number(paymentRow.provider_payload.service_request_id)
      }

      if (!serviceRequestId && paymentRow.order_id) {
        const { data: orderRow } = await supabase.from('razorpay_payment_orders').select('service_request_id, amount_inr, razorpay_order_id').eq('id', paymentRow.order_id).maybeSingle()
        if (orderRow?.service_request_id) serviceRequestId = Number(orderRow.service_request_id)
      }

      return NextResponse.json({ success: true, data: { service_request_id: serviceRequestId, amount_inr: paymentRow.amount_inr, paid_at: paymentRow.paid_at } })
    }

    // Try to find by order id
    const { data: orderRow } = await supabase.from('razorpay_payment_orders').select('id, service_request_id, amount_inr, razorpay_order_id').or(`razorpay_order_id.eq.${paymentId},receipt.eq.${paymentId}`).maybeSingle()
    if (orderRow?.id) {
      return NextResponse.json({ success: true, data: { service_request_id: orderRow.service_request_id ? Number(orderRow.service_request_id) : null, amount_inr: orderRow.amount_inr } })
    }

    return NextResponse.json({ success: false, error: 'Payment not found' }, { status: 404 })
  } catch (error: any) {
    console.error('Payment discover error:', error)
    return NextResponse.json({ error: error?.message || 'Internal error' }, { status: 500 })
  }
}
