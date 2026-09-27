import { NextRequest, NextResponse } from 'next/server'
import { listCompanyOwnedAssignmentIds } from '@/lib/company-ca'
import { getCompanyCAFromRequest } from '@/lib/server-auth'
import Razorpay from 'razorpay'
import { supabase } from '@/lib/db'
import { getErrorMessage } from '@/lib/utils'
import {
  buildPricingResponse,
  createPlatformPricedOrder,
  isRazorpayRouteEnabled,
} from '@/lib/razorpay-route'

export async function POST(request: NextRequest) {
  try {
    let companyUserId: number
    try {
      companyUserId = (await getCompanyCAFromRequest(request)).identity.company_user_id
    } catch {
      return NextResponse.json({ error: 'Company CA authentication required' }, { status: 401 })
    }

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
    let meta: Record<string, string[]> = {}

    if (attendanceEntryId) attendanceEntryIds.push(attendanceEntryId)
    if (contributionId) contributionIds.push(contributionId)

    if (attendanceEntryIds.length > 0) {
      const ownedAssignmentIds = await listCompanyOwnedAssignmentIds(companyUserId)
      const { data: entries } = ownedAssignmentIds.length > 0
        ? await supabase
            .from('service_attendance_entries')
            .select('*')
            .in('id', attendanceEntryIds)
            .in('assignment_id', ownedAssignmentIds)
        : { data: [] }
      if (!entries || entries.length === 0) return NextResponse.json({ error: 'Attendance entries not found' }, { status: 404 })
      const payableEntries = entries.filter((e) => String(e.payment_status || 'pending').toLowerCase() !== 'paid')
      if (payableEntries.length === 0) return NextResponse.json({ success: true, data: { paymentRequired: false, message: 'Already paid' } })
      baseAmountInr = payableEntries.reduce((s: number, e) => s + Number(e.amount_due || 0), 0)
      const requestEntry = payableEntries.find((e) => e.target_type === 'service_request')
      serviceRequestId = requestEntry ? Number(requestEntry.target_id) || null : null
      meta = { attendanceEntryIds: payableEntries.map((e) => String(e.id)) }
    }

    if (contributionIds.length > 0) {
      const { data: contribs } = await supabase
        .from('service_request_contributions')
        .select('*')
        .in('id', contributionIds)
        .eq('contributor_id', companyUserId)
      if (!contribs || contribs.length === 0) return NextResponse.json({ error: 'Contributions not found' }, { status: 404 })
      const unpaidContribs = contribs.filter((c) => c.status !== 'paid')
      if (unpaidContribs.length === 0) return NextResponse.json({ success: true, data: { paymentRequired: false, message: 'Already paid' } })
      baseAmountInr += unpaidContribs.reduce((s: number, c) => s + Number(c.amount || 0), 0)
      serviceRequestId = serviceRequestId || unpaidContribs[0].service_request_id || null
      meta = { ...meta, contributionIds: unpaidContribs.map((c) => String(c.id)) }
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
    const receipt = `ca_pay_${companyUserId}_${serviceRequestId || 'na'}_${Date.now()}`
    const { order, pricing, orderNotes } = await createPlatformPricedOrder({
      razorpay,
      baseAmountInr,
      receipt,
      paymentKind: 'company_ca',
      beneficiaryUserId: beneficiaryUserId > 0 ? beneficiaryUserId : undefined,
      beneficiaryName,
      notes: {
        source: 'company_ca_payment',
        paid_by_company_user_id: String(companyUserId),
        service_request_id: serviceRequestId ? String(serviceRequestId) : undefined,
        ...meta,
      },
    })

    const nowIso = new Date().toISOString()
    const { error: orderError } = await supabase.from('razorpay_payment_orders').upsert({
      service_request_id: serviceRequestId,
      contribution_id: contributionId || null,
      application_id: null,
      payer_user_id: companyUserId,
      ngo_user_id: beneficiaryUserId > 0 ? beneficiaryUserId : companyUserId,
      razorpay_order_id: String(order.id),
      receipt,
      amount_inr: Number(pricing.totalChargeInr.toFixed(2)),
      amount_paise: pricing.totalChargePaise,
      currency: 'INR',
      order_status: 'created',
      order_notes: orderNotes,
      updated_at: nowIso
    }, { onConflict: 'razorpay_order_id' })
    if (orderError) {
      console.error('Failed to record CA payment order:', orderError)
      return NextResponse.json({ error: 'Could not record this payment order. Please try again later.' }, { status: 500 })
    }

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
  } catch (error) {
    console.error('CA create-order error:', error)
    return NextResponse.json({ error: getErrorMessage(error) || 'Failed to create order' }, { status: 500 })
  }
}
