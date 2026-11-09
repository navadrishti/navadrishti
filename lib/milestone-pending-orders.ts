import { supabase } from '@/lib/db'
import {
  CSR_MILESTONE_PENDING_STATUSES,
  type MilestonePendingOrderRow,
} from '@/lib/milestone-pending-order-match'

export {
  CSR_MILESTONE_PENDING_STATUSES,
  buildMilestoneCheckoutPayload,
  isReusableCsrMilestonePendingOrder,
  pendingOrdersToInvalidate,
  selectReusableCsrMilestonePendingOrder,
  withMilestonePaymentCreateLock,
  type MilestonePendingOrderMatchInput,
  type MilestonePendingOrderRow,
} from '@/lib/milestone-pending-order-match'

export async function listPendingCsrMilestoneOrders(params: {
  milestoneId: string
  payerUserId: number
  ngoUserId: number
}): Promise<MilestonePendingOrderRow[]> {
  const { data, error } = await supabase
    .from('razorpay_payment_orders')
    .select(
      'id, razorpay_order_id, payer_user_id, ngo_user_id, amount_inr, amount_paise, currency, order_status, order_notes, expires_at, created_at, updated_at'
    )
    .eq('payer_user_id', params.payerUserId)
    .eq('ngo_user_id', params.ngoUserId)
    .in('order_status', [...CSR_MILESTONE_PENDING_STATUSES])
    .contains('order_notes', {
      payment_kind: 'csr_milestone',
      milestone_id: String(params.milestoneId),
    })
    .order('created_at', { ascending: true })

  if (error) throw error
  return (data || []) as MilestonePendingOrderRow[]
}

export async function invalidatePendingCsrMilestoneOrders(orderIds: string[]): Promise<void> {
  if (orderIds.length === 0) return
  const nowIso = new Date().toISOString()
  const { error } = await supabase
    .from('razorpay_payment_orders')
    .update({ order_status: 'failed', updated_at: nowIso })
    .in('id', orderIds)
    .in('order_status', [...CSR_MILESTONE_PENDING_STATUSES])
  if (error) throw error
}
