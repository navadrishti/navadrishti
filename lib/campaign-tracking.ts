import { supabase } from '@/lib/db'
import {
  filterVolunteerApplicationsExcludingLeadNgo,
  getElapsedCampaignDays,
  getInclusiveDayCount,
  isCampaignVolunteerAssignment,
} from '@/lib/campaign-volunteer-attendance'
import { parseCsrCapabilityRentals, type CsrCapabilityRentalStatus } from '@/lib/service-engagement'
import { parseJsonObject } from '@/lib/utils'

export type CampaignLifecycle =
  | 'draft'
  | 'awaiting_lead'
  | 'upcoming'
  | 'running'
  | 'ended'
  | 'completed'
  | 'cancelled'

export type CampaignTracking = {
  campaign_id: string
  lifecycle: CampaignLifecycle
  days_total: number
  days_elapsed: number
  lead_ngo: { id: number; name: string; accepted: boolean } | null
  volunteers: {
    required: number
    enrolled: number
    people_committed: number
    checked_in: number
    person_days: number
    last_attendance_at: string | null
  }
  milestones: {
    total: number
    submitted: number
    approved: number
    paid: number
    next: { title: string; status: string; due_date: string | null } | null
  }
  budget: {
    budget_inr: number
    milestone_value_inr: number
    paid_inr: number
  }
  rentals: {
    total: number
    awaiting_payment: number
    in_transit: number
    on_site: number
    returning: number
    closed: number
    refunded: number
  }
}

type CampaignRow = {
  id: string
  status?: string | null
  start_date?: string | null
  end_date?: string | null
  budget_inr?: number | string | null
  impact_metrics?: unknown
  lead_ngo_user_id?: number | null
}

const RENTAL_STAGE: Record<CsrCapabilityRentalStatus, keyof Omit<CampaignTracking['rentals'], 'total'>> = {
  pending_payment: 'awaiting_payment',
  paid: 'in_transit',
  attached: 'in_transit',
  outbound_dispatched: 'in_transit',
  outbound_delivered: 'on_site',
  project_active: 'on_site',
  return_pending: 'returning',
  return_delivered: 'closed',
  completed: 'closed',
  refunded: 'refunded',
}

function todayIso(reference: Date) {
  return reference.toISOString().slice(0, 10)
}

export function resolveCampaignLifecycle(campaign: CampaignRow, reference: Date = new Date()): CampaignLifecycle {
  const status = String(campaign.status || '').toLowerCase()
  if (status === 'cancelled') return 'cancelled'
  if (status === 'completed' || status === 'closed') return 'completed'
  if (status === 'draft') {
    return parseJsonObject(campaign.impact_metrics).lead_ngo_accepted ? 'draft' : 'awaiting_lead'
  }
  const today = todayIso(reference)
  const start = campaign.start_date ? String(campaign.start_date).slice(0, 10) : null
  const end = campaign.end_date ? String(campaign.end_date).slice(0, 10) : null
  if (start && start > today) return 'upcoming'
  if (end && end < today) return 'ended'
  return 'running'
}

function emptyRentals(): CampaignTracking['rentals'] {
  return { total: 0, awaiting_payment: 0, in_transit: 0, on_site: 0, returning: 0, closed: 0, refunded: 0 }
}

function groupBy<T>(rows: T[], key: (row: T) => string) {
  const map = new Map<string, T[]>()
  for (const row of rows) {
    const id = key(row)
    const list = map.get(id) || []
    list.push(row)
    map.set(id, list)
  }
  return map
}

async function rowsFor<T>(
  ids: unknown[],
  run: () => PromiseLike<{ data: T[] | null; error: unknown }>
): Promise<T[]> {
  if (ids.length === 0) return []
  const { data, error } = await run()
  if (error) throw error
  return data || []
}

/** Progress for each campaign, built with one query per table rather than per campaign. */
export async function buildCampaignTracking(
  campaigns: CampaignRow[],
  reference: Date = new Date()
): Promise<Map<string, CampaignTracking>> {
  const campaignIds = campaigns.map((campaign) => String(campaign.id))
  const leadIds = [...new Set(campaigns.map((c) => Number(c.lead_ngo_user_id || 0)).filter((id) => id > 0))]

  const [projects, milestones, assignments, leads] = await Promise.all([
    rowsFor(campaignIds, () => supabase.from('csr_projects').select('id, campaign_id').in('campaign_id', campaignIds)),
    rowsFor(campaignIds, () =>
      supabase
        .from('csr_project_milestones')
        .select('campaign_id, title, status, amount, due_date, milestone_order')
        .in('campaign_id', campaignIds)
    ),
    rowsFor(campaignIds, () =>
      supabase.from('service_engagement_assignments').select('id, target_id, target_type, meta').in('target_id', campaignIds)
    ),
    rowsFor(leadIds, () => supabase.from('users').select('id, name').in('id', leadIds)),
  ])

  const projectCampaign = new Map(projects.map((project) => [String(project.id), String(project.campaign_id)]))
  const volunteerAssignments = assignments.filter((row) => isCampaignVolunteerAssignment(row))
  const assignmentCampaign = new Map(volunteerAssignments.map((row) => [String(row.id), String(row.target_id)]))

  const projectIds = [...projectCampaign.keys()]
  const assignmentIds = [...assignmentCampaign.keys()]
  const [confirmations, entries] = await Promise.all([
    rowsFor(projectIds, () =>
      supabase
        .from('csr_payment_confirmations')
        .select('project_id, amount')
        .in('project_id', projectIds)
        .eq('payment_status', 'confirmed')
    ),
    rowsFor(assignmentIds, () =>
      supabase
        .from('service_attendance_entries')
        .select('assignment_id, attendance_date, units')
        .in('assignment_id', assignmentIds)
        .eq('attendance_status', 'present')
    ),
  ])

  const milestonesByCampaign = groupBy(milestones, (row) => String(row.campaign_id))
  const paidByCampaign = new Map<string, number>()
  for (const row of confirmations) {
    const campaignId = projectCampaign.get(String(row.project_id))
    if (!campaignId) continue
    paidByCampaign.set(campaignId, (paidByCampaign.get(campaignId) || 0) + (Number(row.amount) || 0))
  }
  const entriesByCampaign = groupBy(
    entries.filter((entry) => assignmentCampaign.has(String(entry.assignment_id))),
    (entry) => assignmentCampaign.get(String(entry.assignment_id)) as string
  )
  const leadNames = new Map(leads.map((row) => [Number(row.id), String(row.name || 'Lead NGO')]))

  const result = new Map<string, CampaignTracking>()
  for (const campaign of campaigns) {
    const id = String(campaign.id)
    const impact = parseJsonObject(campaign.impact_metrics)
    const applications = filterVolunteerApplicationsExcludingLeadNgo(campaign)
    const campaignEntries = entriesByCampaign.get(id) || []
    const checkedIn = new Set(campaignEntries.map((entry) => String(entry.assignment_id)))
    const lastAttendance = campaignEntries.map((entry) => String(entry.attendance_date)).sort().at(-1) || null

    const campaignMilestones = (milestonesByCampaign.get(id) || []).sort(
      (a, b) => Number(a.milestone_order) - Number(b.milestone_order)
    )
    const countStatus = (...statuses: string[]) =>
      campaignMilestones.filter((m) => statuses.includes(String(m.status || '').toLowerCase())).length
    const next = campaignMilestones.find((m) => String(m.status || '').toLowerCase() !== 'completed') || null

    const rentals = emptyRentals()
    for (const rental of parseCsrCapabilityRentals(campaign.impact_metrics)) {
      rentals.total += 1
      const stage = RENTAL_STAGE[rental.status] || 'awaiting_payment'
      rentals[stage] += 1
    }

    const leadId = Number(campaign.lead_ngo_user_id || 0)
    result.set(id, {
      campaign_id: id,
      lifecycle: resolveCampaignLifecycle(campaign, reference),
      days_total: getInclusiveDayCount(campaign.start_date, campaign.end_date),
      days_elapsed: getElapsedCampaignDays(campaign.start_date, campaign.end_date, reference),
      lead_ngo: leadId > 0
        ? { id: leadId, name: leadNames.get(leadId) || 'Lead NGO', accepted: Boolean(impact.lead_ngo_accepted) }
        : null,
      volunteers: {
        required: Number(impact.volunteer_requirement ?? impact.volunteer_limit ?? 0) || 0,
        enrolled: applications.length,
        people_committed: applications.reduce((sum, app) => sum + Math.max(1, Number(app?.capacity || 1) || 1), 0),
        checked_in: checkedIn.size,
        person_days: campaignEntries.reduce((sum, entry) => sum + Math.max(1, Number(entry.units) || 1), 0),
        last_attendance_at: lastAttendance,
      },
      milestones: {
        total: campaignMilestones.length,
        submitted: countStatus('submitted', 'under_review'),
        approved: countStatus('approved'),
        paid: countStatus('completed'),
        next: next ? { title: next.title, status: String(next.status || 'pending'), due_date: next.due_date } : null,
      },
      budget: {
        budget_inr: Number(campaign.budget_inr || 0) || 0,
        milestone_value_inr: campaignMilestones.reduce((sum, m) => sum + (Number(m.amount) || 0), 0),
        paid_inr: Math.round((paidByCampaign.get(id) || 0) * 100) / 100,
      },
      rentals,
    })
  }
  return result
}
