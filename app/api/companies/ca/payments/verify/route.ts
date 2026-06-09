import crypto from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { verifyCompanyCA } from '@/lib/company-ca'
import Razorpay from 'razorpay'
import { supabase } from '@/lib/db'

function safeSignatureMatch(expected: string, received: string): boolean {
  const expectedBuffer = Buffer.from(String(expected || ''), 'utf8')
  const receivedBuffer = Buffer.from(String(received || ''), 'utf8')
  if (expectedBuffer.length !== receivedBuffer.length) return false
  return crypto.timingSafeEqual(expectedBuffer, receivedBuffer)
}

export async function POST(request: NextRequest) {
  try {
    let token = null
    const auth = request.headers.get('authorization')
    if (auth && auth.startsWith('Bearer ')) token = auth.substring(7)
    else token = request.cookies.get('company-ca-token')?.value || request.cookies.get('ca-token')?.value || null

    if (!token) return NextResponse.json({ error: 'Company CA auth required' }, { status: 401 })
    const verify = await verifyCompanyCA(token)
    if (!verify || !verify.success) return NextResponse.json({ error: 'Invalid company CA token' }, { status: 403 })

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
    const [provPayment, provOrder] = await Promise.all([razorpay.payments.fetch(razorpay_payment_id), razorpay.orders.fetch(razorpay_order_id)])
    if (!provPayment || String(provPayment.id) !== razorpay_payment_id) return NextResponse.json({ error: 'Provider payment not found' }, { status: 400 })
    if (provPayment.status !== 'captured') return NextResponse.json({ error: 'Payment not captured' }, { status: 409 })

    // Find order row
    const { data: orderRow } = await supabase.from('razorpay_payment_orders').select('*').eq('razorpay_order_id', razorpay_order_id).maybeSingle()
    if (!orderRow) return NextResponse.json({ error: 'Order not found' }, { status: 404 })

    const paidInr = Number((Number(provPayment.amount || 0) / 100).toFixed(2))

    // If contribution id present, mark contribution paid; if attendance, mark attendance entry paid
    const notes = orderRow.order_notes || {}
    const attendanceEntryId = notes?.attendanceEntryId || notes?.attendance_entry_id || null
    const attendanceEntryIds: string[] = Array.isArray(notes?.attendanceEntryIds) ? notes.attendanceEntryIds.map(String) : []
    if (attendanceEntryId && !attendanceEntryIds.includes(attendanceEntryId)) attendanceEntryIds.push(String(attendanceEntryId))

    const contributionId = orderRow.contribution_id || notes?.contributionId || notes?.contribution_id || null
    const contributionIds: string[] = Array.isArray(notes?.contributionIds) ? notes.contributionIds.map(String) : []
    if (contributionId && !contributionIds.includes(contributionId)) contributionIds.push(String(contributionId))

    const nowIso = new Date().toISOString()

    // Dual write order as paid
    await supabase.from('razorpay_payment_orders').upsert({
      ...orderRow,
      order_status: 'paid',
      amount_inr: paidInr,
      amount_paise: Math.round(paidInr * 100),
      updated_at: nowIso
    }, { onConflict: 'razorpay_order_id' })

    const { data: orderRef } = await supabase.from('razorpay_payment_orders').select('id, service_request_id').eq('razorpay_order_id', razorpay_order_id).maybeSingle()

    if (orderRef?.id) {
      await supabase.from('razorpay_payments').upsert({
        order_id: orderRef.id,
        razorpay_order_id,
        razorpay_payment_id,
        razorpay_signature,
        amount_inr: paidInr,
        amount_paise: Math.round(paidInr * 100),
        currency: 'INR',
        payment_status: 'captured',
        payment_method: provPayment.method || null,
        paid_at: new Date((provPayment.created_at || 0) * 1000).toISOString(),
        provider_payload: provPayment || {},
        updated_at: nowIso
      }, { onConflict: 'razorpay_payment_id' })
    }

    // Handle contributionIds (array) first
    if (contributionIds.length > 0) {
      // mark contributions paid
      await supabase.from('service_request_contributions').update({ status: 'paid', updated_at: nowIso }).in('id', contributionIds)

      // Update service_request totals
      const serviceRequestId = Number(orderRow.service_request_id || 0)
      if (serviceRequestId > 0) {
        const { data: sr } = await supabase.from('service_requests').select('id, current_amount, target_amount').eq('id', serviceRequestId).maybeSingle()
        const current = Number(sr?.current_amount || 0)
        const next = Number((current + paidInr).toFixed(2))
        const target = Number(sr?.target_amount || 0)
        const remaining = target > 0 ? Number(Math.max(0, target - next).toFixed(2)) : null
        await supabase.from('service_requests').update({ current_amount: next, remaining_amount: remaining, updated_at: nowIso }).eq('id', serviceRequestId)
      }
    }

    if (attendanceEntryIds.length > 0) {
      await supabase.from('service_attendance_entries').update({ payment_status: 'paid', paid_order_id: orderRef?.id || null, updated_at: nowIso }).in('id', attendanceEntryIds)

      // Create one aggregated contribution row for this payment (option A)
      const serviceRequestId = Number(orderRow.service_request_id || 0)
      if (serviceRequestId > 0) {
        await supabase.from('service_request_contributions').insert({
          service_request_id: serviceRequestId,
          contributor_id: verify.company_ca.company_user_id,
          contribution_type: 'attendance_payment',
          amount: paidInr,
          status: 'paid',
          reference_text: `Aggregated attendance payment ${attendanceEntryIds.length} entries`,
          meta: { attendance_entry_ids: attendanceEntryIds, razorpay_order_id, razorpay_payment_id }
        })

        const { data: sr } = await supabase.from('service_requests').select('id, current_amount, target_amount').eq('id', serviceRequestId).maybeSingle()
        const current = Number(sr?.current_amount || 0)
        const next = Number((current + paidInr).toFixed(2))
        const target = Number(sr?.target_amount || 0)
        const remaining = target > 0 ? Number(Math.max(0, target - next).toFixed(2)) : null
        await supabase.from('service_requests').update({ current_amount: next, remaining_amount: remaining, updated_at: nowIso }).eq('id', serviceRequestId)
      }
    }

    return NextResponse.json({ success: true, data: { message: 'Payment verified and reconciled', amountInr: paidInr } })
  } catch (error: any) {
    console.error('CA verify error:', error)
    return NextResponse.json({ error: error?.message || 'Failed to verify payment' }, { status: 500 })
  }
}
