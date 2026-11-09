import { supabase } from '@/lib/db'
import { opsTable } from '@/lib/csr-agent/project-ops-tables'
import { getErrorMessage, parseJsonObject } from '@/lib/utils'
import type { Json } from '@/lib/database.types'
import type { CsrProjectRow, ProjectOpsActor } from '@/lib/csr-agent/project-ops-access'

const ITEM_KINDS = ['consumable', 'reusable_equipment'] as const
type ItemKind = (typeof ITEM_KINDS)[number]

function qty(value: unknown, fallback = 0): number {
  if (value == null || value === '') return fallback
  const n = Number(value)
  return Number.isFinite(n) && n >= 0 ? Number(n.toFixed(3)) : NaN
}

function optionalMoney(value: unknown): number | null {
  if (value == null || value === '') return null
  const n = Number(value)
  return Number.isFinite(n) && n >= 0 ? Number(n.toFixed(2)) : NaN
}

export type SubmitMaterialInput = {
  name: string
  description?: string | null
  item_kind: string
  unit?: string | null
  required_quantity?: unknown
  procured_quantity?: unknown
  dispatched_quantity?: unknown
  received_quantity?: unknown
  consumed_quantity?: unknown
  damaged_quantity?: unknown
  missing_quantity?: unknown
  returned_quantity?: unknown
  /** Informational only — does not create an expense ledger row. */
  unit_cost?: unknown
  total_cost?: unknown
  outbound_shipment_ref?: string | null
  return_shipment_ref?: string | null
  invoice_url?: string | null
  evidence_urls?: unknown
  source_info?: string | null
}

export async function submitNgoProjectMaterial(input: {
  project: CsrProjectRow
  actor: Extract<ProjectOpsActor, { role: 'ngo' }>
  body: SubmitMaterialInput
}): Promise<{ ok: true; material: Record<string, unknown> } | { ok: false; status: number; error: string }> {
  const name = String(input.body.name || '').trim()
  if (!name) {
    return { ok: false, status: 400, error: 'Material or equipment name is required' }
  }

  const itemKind = String(input.body.item_kind || '').trim() as ItemKind
  if (!(ITEM_KINDS as readonly string[]).includes(itemKind)) {
    return { ok: false, status: 400, error: 'item_kind must be consumable or reusable_equipment' }
  }

  const required = qty(input.body.required_quantity, 0)
  const procured = qty(input.body.procured_quantity, 0)
  const dispatched = qty(input.body.dispatched_quantity, 0)
  const received = qty(input.body.received_quantity, 0)
  const consumed = qty(input.body.consumed_quantity, 0)
  const damaged = qty(input.body.damaged_quantity, 0)
  const missing = qty(input.body.missing_quantity, 0)
  const returned = qty(input.body.returned_quantity, 0)

  for (const [label, value] of [
    ['required_quantity', required],
    ['procured_quantity', procured],
    ['dispatched_quantity', dispatched],
    ['received_quantity', received],
    ['consumed_quantity', consumed],
    ['damaged_quantity', damaged],
    ['missing_quantity', missing],
    ['returned_quantity', returned],
  ] as const) {
    if (Number.isNaN(value)) {
      return { ok: false, status: 400, error: `Invalid ${label}` }
    }
  }

  const unitCost = optionalMoney(input.body.unit_cost)
  const totalCost = optionalMoney(input.body.total_cost)
  if (unitCost != null && Number.isNaN(unitCost)) {
    return { ok: false, status: 400, error: 'Invalid unit_cost' }
  }
  if (totalCost != null && Number.isNaN(totalCost)) {
    return { ok: false, status: 400, error: 'Invalid total_cost' }
  }

  const outbound = input.body.outbound_shipment_ref
    ? String(input.body.outbound_shipment_ref).trim()
    : null
  const returnRef = input.body.return_shipment_ref
    ? String(input.body.return_shipment_ref).trim()
    : null
  if (outbound && returnRef && outbound === returnRef) {
    return { ok: false, status: 400, error: 'Outbound and return shipment references must be distinct' }
  }

  const description = input.body.description ? String(input.body.description).trim() : null
  const sourceInfo =
    input.body.source_info != null
      ? String(input.body.source_info).trim()
      : description
  const evidenceUrls = Array.isArray(input.body.evidence_urls)
    ? input.body.evidence_urls.map(String).filter(Boolean)
    : []
  const invoiceUrl = input.body.invoice_url ? String(input.body.invoice_url).trim() : null

  const nowIso = new Date().toISOString()
  const row = {
    project_id: input.project.id,
    campaign_id: input.project.campaign_id,
    name,
    item_kind: itemKind,
    unit: input.body.unit ? String(input.body.unit).trim() || 'unit' : 'unit',
    required_quantity: required,
    procured_quantity: procured,
    dispatched_quantity: dispatched,
    received_quantity: received,
    consumed_quantity: consumed,
    damaged_quantity: damaged,
    missing_quantity: missing,
    returned_quantity: returned,
    unit_cost: unitCost,
    total_cost: totalCost,
    source_info: sourceInfo,
    outbound_shipment_ref: outbound,
    return_shipment_ref: returnRef,
    invoice_url: invoiceUrl,
    created_by: input.actor.userId,
    metadata: {
      description,
      evidence_urls: evidenceUrls,
      submission_status: 'submitted',
      submitted_by_role: 'ngo',
      submitted_by_user_id: input.actor.userId,
      submitted_at: nowIso,
      // Costs here are informational only — monetary recognition requires a separate expense row.
      cost_is_not_expense: true,
    } as Json,
    created_at: nowIso,
    updated_at: nowIso,
  }

  const { data, error } = await opsTable('csr_project_materials').insert(row).select('*').single()
  if (error) {
    return { ok: false, status: 500, error: getErrorMessage(error) || 'Failed to submit material record' }
  }

  return { ok: true, material: data as Record<string, unknown> }
}

export async function reviewProjectMaterial(input: {
  project: CsrProjectRow
  actor: Extract<ProjectOpsActor, { role: 'company_ca' | 'admin' }>
  materialId: string
  action: 'acknowledge' | 'flag_discrepancy'
  reason?: string | null
  discrepancy_flags?: unknown
}): Promise<{ ok: true; material: Record<string, unknown> } | { ok: false; status: number; error: string }> {
  if (!/^[0-9a-f-]{36}$/i.test(input.materialId)) {
    return { ok: false, status: 400, error: 'Invalid material id' }
  }

  const { data: existing, error: loadError } = await opsTable('csr_project_materials')
    .select('*')
    .eq('id', input.materialId)
    .eq('project_id', input.project.id)
    .maybeSingle()

  if (loadError) {
    return { ok: false, status: 500, error: getErrorMessage(loadError) || 'Failed to load material' }
  }
  if (!existing) {
    return { ok: false, status: 404, error: 'Material record not found' }
  }

  const current = existing as Record<string, unknown>
  const reason = String(input.reason || '').trim()
  if (input.action === 'flag_discrepancy' && !reason) {
    return { ok: false, status: 400, error: 'A reason is required when flagging a discrepancy' }
  }

  const flags = Array.isArray(input.discrepancy_flags)
    ? input.discrepancy_flags.map(String).filter(Boolean)
    : []

  const nowIso = new Date().toISOString()
  const nextStatus = input.action === 'acknowledge' ? 'reviewed' : 'discrepancy_flagged'
  const meta = {
    ...parseJsonObject(current.metadata),
    submission_status: nextStatus,
    review_action: input.action,
    review_reason: reason || null,
    discrepancy_flags: flags,
    reviewed_by_user_id: input.actor.userId,
    reviewed_by_ca_identity_id:
      input.actor.role === 'company_ca' ? input.actor.companyCAIdentityId : null,
    reviewed_at: nowIso,
  }

  const { data: updated, error: updateError } = await opsTable('csr_project_materials')
    .update({
      metadata: meta as Json,
      updated_at: nowIso,
    })
    .eq('id', input.materialId)
    .eq('project_id', input.project.id)
    .select('*')
    .maybeSingle()

  if (updateError) {
    return { ok: false, status: 500, error: getErrorMessage(updateError) || 'Failed to update material' }
  }
  if (!updated) {
    return { ok: false, status: 409, error: 'Material could not be updated' }
  }

  const actionType =
    input.action === 'acknowledge' ? 'material_reviewed' : 'material_discrepancy_flagged'

  if (input.actor.role === 'company_ca') {
    await supabase.from('company_ca_action_log').insert({
      company_ca_identity_id: input.actor.companyCAIdentityId,
      project_id: input.project.id,
      action_type: actionType,
      payload: {
        material_id: input.materialId,
        action: input.action,
        reason: reason || null,
        discrepancy_flags: flags,
        name: current.name,
      } as Json,
    })
  }

  await supabase.from('csr_audit_log').insert({
    entity_type: 'csr_project_material',
    entity_id: String(input.materialId),
    event_type: actionType,
    event_hash: `${actionType}:${input.materialId}:${nowIso}`,
    event_payload: {
      project_id: input.project.id,
      material_id: input.materialId,
      action: input.action,
      reason: reason || null,
      discrepancy_flags: flags,
      actor_user_id: input.actor.userId,
      actor_role: input.actor.role,
    },
    created_by: input.actor.userId,
  })

  return { ok: true, material: updated as Record<string, unknown> }
}
