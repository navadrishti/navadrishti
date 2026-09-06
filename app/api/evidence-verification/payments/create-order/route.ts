import { NextRequest, NextResponse } from 'next/server'
import { verifyCompanyCA } from '@/lib/company-ca'
import Razorpay from 'razorpay'
import { supabase } from '@/lib/db'
import {
  buildPricingResponse,
  createPlatformPricedOrder,
  isRazorpayRouteEnabled,
} from '@/lib/razorpay-route'

function parseAmountToInr(value: unknown): number {
  if (value === null || value === undefined) return 0
  const text = String(value).trim()
  if (!text) return 0
  const numericText = text.replace(/[^\d.-]/g, '')
  const parsed = Number(numericText)
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0
}

export async function POST(request: NextRequest) {
  try {
    let token = null
    const auth = request.headers.get('authorization')
    if (auth && auth.startsWith('Bearer ')) token = auth.substring(7)
    else token = request.cookies.get('evidence-verification-token')?.value || request.cookies.get('ca-token')?.value || null

    if (!token) return NextResponse.json({ error: 'Company CA auth required' }, { status: 401 })

    const verify = await verifyCompanyCA(token)
    if (!verify || !verify.success) return NextResponse.json({ error: 'Invalid company CA token' }, { status: 403 })

    const body = await request.json()
    const attendanceEntryId = body?.attendanceEntryId ? String(body.attendanceEntryId).trim() : null
    const contributionId = body?.contributionId ? String(body.contributionId).trim() : null
    const attendanceEntryIds: string[] = Array.isArray(body?.attendanceEntryIds) ? body.attendanceEntryIds.map(String) : []
    const contributionIds: string[] = Array.isArray(body?.contributionIds) ? body.contributionIds.map(String) : []

    if (!attendanceEntryId && !contributionId && attendanceEntryIds.length === 0 && contributionIds.length === 0) {
      return NextResponse.json({ error: 'attendanceEntryId(s) or contributionId(s) required' }, { status: 400 })
    }

    let baseAmountInr = 0
    let serviceRequestId: number | null = null
    let meta: any = {}

    if (attendanceEntryId) attendanceEntryIds.push(attendanceEntryId)
    if (contributionId) contributionIds.push(contributionId)

    if (attendanceEntryIds.length > 0) {
      const { data: entries } = await supabase.from('service_attendance_entries').select('*').in('id', attendanceEntryIds)
      if (!entries || entries.length === 0) return NextResponse.json({ error: 'Attendance entries not found' }, { status: 404 })
      const payableEntries = entries.filter((e: any) => String(e.payment_status || 'pending').toLowerCase() !== 'paid')
      if (payableEntries.length === 0) return NextResponse.json({ success: true, data: { paymentRequired: false, message: 'Already paid' } })
      baseAmountInr = payableEntries.reduce((s: number, e: any) => s + Number(e.amount_due || 0), 0)
      serviceRequestId = entries[0].service_request_id || null
      meta = { attendanceEntryIds }
    }

    if (contributionIds.length > 0) {
      const { data: contribs } = await supabase.from('service_request_contributions').select('*').in('id', contributionIds)
      if (!contribs || contribs.length === 0) return NextResponse.json({ error: 'Contributions not found' }, { status: 404 })
      const alreadyPaidC = contribs.filter((c: any) => c.status === 'paid')
      if (alreadyPaidC.length === contribs.length) return NextResponse.json({ success: true, data: { paymentRequired: false, message: 'Already paid' } })
      baseAmountInr += contribs.reduce((s: number, c: any) => s + Number(c.amount || 0), 0)
      serviceRequestId = serviceRequestId || contribs[0].service_request_id || null
      meta = { ...meta, contributionIds }
    }

    if (baseAmountInr <= 0) return NextResponse.json({ success: true, data: { paymentRequired: false, amountInr: 0 } })

    let beneficiaryUserId = 0
    let beneficiaryName = 'NGO'
    if (serviceRequestId) {
      const { data: serviceRequest } = await supabase
        .from('service_requests')
        .select('ngo_id')
        .eq('id', serviceRequestId)
        .maybeSingle()
      beneficiaryUserId = Number(serviceRequest?.ngo_id || 0)
      beneficiaryName = 'NGO'
    }

    const keyId = process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID
    const keySecret = process.env.RAZORPAY_KEY_SECRET
    if (!keyId || !keySecret) return NextResponse.json({ error: 'Razorpay is not configured' }, { status: 500 })

    const razorpay = new Razorpay({ key_id: keyId, key_secret: keySecret })
    const receipt = `ca_pay_${verify.company_ca.company_user_id}_${serviceRequestId || 'na'}_${Date.now()}`
    const { order, pricing, orderNotes } = await createPlatformPricedOrder({
      razorpay,
      baseAmountInr,
      receipt,
      paymentKind: 'company_ca',
      beneficiaryUserId: beneficiaryUserId > 0 ? beneficiaryUserId : undefined,
      beneficiaryName,
      notes: {
        source: 'company_ca_payment',
        paid_by_company_user_id: String(verify.company_ca.company_user_id),
        service_request_id: serviceRequestId ? String(serviceRequestId) : undefined,
        ...meta,
      },
    })

    const nowIso = new Date().toISOString()
    await supabase.from('razorpay_payment_orders').upsert({
      service_request_id: serviceRequestId,
      contribution_id: contributionId || null,
      application_id: null,
      payer_user_id: null,
      ngo_user_id: beneficiaryUserId > 0 ? beneficiaryUserId : verify.company_ca.company_user_id,
      razorpay_order_id: String(order.id),
      receipt,
      amount_inr: Number(pricing.totalChargeInr.toFixed(2)),
      amount_paise: pricing.totalChargePaise,
      currency: 'INR',
      order_status: 'created',
      order_notes: orderNotes,
      updated_at: nowIso
    }, { onConflict: 'razorpay_order_id' })

    return NextResponse.json({
      success: true,
      data: {
        orderId: order.id,
        ...buildPricingResponse(pricing),
        currency: order.currency,
        keyId,
        serviceRequestId,
        routeEnabled: isRazorpayRouteEnabled(),
      },
    })
  } catch (error: any) {
    console.error('CA create-order error:', error)
    return NextResponse.json({ error: error?.message || 'Failed to create order' }, { status: 500 })
  }
}
