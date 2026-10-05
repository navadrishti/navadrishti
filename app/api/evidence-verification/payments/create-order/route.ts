import { NextRequest, NextResponse } from 'next/server'
import { listCompanyPayableAssignmentIds } from '@/lib/company-ca-payable'
import { getCompanyCAFromRequest, hasCompanyCaPermission } from '@/lib/server-auth'
import Razorpay from 'razorpay'
import { supabase } from '@/lib/db'
import { resolveEngagementSettlementParties } from '@/lib/engagement-settlement'
import { getErrorMessage } from '@/lib/utils'
import {
  buildPricingResponse,
  createPlatformPricedOrder,
  isRazorpayRouteEnabled,
  PayeeNotConnectedError,
} from '@/lib/razorpay-route'

const SETTLED_ENTRY_STATUSES = new Set(['paid', 'waived'])

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
    const payeeUserIds = new Set<number>()

    if (attendanceEntryId) attendanceEntryIds.push(attendanceEntryId)
    if (contributionId) contributionIds.push(contributionId)

    if (attendanceEntryIds.length > 0) {
      const payableAssignmentIds = await listCompanyPayableAssignmentIds(companyUserId)
      const { data: entries } = payableAssignmentIds.length > 0
        ? await supabase
            .from('service_attendance_entries')
            .select('*')
            .in('id', attendanceEntryIds)
            .in('assignment_id', payableAssignmentIds)
        : { data: [] }
      if (!entries || entries.length === 0) return NextResponse.json({ error: 'Attendance entries not found' }, { status: 404 })
      const payableEntries = entries.filter((e) => !SETTLED_ENTRY_STATUSES.has(String(e.payment_status || 'pending').toLowerCase()))
      if (payableEntries.length === 0) return NextResponse.json({ success: true, data: { paymentRequired: false, message: 'Already paid' } })

      const assignmentIds = [...new Set(payableEntries.map((e) => String(e.assignment_id)))]
      const { data: assignments, error: assignmentsError } = await supabase
        .from('service_engagement_assignments')
        .select('id, meta, application_table, target_type, owner_user_id, assignee_user_id')
        .in('id', assignmentIds)
      if (assignmentsError) throw assignmentsError

      for (const assignment of assignments || []) {
        const parties = resolveEngagementSettlementParties(assignment)
        if (!parties.settleable) return NextResponse.json({ error: parties.reason }, { status: 400 })
        if (parties.payerUserId !== companyUserId) {
          return NextResponse.json({ error: 'Your company is not the paying party for this attendance' }, { status: 403 })
        }
        payeeUserIds.add(parties.payeeUserId)
      }

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

      const requestIds = [...new Set(unpaidContribs.map((c) => Number(c.service_request_id || 0)))]
      if (requestIds.length !== 1 || requestIds[0] <= 0 || (serviceRequestId && serviceRequestId !== requestIds[0])) {
        return NextResponse.json({ error: 'Pay contributions for one service request at a time' }, { status: 400 })
      }
      const { data: serviceRequest } = await supabase
        .from('service_requests')
        .select('ngo_id')
        .eq('id', requestIds[0])
        .maybeSingle()
      payeeUserIds.add(Number(serviceRequest?.ngo_id || 0))

      baseAmountInr += unpaidContribs.reduce((s: number, c) => s + Number(c.amount || 0), 0)
      serviceRequestId = requestIds[0]
      meta = { ...meta, contributionIds: unpaidContribs.map((c) => String(c.id)) }
    }

    if (baseAmountInr <= 0) return NextResponse.json({ success: true, data: { paymentRequired: false, amountInr: 0 } })

    if (payeeUserIds.size !== 1) {
      return NextResponse.json({ error: 'Pay entries for one recipient at a time' }, { status: 400 })
    }
    const [beneficiaryUserId] = [...payeeUserIds]

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
      beneficiaryName: 'The payee',
      notes: {
        source: 'company_ca_payment',
        paid_by_company_user_id: String(companyUserId),
        ...(serviceRequestId ? { service_request_id: String(serviceRequestId) } : {}),
      },
    })

    const nowIso = new Date().toISOString()
    const { error: orderError } = await supabase.from('razorpay_payment_orders').upsert({
      service_request_id: serviceRequestId,
      contribution_id: contributionId || null,
      application_id: null,
      payer_user_id: companyUserId,
      ngo_user_id: beneficiaryUserId,
      razorpay_order_id: String(order.id),
      receipt,
      amount_inr: Number(pricing.totalChargeInr.toFixed(2)),
      amount_paise: pricing.totalChargePaise,
      currency: 'INR',
      order_status: 'created',
      order_notes: { ...orderNotes, ...meta },
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
    if (error instanceof PayeeNotConnectedError) {
      return NextResponse.json({ error: error.message }, { status: 409 })
    }
    console.error('CA create-order error:', error)
    return NextResponse.json({ error: getErrorMessage(error) || 'Failed to create order' }, { status: 500 })
  }
}
