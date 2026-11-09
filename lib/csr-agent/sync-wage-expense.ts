import { supabase } from '@/lib/db'
import { isMissingStoreError } from '@/lib/auth-store'
import { getErrorMessage, parseJsonObject } from '@/lib/utils'
import type { Json, Tables } from '@/lib/database.types'

export const WAGE_EXPENSE_SOURCE_TYPE = 'engagement_settlement' as const

type AssignmentRow = Pick<
  Tables<'service_engagement_assignments'>,
  'id' | 'target_type' | 'target_id' | 'owner_user_id' | 'assignee_user_id' | 'application_table' | 'meta'
>

function isUuid(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value.trim())
}

function money(value: unknown): number {
  const n = Number(value)
  return Number.isFinite(n) ? Number(n.toFixed(2)) : 0
}

/**
 * Resolve a CSR project for an engagement only when the link is explicit.
 * Never invent a project from ambiguous marketplace need/offer relationships.
 */
export function extractExplicitCsrProjectHints(assignment: AssignmentRow): {
  projectIdHint: string | null
  campaignIdHint: string | null
} {
  const meta = parseJsonObject(assignment.meta)
  const targetType = String(assignment.target_type || '').toLowerCase()
  const targetId = String(assignment.target_id || '')

  let projectIdHint: string | null = null
  if (targetType === 'csr_project' && isUuid(targetId)) projectIdHint = targetId
  else if (isUuid(meta.csr_project_id)) projectIdHint = String(meta.csr_project_id)

  let campaignIdHint: string | null = null
  if (targetType === 'campaign' && isUuid(targetId)) campaignIdHint = targetId
  else if (isUuid(meta.campaign_id)) campaignIdHint = String(meta.campaign_id)

  return { projectIdHint, campaignIdHint }
}

export async function resolveCsrProjectForWageSettlement(
  assignment: AssignmentRow
): Promise<{ projectId: string; campaignId: string | null } | null> {
  const { projectIdHint, campaignIdHint } = extractExplicitCsrProjectHints(assignment)

  if (projectIdHint) {
    const { data, error } = await supabase
      .from('csr_projects')
      .select('id, campaign_id')
      .eq('id', projectIdHint)
      .maybeSingle()
    if (error) throw error
    if (!data?.id) return null
    return { projectId: String(data.id), campaignId: data.campaign_id ? String(data.campaign_id) : campaignIdHint }
  }

  if (campaignIdHint) {
    const { data, error } = await supabase
      .from('csr_projects')
      .select('id, campaign_id')
      .eq('campaign_id', campaignIdHint)
      .maybeSingle()
    if (error) throw error
    if (!data?.id) return null
    return { projectId: String(data.id), campaignId: String(data.campaign_id || campaignIdHint) }
  }

  return null
}

export type WageSettlementLedgerInput = {
  assignment: AssignmentRow
  settledAmount: number
  settlementMode: 'razorpay' | 'waived'
  razorpayOrderId?: string | null
  razorpayPaymentId?: string | null
  payerUserId?: number | null
  payeeUserId?: number | null
  /** Attendance rows covered by this settlement payment (audit only). */
  entryIds?: string[] | null
}

/**
 * Per-payment ledger key so partial settlements accumulate instead of overwriting.
 * Legacy full settlements used assignment id alone; heal paths still match that when needed.
 */
export function wageExpenseSourceReference(input: {
  assignmentId: string
  razorpayPaymentId?: string | null
  settlementMode: 'razorpay' | 'waived'
}): string {
  const assignmentId = String(input.assignmentId)
  const paymentId = String(input.razorpayPaymentId || '').trim()
  if (paymentId) return `${assignmentId}:${paymentId}`
  if (input.settlementMode === 'waived') return `${assignmentId}:waived`
  return assignmentId
}

export type WageExpenseLedgerPayload = {
  project_id: string
  campaign_id: string | null
  category: 'worker_wages'
  amount: number
  currency: 'INR'
  expense_date: string
  vendor_or_recipient: string | null
  description: string
  source_type: typeof WAGE_EXPENSE_SOURCE_TYPE
  source_reference: string
  approval_status: 'approved'
  payment_status: 'paid' | 'waived' | 'unpaid'
  metadata: Record<string, unknown>
}

/**
 * Map a finalized settlement onto a ledger row.
 * Amount is the verified settlement amount — never recomputed from attendance here.
 */
export function buildWageExpenseLedgerPayload(
  input: WageSettlementLedgerInput & { projectId: string; campaignId: string | null }
): WageExpenseLedgerPayload | null {
  const amount = money(input.settledAmount)
  if (amount <= 0) return null

  const payee =
    input.payeeUserId != null && Number(input.payeeUserId) > 0
      ? Number(input.payeeUserId)
      : Number(input.assignment.assignee_user_id || 0)

  const payment_status: WageExpenseLedgerPayload['payment_status'] =
    input.settlementMode === 'waived' ? 'waived' : 'paid'

  const today = new Date().toISOString().slice(0, 10)
  const source_reference = wageExpenseSourceReference({
    assignmentId: String(input.assignment.id),
    razorpayPaymentId: input.razorpayPaymentId,
    settlementMode: input.settlementMode,
  })

  return {
    project_id: input.projectId,
    campaign_id: input.campaignId,
    category: 'worker_wages',
    amount,
    currency: 'INR',
    expense_date: today,
    vendor_or_recipient: payee > 0 ? `worker:${payee}` : null,
    description: `Verified worker wage settlement for assignment ${input.assignment.id}`,
    source_type: WAGE_EXPENSE_SOURCE_TYPE,
    source_reference,
    approval_status: 'approved',
    payment_status,
    metadata: {
      assignment_id: String(input.assignment.id),
      worker_user_id: payee > 0 ? payee : null,
      payer_user_id: input.payerUserId != null ? Number(input.payerUserId) : null,
      settlement_mode: input.settlementMode,
      razorpay_order_id: input.razorpayOrderId || null,
      razorpay_payment_id: input.razorpayPaymentId || null,
      entry_ids: Array.isArray(input.entryIds) ? input.entryIds.map(String) : [],
      target_type: input.assignment.target_type,
      target_id: input.assignment.target_id,
    },
  }
}

export type WageExpenseSyncResult =
  | { synced: true; mode: 'inserted' | 'updated'; expenseId: string }
  | { synced: false; reason: 'no_project_link' | 'zero_amount' | 'table_missing' | 'error'; detail?: string }

/**
 * Idempotent upsert keyed by (project_id, engagement_settlement, source_reference).
 * source_reference is assignment:payment so partial settlements accumulate as separate rows.
 * Retries for the same payment update in place and never double-count.
 */
export async function syncWageExpenseFromSettlement(
  input: WageSettlementLedgerInput
): Promise<WageExpenseSyncResult> {
  try {
    const amount = money(input.settledAmount)
    if (amount <= 0) {
      return { synced: false, reason: 'zero_amount' }
    }

    const link = await resolveCsrProjectForWageSettlement(input.assignment)
    if (!link) {
      console.warn(
        '[csr-wage-expense] settlement has no reliable CSR project link; leaving outside project ledger',
        {
          assignment_id: input.assignment.id,
          target_type: input.assignment.target_type,
          target_id: input.assignment.target_id,
          settled_amount: amount,
        }
      )
      return { synced: false, reason: 'no_project_link' }
    }

    const payload = buildWageExpenseLedgerPayload({
      ...input,
      projectId: link.projectId,
      campaignId: link.campaignId,
    })
    if (!payload) return { synced: false, reason: 'zero_amount' }

    // Table is optional until migration; cast keeps generated Database types unblocked.
    const expenses = (supabase as unknown as { from: (table: string) => ReturnType<typeof supabase.from> })
      .from('csr_project_expenses')

    const findExisting = async (sourceReference: string) =>
      expenses
        .select('id, metadata')
        .eq('project_id', payload.project_id)
        .eq('source_type', payload.source_type)
        .eq('source_reference', sourceReference)
        .maybeSingle()

    const { data: initialExisting, error: existingError } = await findExisting(payload.source_reference)
    let existing = initialExisting

    // Heal legacy rows keyed only by assignment id when this payment already wrote that row.
    if (!existing?.id && payload.source_reference.includes(':') && input.razorpayPaymentId) {
      const legacy = await findExisting(String(input.assignment.id))
      if (!legacy.error && legacy.data?.id) {
        const legacyMeta = parseJsonObject((legacy.data as { metadata?: unknown }).metadata)
        const legacyPayment = String(legacyMeta.razorpay_payment_id || '')
        if (!legacyPayment || legacyPayment === String(input.razorpayPaymentId)) {
          existing = legacy.data
        }
      }
    }

    if (existingError) {
      if (isMissingStoreError(existingError)) {
        return { synced: false, reason: 'table_missing', detail: getErrorMessage(existingError) }
      }
      throw existingError
    }

    const nowIso = new Date().toISOString()
    const row = {
      project_id: payload.project_id,
      campaign_id: payload.campaign_id,
      category: payload.category,
      amount: payload.amount,
      currency: payload.currency,
      expense_date: payload.expense_date,
      vendor_or_recipient: payload.vendor_or_recipient,
      description: payload.description,
      source_type: payload.source_type,
      source_reference: payload.source_reference,
      approval_status: payload.approval_status,
      payment_status: payload.payment_status,
      metadata: payload.metadata as Json,
      updated_at: nowIso,
    }

    if (existing?.id) {
      const { data: updated, error: updateError } = await expenses
        .update(row)
        .eq('id', String((existing as { id: string }).id))
        .select('id')
        .maybeSingle()
      if (updateError) throw updateError
      return {
        synced: true,
        mode: 'updated',
        expenseId: String((updated as { id?: string } | null)?.id || (existing as { id: string }).id),
      }
    }

    const { data: inserted, error: insertError } = await expenses
      .insert({ ...row, created_at: nowIso })
      .select('id')
      .single()

    if (insertError) {
      // Concurrent insert: unique index hit → load and update.
      const message = getErrorMessage(insertError).toLowerCase()
      const code =
        insertError && typeof insertError === 'object' && 'code' in insertError
          ? String((insertError as { code?: unknown }).code)
          : ''
      if (code === '23505' || message.includes('duplicate') || message.includes('unique')) {
        const { data: raced, error: raceError } = await expenses
          .select('id')
          .eq('project_id', payload.project_id)
          .eq('source_type', payload.source_type)
          .eq('source_reference', payload.source_reference)
          .maybeSingle()
        if (raceError) throw raceError
        if ((raced as { id?: string } | null)?.id) {
          const racedId = String((raced as { id: string }).id)
          const { data: updated, error: updateError } = await expenses
            .update(row)
            .eq('id', racedId)
            .select('id')
            .maybeSingle()
          if (updateError) throw updateError
          return {
            synced: true,
            mode: 'updated',
            expenseId: String((updated as { id?: string } | null)?.id || racedId),
          }
        }
      }
      throw insertError
    }

    return { synced: true, mode: 'inserted', expenseId: String((inserted as { id?: string } | null)?.id || '') }
  } catch (error) {
    console.error('[csr-wage-expense] failed to sync settlement into project ledger', {
      assignment_id: input.assignment.id,
      settled_amount: input.settledAmount,
      settlement_mode: input.settlementMode,
      error: getErrorMessage(error) || error,
    })
    return { synced: false, reason: 'error', detail: getErrorMessage(error) || 'unknown' }
  }
}

/**
 * Best-effort ledger sync after a settlement is finalized.
 * Never throws — settlement success must not be rolled back by ledger failures.
 */
export async function syncWageExpenseFromSettlementSafe(
  input: WageSettlementLedgerInput
): Promise<WageExpenseSyncResult> {
  try {
    return await syncWageExpenseFromSettlement(input)
  } catch (error) {
    console.error('[csr-wage-expense] unexpected sync failure', {
      assignment_id: input.assignment.id,
      error: getErrorMessage(error) || error,
    })
    return { synced: false, reason: 'error', detail: getErrorMessage(error) || 'unknown' }
  }
}
