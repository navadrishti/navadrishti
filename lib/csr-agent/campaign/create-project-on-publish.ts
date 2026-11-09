import { supabase } from '@/lib/db'
import { parseJsonObject, getErrorMessage } from '@/lib/utils'
import { toUserFacingError } from '@/lib/user-facing-error'
import type { Json, Tables, TablesInsert } from '@/lib/database.types'

export type CampaignMilestoneDraft = {
  title?: unknown
  description?: unknown
  budget_allocated?: unknown
  amount?: unknown
  deliverables?: unknown
  evidence_requirements?: unknown
  end_date?: unknown
  due_date?: unknown
  start_date?: unknown
  duration_weeks?: unknown
}

export type PublishCampaignWithProjectInput = {
  campaignId: string
  companyUserId: number
  actorUserId: number
  leadNgoUserId: number
  title: string
  description?: string | null
  category: string
  location: string
  budgetInr?: number | null
  budgetBreakdown?: Json
  scheduleVii?: string | null
  sdgAlignment?: number[] | null
  impactMetrics: Json
  milestones?: unknown
  startDate?: string | null
  endDate: string
  region?: string | null
  totalBudget?: number | null
  expectedBeneficiaries?: number | null
  publishedAt: string
  campaignUrl?: string | null
}

export type PublishCampaignRpcResult = {
  ok: boolean
  error_code?: string
  error?: string
  outcome?: string
  project_id?: string
  created?: boolean
  repaired?: boolean
  milestones_created?: number
  campaign_id?: string
  campaign_status?: string
}

export type EnsureCsrProjectResult = {
  project: Pick<Tables<'csr_projects'>, 'id'> & Partial<Tables<'csr_projects'>>
  created: boolean
  milestonesCreated: number
  repaired: boolean
  outcome: string
  campaignId: string
}

export class PublishCampaignError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number,
    readonly auditFailure?: boolean
  ) {
    super(message)
    this.name = 'PublishCampaignError'
  }
}

function asFiniteNumber(value: unknown): number | null {
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

function asOptionalDate(value: unknown): string | null {
  const raw = String(value ?? '').trim()
  if (!raw) return null
  const date = new Date(raw)
  return Number.isNaN(date.getTime()) ? null : raw.slice(0, 10)
}

/** Map campaign JSONB milestones into csr_project_milestones insert rows. */
export function mapCampaignMilestonesToRows(
  campaignId: string,
  projectId: string,
  milestones: unknown
): TablesInsert<'csr_project_milestones'>[] {
  if (!Array.isArray(milestones)) return []

  return milestones.map((entry, index) => {
    const milestone = parseJsonObject(entry) as CampaignMilestoneDraft
    const amount =
      asFiniteNumber(milestone.budget_allocated) ??
      asFiniteNumber(milestone.amount) ??
      0
    const title = String(milestone.title || '').trim() || `Milestone ${index + 1}`
    const description = String(milestone.description || '').trim() || null
    const dueDate = asOptionalDate(milestone.due_date) || asOptionalDate(milestone.end_date)
    const evidenceRequirements = Array.isArray(milestone.evidence_requirements)
      ? milestone.evidence_requirements
      : Array.isArray(milestone.deliverables)
        ? milestone.deliverables
        : []

    return {
      project_id: projectId,
      campaign_id: campaignId,
      title,
      description,
      milestone_order: index + 1,
      amount,
      evidence_requirements: evidenceRequirements,
      due_date: dueDate,
      company_approval_required: true,
      status: 'pending',
    }
  })
}

function httpStatusForPublishCode(code: string | undefined): number {
  switch (code) {
    case 'not_found':
    case 'forbidden':
      return 404
    case 'invalid_state':
    case 'lead_ngo_required':
    case 'lead_ngo_not_accepted':
    case 'lead_ngo_mismatch':
    case 'milestone_conflict':
    case 'evidence_verifier_required':
    case 'evidence_verifier_invalid':
    case 'evidence_verifier_inactive':
    case 'evidence_verifier_cross_company':
    case 'evidence_verifier_permission':
    case 'evidence_verifier_assignment_conflict':
    case 'project_scope_conflict':
    case 'project_ineligible':
      return 409
    case 'invalid_argument':
    case 'invalid_milestones':
    case 'invalid_milestone_amount':
    case 'invalid_milestone_date':
      return 400
    case 'audit_failed':
      return 500
    default:
      return 500
  }
}

function rawErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  if (error && typeof error === 'object' && 'message' in error && typeof (error as { message: unknown }).message === 'string') {
    return (error as { message: string }).message
  }
  return ''
}

function parsePublishRpcError(error: unknown): PublishCampaignError {
  // Prefer the unmangled PostgREST/Postgres message so PUBLISH_ERROR codes stay parseable.
  // getErrorMessage() humanizes early and previously turned "column v_m_milestone does not exist"
  // into the opaque "Please check the v m milestone."
  const raw = rawErrorMessage(error) || getErrorMessage(error) || 'Failed to publish campaign atomically'
  const match = raw.match(/PUBLISH_ERROR:([a-z0-9_]+):([\s\S]*?)(?:\n|$)/i)
  if (match) {
    const code = match[1]
    const detail = match[2]?.trim() || raw
    return new PublishCampaignError(detail, code, httpStatusForPublishCode(code))
  }
  return new PublishCampaignError(
    toUserFacingError(raw) || 'Failed to publish campaign atomically',
    'rpc_error',
    500
  )
}

function isUniqueViolation(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && (error as { code?: string }).code === '23505')
}

/**
 * Record a failed publish attempt outside the publish transaction.
 * Uses deterministic event_hash per (campaign, error_code). Concurrency-safe when
 * the partial unique index csr_audit_log_publish_event_hash_uidx is applied:
 * insert-first, treat 23505 as "already recorded" (refresh payload via update).
 * Throws PublishCampaignError(auditFailure=true) when the audit write itself fails.
 */
export async function recordPublishFailureAudit(input: {
  campaignId: string
  actorUserId: number
  errorCode: string
  errorMessage: string
  details?: Record<string, unknown>
}): Promise<void> {
  const eventHash = `campaign_publish_failed:${input.campaignId}:${input.errorCode}`
  const payload = {
    error_code: input.errorCode,
    error: input.errorMessage,
    failed_at: new Date().toISOString(),
    ...(input.details || {}),
  }

  const { error: insertError } = await supabase.from('csr_audit_log').insert({
    entity_type: 'campaign',
    entity_id: input.campaignId,
    event_type: 'campaign_publish_failed',
    event_hash: eventHash,
    event_payload: payload,
    created_by: input.actorUserId,
  })

  if (!insertError) return

  if (isUniqueViolation(insertError)) {
    const { data: existing, error: lookupError } = await supabase
      .from('csr_audit_log')
      .select('id')
      .eq('event_hash', eventHash)
      .eq('event_type', 'campaign_publish_failed')
      .limit(1)
      .maybeSingle()

    if (lookupError || !existing) {
      throw new PublishCampaignError(
        `Publish failed and audit uniqueness conflict could not be resolved: ${getErrorMessage(lookupError || insertError)}`,
        'audit_failed',
        500,
        true
      )
    }

    const { error: updateError } = await supabase
      .from('csr_audit_log')
      .update({
        event_payload: {
          ...payload,
          last_failed_at: new Date().toISOString(),
        },
        created_by: input.actorUserId,
      })
      .eq('id', existing.id)

    if (updateError) {
      throw new PublishCampaignError(
        `Publish failed and audit update also failed: ${getErrorMessage(updateError)}`,
        'audit_failed',
        500,
        true
      )
    }
    return
  }

  throw new PublishCampaignError(
    `Publish failed and audit insert also failed: ${getErrorMessage(insertError)}`,
    'audit_failed',
    500,
    true
  )
}

/**
 * Publish a draft campaign or ensure/repair an active one inside one Postgres
 * transaction (Supabase RPC → publish_campaign_with_project).
 */
export async function publishCampaignWithProject(
  input: PublishCampaignWithProjectInput
): Promise<EnsureCsrProjectResult> {
  if (!Number.isFinite(input.leadNgoUserId) || input.leadNgoUserId <= 0) {
    throw new PublishCampaignError(
      'A lead NGO is required to create the CSR project',
      'invalid_argument',
      400
    )
  }
  if (!Number.isFinite(input.companyUserId) || input.companyUserId <= 0) {
    throw new PublishCampaignError(
      'A company owner is required to create the CSR project',
      'invalid_argument',
      400
    )
  }

  const { data, error } = await supabase.rpc('publish_campaign_with_project', {
    p_campaign_id: input.campaignId,
    p_company_user_id: input.companyUserId,
    p_actor_user_id: input.actorUserId,
    p_title: String(input.title || '').trim() || 'CSR Project',
    p_description: input.description ?? null,
    p_category: input.category,
    p_location: input.location,
    p_budget_inr: input.budgetInr ?? null,
    p_budget_breakdown: (input.budgetBreakdown ?? {}) as Json,
    p_schedule_vii: input.scheduleVii ?? null,
    p_sdg_alignment: input.sdgAlignment ?? [],
    p_lead_ngo_user_id: input.leadNgoUserId,
    p_impact_metrics: input.impactMetrics,
    p_milestones: (Array.isArray(input.milestones) ? input.milestones : []) as Json,
    p_start_date: input.startDate ?? null,
    p_end_date: input.endDate,
    p_region: input.region ?? null,
    p_total_budget: input.totalBudget ?? null,
    p_expected_beneficiaries: input.expectedBeneficiaries ?? null,
    p_published_at: input.publishedAt,
    p_campaign_url: input.campaignUrl ?? null,
  })

  if (error) {
    throw parsePublishRpcError(error)
  }

  const result = (data || {}) as PublishCampaignRpcResult
  if (!result.ok) {
    throw new PublishCampaignError(
      result.error || 'Failed to publish campaign',
      result.error_code || 'publish_failed',
      httpStatusForPublishCode(result.error_code)
    )
  }

  if (!result.project_id) {
    throw new PublishCampaignError(
      'Publish RPC succeeded without a project_id',
      'rpc_incomplete',
      500
    )
  }

  return {
    project: { id: result.project_id },
    created: Boolean(result.created),
    milestonesCreated: Number(result.milestones_created || 0),
    repaired: Boolean(result.repaired),
    outcome: String(result.outcome || 'published'),
    campaignId: String(result.campaign_id || input.campaignId),
  }
}
