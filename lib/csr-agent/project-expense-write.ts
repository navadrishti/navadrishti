import { supabase } from '@/lib/db'
import { randomUUID } from 'node:crypto'
import { opsTable } from '@/lib/csr-agent/project-ops-tables'
import { EXPENSE_CATEGORIES, type ExpenseCategory } from '@/lib/csr-agent/project-ops-finance'
import {
  findAutomatedLogisticsDuplicate,
  LOGISTICS_EXPENSE_SOURCE_TYPE,
} from '@/lib/csr-agent/sync-logistics-expense'
import { getErrorMessage, parseJsonObject } from '@/lib/utils'
import type { Json } from '@/lib/database.types'
import type { CsrProjectRow, ProjectOpsActor } from '@/lib/csr-agent/project-ops-access'

function money(value: unknown): number {
  const n = Number(value)
  return Number.isFinite(n) ? Number(n.toFixed(2)) : NaN
}

function isCategory(value: unknown): value is ExpenseCategory {
  return (EXPENSE_CATEGORIES as readonly string[]).includes(String(value || ''))
}

export type SubmitExpenseInput = {
  category: string
  amount: unknown
  description?: string | null
  expense_date?: string | null
  vendor_or_recipient?: string | null
  invoice_url?: string | null
  receipt_url?: string | null
  evidence_urls?: unknown
  source_type?: string | null
  source_reference?: string | null
}

function validateExpense(body: SubmitExpenseInput):
  | { ok: false; status: number; error: string }
  | { ok: true; amount: number; description: string; expenseDate: string; evidenceUrls: string[]; invoiceUrl: string | null; receiptUrl: string | null } {
  if (!isCategory(body.category)) {
    return { ok: false, status: 400, error: 'Invalid expense category' }
  }
  if (body.category === 'worker_wages') {
    return { ok: false, status: 400, error: 'Worker wages are recorded automatically from verified settlements' }
  }

  const amount = money(body.amount)
  if (!(amount > 0)) {
    return { ok: false, status: 400, error: 'Amount must be a positive number' }
  }

  const description = String(body.description || '').trim()
  if (!description) {
    return { ok: false, status: 400, error: 'Description is required' }
  }

  const expenseDate = String(body.expense_date || new Date().toISOString().slice(0, 10)).slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(expenseDate)) {
    return { ok: false, status: 400, error: 'Invalid expense date' }
  }

  const evidenceUrls = Array.isArray(body.evidence_urls)
    ? body.evidence_urls.map(String).filter(Boolean)
    : []
  const invoiceUrl = body.invoice_url ? String(body.invoice_url).trim() : null
  const receiptUrl = body.receipt_url ? String(body.receipt_url).trim() : null
  if (!invoiceUrl && !receiptUrl && evidenceUrls.length === 0) {
    return { ok: false, status: 400, error: 'Supporting evidence or receipt is required' }
  }
  return { ok: true, amount, description, expenseDate, evidenceUrls, invoiceUrl, receiptUrl } as const
}

export async function submitNgoProjectExpense(input: {
  project: CsrProjectRow
  actor: Extract<ProjectOpsActor, { role: 'ngo' }>
  body: SubmitExpenseInput
}): Promise<{ ok: true; expense: Record<string, unknown> } | { ok: false; status: number; error: string }> {
  const validation = validateExpense(input.body)
  if (!validation.ok) return validation
  const sourceType = input.body.source_type ? String(input.body.source_type).trim() : 'ngo_submission'
  const sourceReference = input.body.source_reference
    ? String(input.body.source_reference).trim()
    : `ngo:${input.actor.userId}:${randomUUID()}`

  // Block manual logistics rows that collide with an automated Delhivery shipment charge.
  if (input.body.category === 'outbound_logistics' || input.body.category === 'return_logistics') {
    if (sourceType === LOGISTICS_EXPENSE_SOURCE_TYPE) {
      return {
        ok: false,
        status: 400,
        error: 'Automated shipment source_type is reserved for system logistics sync',
      }
    }
    const bodyMeta = input.body as SubmitExpenseInput & { tracking_id?: string | null }
    const duplicate = await findAutomatedLogisticsDuplicate({
      projectId: input.project.id,
      category: input.body.category,
      trackingHint: bodyMeta.tracking_id || sourceReference,
      sourceReference,
    })
    if (duplicate) {
      return {
        ok: false,
        status: 409,
        error: `An automated logistics expense already exists for shipment ${duplicate.source_reference}`,
      }
    }
  }

  return insertValidatedExpense(input, validation, sourceType, sourceReference)
}

export async function resubmitNgoProjectExpense(input: {
    project: CsrProjectRow
    actor: Extract<ProjectOpsActor, { role: 'ngo' }>
    expenseId: string
    body: SubmitExpenseInput
  }): Promise<{ ok: true; expense: Record<string, unknown> } | { ok: false; status: number; error: string }> {
    if (!/^[0-9a-f-]{36}$/i.test(input.expenseId)) return { ok: false, status: 400, error: 'Invalid expense id' }
    const validation = validateExpense(input.body)
    if (!validation.ok) return validation
    const { data, error } = await opsTable('csr_project_expenses').select('*')
      .eq('id', input.expenseId).eq('project_id', input.project.id).maybeSingle()
    if (error) return { ok: false, status: 500, error: getErrorMessage(error) || 'Failed to load expense' }
    if (!data) return { ok: false, status: 404, error: 'Expense not found' }
    const current = data as Record<string, unknown>
    if (current.created_by !== input.actor.userId || current.source_type !== 'ngo_submission') {
      return { ok: false, status: 403, error: 'Only the submitting NGO can resubmit this expense' }
    }
    if (!['unreconciled', 'rejected'].includes(String(current.approval_status)) || current.payment_status !== 'unpaid') {
      return { ok: false, status: 409, error: 'Only unpaid rejected or flagged expenses can be resubmitted' }
    }
    if (typeof current.updated_at !== 'string' || !current.updated_at) {
      return { ok: false, status: 409, error: 'Expense version is unavailable; refresh and try again' }
    }
    if (input.body.category === 'outbound_logistics' || input.body.category === 'return_logistics') {
      const duplicate = await findAutomatedLogisticsDuplicate({
        projectId: input.project.id,
        category: input.body.category,
        sourceReference: String(current.source_reference || ''),
      })
      if (duplicate) return { ok: false, status: 409, error: `An automated logistics expense already exists for shipment ${duplicate.source_reference}` }
    }
    const metadata = parseJsonObject(current.metadata)
    if (metadata.resubmission_history != null && !Array.isArray(metadata.resubmission_history)) {
      return { ok: false, status: 409, error: 'Expense review history is invalid; contact support' }
    }
    const now = new Date().toISOString()
    const history = Array.isArray(metadata.resubmission_history) ? metadata.resubmission_history : []
    const snapshot = {
      category: current.category, amount: current.amount, description: current.description,
      expense_date: current.expense_date, vendor_or_recipient: current.vendor_or_recipient,
      invoice_url: current.invoice_url, receipt_url: current.receipt_url, evidence_urls: current.evidence_urls,
      approval_status: current.approval_status, review_action: metadata.review_action,
      review_reason: metadata.review_reason, reviewed_by_user_id: metadata.reviewed_by_user_id,
      reviewed_by_ca_identity_id: metadata.reviewed_by_ca_identity_id, reviewed_at: metadata.reviewed_at,
      resubmitted_by_user_id: input.actor.userId, resubmitted_at: now,
    }
    const nextMeta = { ...metadata, resubmission_history: [...history, snapshot], review_action: null,
      review_reason: null, reviewed_by_user_id: null, reviewed_by_ca_identity_id: null, reviewed_at: null }
    const { data: updated, error: updateError } = await opsTable('csr_project_expenses').update({
      category: input.body.category, amount: validation.amount, description: validation.description,
      expense_date: validation.expenseDate,
      vendor_or_recipient: input.body.vendor_or_recipient ? String(input.body.vendor_or_recipient).trim() : null,
      invoice_url: validation.invoiceUrl, receipt_url: validation.receiptUrl,
      evidence_urls: validation.evidenceUrls as Json, approval_status: 'proposed',
      metadata: nextMeta as Json, updated_at: now,
    }).eq('id', input.expenseId).eq('project_id', input.project.id)
      .eq('created_by', input.actor.userId).eq('source_type', 'ngo_submission')
      .eq('approval_status', String(current.approval_status)).eq('payment_status', 'unpaid')
      .eq('updated_at', current.updated_at).select('*').maybeSingle()
    if (updateError) return { ok: false, status: 500, error: getErrorMessage(updateError) || 'Failed to resubmit expense' }
    if (!updated) return { ok: false, status: 409, error: 'Expense changed; refresh and try again' }
    return { ok: true, expense: updated as Record<string, unknown> }
  }

async function insertValidatedExpense(
  input: { project: CsrProjectRow; actor: Extract<ProjectOpsActor, { role: 'ngo' }>; body: SubmitExpenseInput },
  validation: Extract<ReturnType<typeof validateExpense>, { ok: true }>,
  sourceType: string,
  sourceReference: string
): Promise<{ ok: true; expense: Record<string, unknown> } | { ok: false; status: number; error: string }> {
  const { amount, description, expenseDate, evidenceUrls, invoiceUrl, receiptUrl } = validation
  const nowIso = new Date().toISOString()
  const row = {
    project_id: input.project.id,
    campaign_id: input.project.campaign_id,
    category: input.body.category,
    amount,
    currency: 'INR',
    expense_date: expenseDate,
    vendor_or_recipient: input.body.vendor_or_recipient ? String(input.body.vendor_or_recipient).trim() : null,
    description,
    source_type: sourceType,
    source_reference: sourceReference,
    invoice_url: invoiceUrl,
    receipt_url: receiptUrl,
    evidence_urls: evidenceUrls as unknown as Json,
    approval_status: 'proposed',
    payment_status: 'unpaid',
    created_by: input.actor.userId,
    metadata: {
      submitted_by_role: 'ngo',
      submitted_by_user_id: input.actor.userId,
    } as Json,
    created_at: nowIso,
    updated_at: nowIso,
  }

  const { data, error } = await opsTable('csr_project_expenses').insert(row).select('*').single()
  if (error) {
    const message = getErrorMessage(error).toLowerCase()
    const code = error && typeof error === 'object' && 'code' in error ? String((error as { code?: unknown }).code) : ''
    if (code === '23505' || message.includes('duplicate') || message.includes('unique')) {
      return { ok: false, status: 409, error: 'An expense with this source reference already exists for the project' }
    }
    return { ok: false, status: 500, error: getErrorMessage(error) || 'Failed to submit expense' }
  }

  return { ok: true, expense: data as Record<string, unknown> }
}

export type ExpenseReviewAction = 'approve' | 'reject' | 'unreconciled'

export async function reviewProjectExpense(input: {
  project: CsrProjectRow
  actor: Extract<ProjectOpsActor, { role: 'company_ca' | 'admin' }>
  expenseId: string
  action: ExpenseReviewAction
  reason?: string | null
}): Promise<{ ok: true; expense: Record<string, unknown> } | { ok: false; status: number; error: string }> {
  if (!/^[0-9a-f-]{36}$/i.test(input.expenseId)) {
    return { ok: false, status: 400, error: 'Invalid expense id' }
  }

  const { data: existing, error: loadError } = await opsTable('csr_project_expenses')
    .select('*')
    .eq('id', input.expenseId)
    .eq('project_id', input.project.id)
    .maybeSingle()

  if (loadError) {
    return { ok: false, status: 500, error: getErrorMessage(loadError) || 'Failed to load expense' }
  }
  if (!existing) {
    return { ok: false, status: 404, error: 'Expense not found' }
  }

  const current = existing as Record<string, unknown>
  const approval = String(current.approval_status || '').toLowerCase()
  const payment = String(current.payment_status || '').toLowerCase()

  if (approval === 'unreconciled' || approval === 'rejected') {
    return { ok: false, status: 409, error: 'The NGO must resubmit this rejected or flagged expense before further review' }
  }
  if (payment === 'paid' || payment === 'waived') {
    return { ok: false, status: 409, error: 'Paid or waived expenses cannot be re-reviewed' }
  }
  if (approval === 'approved' && input.action === 'approve') {
    return { ok: true, expense: current }
  }
  if (approval === 'approved' && (input.action === 'reject' || input.action === 'unreconciled')) {
    return { ok: false, status: 409, error: 'Approved expenses cannot be rejected or flagged without a financial correction workflow' }
  }

  const reason = String(input.reason || '').trim()
  if ((input.action === 'reject' || input.action === 'unreconciled') && !reason) {
    return { ok: false, status: 400, error: 'A reason is required for this review action' }
  }

  const nextStatus =
    input.action === 'approve' ? 'approved' : input.action === 'reject' ? 'rejected' : 'unreconciled'

  const nowIso = new Date().toISOString()
  const reviewerUserId = input.actor.userId
  const meta = {
    ...parseJsonObject(current.metadata),
    review_action: input.action,
    review_reason: reason || null,
    reviewed_by_user_id: reviewerUserId,
    reviewed_by_ca_identity_id:
      input.actor.role === 'company_ca' ? input.actor.companyCAIdentityId : null,
    reviewed_at: nowIso,
  }

  // Concurrency guard: only transition from the status we just read.
  const { data: updated, error: updateError } = await opsTable('csr_project_expenses')
    .update({
      approval_status: nextStatus,
      approved_by: input.action === 'approve' ? reviewerUserId : current.approved_by ?? null,
      approved_at: input.action === 'approve' ? nowIso : current.approved_at ?? null,
      metadata: meta as Json,
      updated_at: nowIso,
    })
    .eq('id', input.expenseId)
    .eq('project_id', input.project.id)
    .eq('approval_status', approval)
    .select('*')
    .maybeSingle()

  if (updateError) {
    return { ok: false, status: 500, error: getErrorMessage(updateError) || 'Failed to update expense' }
  }
  if (!updated) {
    return { ok: false, status: 409, error: 'Expense could not be updated' }
  }

  const actionType =
    input.action === 'approve'
      ? 'expense_approved'
      : input.action === 'reject'
        ? 'expense_rejected'
        : 'expense_unreconciled'

  if (input.actor.role === 'company_ca') {
    await supabase.from('company_ca_action_log').insert({
      company_ca_identity_id: input.actor.companyCAIdentityId,
      project_id: input.project.id,
      action_type: actionType,
      payload: {
        expense_id: input.expenseId,
        previous_status: approval,
        next_status: nextStatus,
        reason: reason || null,
        amount: current.amount,
        category: current.category,
      } as Json,
    })
  }

  await supabase.from('csr_audit_log').insert({
    entity_type: 'csr_project_expense',
    entity_id: String(input.expenseId),
    event_type: actionType,
    event_hash: `${actionType}:${input.expenseId}:${nowIso}`,
    event_payload: {
      project_id: input.project.id,
      expense_id: input.expenseId,
      action: input.action,
      reason: reason || null,
      actor_user_id: reviewerUserId,
      actor_role: input.actor.role,
    },
    created_by: reviewerUserId,
  })

  return { ok: true, expense: updated as Record<string, unknown> }
}
