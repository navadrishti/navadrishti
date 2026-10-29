import {
  getCampaignAttendanceDate,
  getElapsedCampaignDays,
  getInclusiveDayCount,
  listElapsedCampaignDates,
  listInclusiveCampaignDates,
} from '@/lib/campaign-days'
import { supabase } from '@/lib/db/client'
import {
  filterVolunteerApplicationsExcludingLeadNgo,
  filterVolunteerAssignmentsExcludingLeadNgo,
  isCampaignVolunteerAssignment,
} from '@/lib/campaign-volunteer-attendance'
import {
  parseCsrCapabilityRentals,
  type CsrCapabilityRentalRecord,
  type CsrCapabilityRentalStatus,
} from '@/lib/service-engagement'
import { parseJsonObject } from '@/lib/utils'
import {
  type CampaignAttendanceMark,
  type CampaignCapabilityAttendanceRow,
  type CampaignDailyHeadcount,
  type CampaignEvidenceReview,
  type CampaignFieldAttendance,
  type CampaignLifecycle,
  type CampaignMilestoneTrailRow,
  type CampaignTracking,
  type CampaignVolunteerAttendanceRow,
} from '@/lib/campaign-tracking-types'

export type {
  CampaignAttendanceMark,
  CampaignCapabilityAttendanceRow,
  CampaignDailyHeadcount,
  CampaignEvidenceReview,
  CampaignEvidenceTrailRow,
  CampaignFieldAttendance,
  CampaignLifecycle,
  CampaignMilestoneTrailRow,
  CampaignTracking,
  CampaignVolunteerAttendanceRow,
} from '@/lib/campaign-tracking-types'
export { campaignShowsFieldAttendance } from '@/lib/campaign-tracking-types'

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

const ON_SITE_RENTAL_STATUSES = new Set<CsrCapabilityRentalStatus>(['outbound_delivered', 'project_active'])

type AssignmentRow = {
  id?: string | null
  target_id?: string | number | null
  target_type?: string | null
  meta?: unknown
  assignee_user_id?: number | null
  owner_user_id?: number | null
}

type AttendanceEntryRow = {
  assignment_id?: string | null
  attendance_date?: string | null
  units?: number | string | null
}

function isNgoUserType(userType: string): boolean {
  return String(userType || '').toLowerCase() === 'ngo'
}

function rentalFlowAssignment(row: AssignmentRow): boolean {
  return parseJsonObject(row.meta).flow === 'csr_capability_rental'
}

function dailyHeadcounts(
  dates: string[],
  elapsedDates: string[],
  expected: number,
  presentOn: (date: string) => number
): CampaignDailyHeadcount[] {
  const elapsed = new Set(elapsedDates)
  return dates.map((date) => {
    const due = elapsed.has(date)
    return {
      date,
      present_people: due ? presentOn(date) : 0,
      expected_people: expected,
      due,
    }
  })
}

function uniqueIds(values: Array<string | number | null | undefined>): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const value of values) {
    const id = String(value ?? '').trim()
    if (!id || id === '0' || id === 'null' || id === 'undefined') continue
    if (seen.has(id)) continue
    seen.add(id)
    out.push(id)
  }
  return out
}

function uniquePositiveInts(values: Array<string | number | null | undefined>): number[] {
  return uniqueIds(values)
    .map(Number)
    .filter((id) => Number.isInteger(id) && id > 0)
}

function isoDate(value: unknown): string {
  return String(value || '').slice(0, 10)
}

function markForDate(presentDates: Set<string>, date: string, elapsedDates: string[]): CampaignAttendanceMark {
  if (!date || !elapsedDates.includes(date)) return 'not_due'
  return presentDates.has(date) ? 'present' : 'absent'
}

function presentDatesFromEntries(entries: AttendanceEntryRow[]): Set<string> {
  return new Set(entries.map((entry) => isoDate(entry.attendance_date)).filter(Boolean))
}

function unitsOnDate(entries: AttendanceEntryRow[], date: string, fallback: number): number {
  return entries
    .filter((entry) => isoDate(entry.attendance_date) === date)
    .reduce((sum, entry) => sum + Math.max(1, Number(entry.units) || fallback), 0)
}

function capabilityCampaignId(row: AssignmentRow): string {
  const meta = parseJsonObject(row.meta)
  if (meta.campaign_id) return String(meta.campaign_id)
  if (row.target_type === 'csr_project' || row.target_type === 'campaign') return String(row.target_id || '')
  return ''
}

function capabilityOfferId(row: AssignmentRow): number {
  const meta = parseJsonObject(row.meta)
  const fromMeta = Number(meta.service_offer_id || 0)
  if (fromMeta > 0) return fromMeta
  if (row.target_type === 'service_offer') return Number(row.target_id || 0) || 0
  return 0
}

function isTrackableRental(rental: CsrCapabilityRentalRecord): boolean {
  return rental.payment_status === 'paid' && rental.status !== 'refunded'
}

export function resolveCampaignLifecycle(campaign: CampaignRow, reference: Date = new Date()): CampaignLifecycle {
  const status = String(campaign.status || '').toLowerCase()
  if (status === 'cancelled') return 'cancelled'
  if (status === 'completed' || status === 'closed') return 'completed'
  if (status === 'draft') {
    return parseJsonObject(campaign.impact_metrics).lead_ngo_accepted ? 'draft' : 'awaiting_lead'
  }
  const today = getCampaignAttendanceDate(reference)
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

function presentPeopleOnDate(
  rows: CampaignVolunteerAttendanceRow[],
  assignmentByUser: Map<number, AssignmentRow>,
  entriesByAssignment: Map<string, AttendanceEntryRow[]>,
  date: string
): number {
  return rows.reduce((sum, row) => {
    const assignment = assignmentByUser.get(row.user_id)
    const entries = assignment ? entriesByAssignment.get(String(assignment.id)) || [] : []
    if (!presentDatesFromEntries(entries).has(date)) return sum
    const marked = unitsOnDate(entries, date, row.capacity)
    return sum + (marked > 0 ? marked : row.capacity)
  }, 0)
}

function buildFieldAttendance(input: {
  campaign: CampaignRow
  applications: ReturnType<typeof filterVolunteerApplicationsExcludingLeadNgo>
  volunteerAssignments: AssignmentRow[]
  capabilityAssignments: AssignmentRow[]
  rentals: CsrCapabilityRentalRecord[]
  entriesByAssignment: Map<string, AttendanceEntryRow[]>
  names: Map<number, string>
  userTypes: Map<number, string>
  offerTitles: Map<number, { title: string; offer_type: string }>
  reference: Date
}): CampaignFieldAttendance {
  const today = getCampaignAttendanceDate(input.reference)
  const end = input.campaign.end_date ? String(input.campaign.end_date).slice(0, 10) : null
  const asOf = end && end < today ? end : today
  const campaignDates = listInclusiveCampaignDates(input.campaign.start_date, input.campaign.end_date)
  const elapsedDates = listElapsedCampaignDates(input.campaign.start_date, input.campaign.end_date, input.reference)

  const assignmentByUser = new Map<number, AssignmentRow>()
  for (const row of input.volunteerAssignments) {
    const userId = Number(row.assignee_user_id || 0)
    if (userId > 0) assignmentByUser.set(userId, row)
  }

  const roster = new Map<number, { name: string; user_type: string; capacity: number }>()
  for (const app of input.applications) {
    const userId = Number(app?.user_id || 0)
    if (!(userId > 0)) continue
    roster.set(userId, {
      name: String(app?.name || input.names.get(userId) || `Volunteer ${userId}`),
      user_type: String(app?.user_type || input.userTypes.get(userId) || 'individual'),
      capacity: Math.max(1, Number(app?.capacity || 1) || 1),
    })
  }
  for (const row of input.volunteerAssignments) {
    const userId = Number(row.assignee_user_id || 0)
    if (!(userId > 0) || roster.has(userId)) continue
    const meta = parseJsonObject(row.meta)
    roster.set(userId, {
      name: input.names.get(userId) || `Volunteer ${userId}`,
      user_type: String(meta.volunteer_user_type || input.userTypes.get(userId) || 'individual'),
      capacity: Math.max(1, Number(meta.volunteer_capacity || 1) || 1),
    })
  }

  const volunteers: CampaignVolunteerAttendanceRow[] = [...roster.entries()].map(([userId, person]) => {
    const assignment = assignmentByUser.get(userId)
    const entries = assignment ? input.entriesByAssignment.get(String(assignment.id)) || [] : []
    const presentDates = presentDatesFromEntries(entries)
    const daysPresent = presentDates.size
    return {
      user_id: userId,
      name: person.name,
      user_type: person.user_type,
      capacity: person.capacity,
      today: markForDate(presentDates, asOf, elapsedDates),
      days_present: daysPresent,
      days_absent: Math.max(0, elapsedDates.length - daysPresent),
      person_days: entries.reduce((sum, entry) => sum + Math.max(1, Number(entry.units) || person.capacity), 0),
      last_attendance_at: [...presentDates].sort().at(-1) || null,
    }
  })

  const expectedVolunteers = volunteers.reduce((sum, row) => sum + row.capacity, 0)
  const presentVolunteersToday = volunteers.reduce((sum, row) => {
    if (row.today !== 'present') return sum
    const assignment = assignmentByUser.get(row.user_id)
    const entries = assignment ? input.entriesByAssignment.get(String(assignment.id)) || [] : []
    const marked = unitsOnDate(entries, asOf, row.capacity)
    return sum + (marked > 0 ? marked : row.capacity)
  }, 0)

  const individualVolunteers = volunteers.filter((row) => !isNgoUserType(row.user_type))
  const ngoVolunteers = volunteers.filter((row) => isNgoUserType(row.user_type))
  const volunteerDays = dailyHeadcounts(
    campaignDates,
    elapsedDates,
    individualVolunteers.reduce((sum, row) => sum + row.capacity, 0),
    (date) => presentPeopleOnDate(individualVolunteers, assignmentByUser, input.entriesByAssignment, date)
  )
  const ngoDays = dailyHeadcounts(
    campaignDates,
    elapsedDates,
    ngoVolunteers.reduce((sum, row) => sum + row.capacity, 0),
    (date) => presentPeopleOnDate(ngoVolunteers, assignmentByUser, input.entriesByAssignment, date)
  )

  const assignmentByRental = new Map<string, AssignmentRow>()
  for (const row of input.capabilityAssignments) {
    assignmentByRental.set(String(row.id), row)
  }
  const assignmentByOffer = new Map<number, AssignmentRow>()
  for (const row of input.capabilityAssignments) {
    const offerId = capabilityOfferId(row)
    if (offerId > 0) assignmentByOffer.set(offerId, row)
  }

  const capabilityPresentById = new Map<string, Set<string>>()
  const capabilities: CampaignCapabilityAttendanceRow[] = input.rentals.map((rental) => {
    const assignment =
      (rental.assignment_id ? assignmentByRental.get(String(rental.assignment_id)) : undefined) ||
      assignmentByOffer.get(Number(rental.service_offer_id) || 0) ||
      null
    const entries = assignment ? input.entriesByAssignment.get(String(assignment.id)) || [] : []
    const presentDates = presentDatesFromEntries(entries)
    capabilityPresentById.set(rental.id, presentDates)
    const daysPresent = presentDates.size
    const offer = input.offerTitles.get(Number(rental.service_offer_id) || 0)
    const trackable = isTrackableRental(rental)
    const returned =
      Boolean(rental.return_delivered_at) ||
      rental.status === 'return_delivered' ||
      rental.status === 'completed'
    return {
      id: rental.id,
      title: offer?.title || `Capability ${rental.service_offer_id}`,
      offer_type: offer?.offer_type || String(rental.offer_type || ''),
      status: rental.status,
      today: trackable ? markForDate(presentDates, asOf, elapsedDates) : 'not_due',
      days_present: daysPresent,
      days_absent: trackable ? Math.max(0, elapsedDates.length - daysPresent) : 0,
      last_attendance_at: [...presentDates].sort().at(-1) || null,
      on_site: ON_SITE_RENTAL_STATUSES.has(rental.status),
      outbound_delivered_at: rental.outbound_delivered_at || null,
      project_completed_at: rental.project_completed_at || null,
      return_dispatched_at: rental.return_dispatched_at || rental.return_delivery?.booked_at || null,
      return_delivered_at: rental.return_delivered_at || null,
      returned_to_owner: returned,
      return_tracking_id: rental.return_delivery?.tracking_id || null,
    }
  })

  const trackableRentals = input.rentals.filter(isTrackableRental)
  const capabilityDays = dailyHeadcounts(campaignDates, elapsedDates, trackableRentals.length, (date) =>
    trackableRentals.filter((rental) => capabilityPresentById.get(rental.id)?.has(date)).length
  )

  return {
    as_of: asOf,
    expected_volunteers: expectedVolunteers,
    present_volunteers_today: presentVolunteersToday,
    expected_capabilities: trackableRentals.length,
    present_capabilities_today: capabilities.filter((row) => row.today === 'present').length,
    volunteer_days: volunteerDays,
    ngo_days: ngoDays,
    capability_days: capabilityDays,
    volunteers,
    capabilities,
  }
}

type MilestoneRow = {
  id?: string | null
  campaign_id?: string | null
  title?: string | null
  status?: string | null
  amount?: number | string | null
  due_date?: string | null
  milestone_order?: number | null
}

type EvidenceRow = {
  id?: string | null
  milestone_id?: string | null
  submission_status?: string | null
  uploaded_at?: string | null
  captured_at?: string | null
  created_at?: string | null
}

type ReviewRow = {
  milestone_id?: string | null
  evidence_id?: string | null
  reviewer_id?: number | null
  reviewer_platform_ca_id?: number | null
  decision?: string | null
  reviewed_at?: string | null
  created_at?: string | null
}

type ActionLogRow = {
  milestone_id?: string | null
  evidence_id?: string | null
  company_ca_identity_id?: string | null
  action_type?: string | null
  created_at?: string | null
  payload?: unknown
}

type PaymentRow = {
  project_id?: string | null
  milestone_id?: string | null
  amount?: number | string | null
  payment_status?: string | null
  confirmed_at?: string | null
}

function latestBy<T>(rows: T[], timeOf: (row: T) => string): T | null {
  return rows.slice().sort((a, b) => timeOf(b).localeCompare(timeOf(a)))[0] || null
}

function buildMilestoneTrail(input: {
  milestones: MilestoneRow[]
  evidenceByMilestone: Map<string, EvidenceRow[]>
  reviewsByMilestone: Map<string, ReviewRow[]>
  actionsByMilestone: Map<string, ActionLogRow[]>
  paymentsByMilestone: Map<string, PaymentRow[]>
  names: Map<number, string>
  caByUserId: Map<number, { ca_id: string; name: string | null }>
  caByIdentityId: Map<string, { ca_id: string; user_id: number; name: string | null }>
  platformCaById: Map<number, { ca_id: string; name: string }>
}): CampaignMilestoneTrailRow[] {
  return input.milestones.map((milestone) => {
    const milestoneId = String(milestone.id || '')
    const evidenceRows = input.evidenceByMilestone.get(milestoneId) || []
    const reviews = input.reviewsByMilestone.get(milestoneId) || []
    const actions = input.actionsByMilestone.get(milestoneId) || []
    const payments = input.paymentsByMilestone.get(milestoneId) || []
    const paid = payments[0] || null

    const evidence = evidenceRows.map((row) => {
      const evidenceId = String(row.id || '')
      const matchedReview =
        latestBy(
          reviews.filter((review) => String(review.evidence_id || '') === evidenceId),
          (review) => String(review.reviewed_at || review.created_at || '')
        ) ||
        (reviews.some((review) => review.evidence_id) ? null : latestBy(reviews, (review) => String(review.reviewed_at || review.created_at || '')))
      const action = latestBy(
        actions.filter((entry) => {
          const payload = parseJsonObject(entry.payload)
          const actionEvidenceId = String(payload.evidence_id || '')
          return !actionEvidenceId || actionEvidenceId === evidenceId
        }),
        (entry) => String(entry.created_at || '')
      )
      let review: CampaignEvidenceReview | null = null
      if (matchedReview) {
        const platformCaId = Number(matchedReview.reviewer_platform_ca_id || 0)
        const reviewerUserId = Number(matchedReview.reviewer_id || 0)
        const identity = action?.company_ca_identity_id
          ? input.caByIdentityId.get(String(action.company_ca_identity_id))
          : reviewerUserId > 0
            ? input.caByUserId.get(reviewerUserId)
            : undefined
        const platform = platformCaId > 0 ? input.platformCaById.get(platformCaId) : undefined
        review = {
          decision: String(matchedReview.decision || ''),
          reviewed_at: matchedReview.reviewed_at || matchedReview.created_at || action?.created_at || null,
          reviewer_name:
            platform?.name ||
            identity?.name ||
            (reviewerUserId > 0 ? input.names.get(reviewerUserId) || null : null),
          reviewer_ca_id: platform?.ca_id || identity?.ca_id || null,
          reviewer_kind: platform ? 'platform_ca' : identity ? 'company_ca' : 'unknown',
        }
      }
      return {
        id: evidenceId,
        submitted_at: row.uploaded_at || row.captured_at || row.created_at || null,
        status: String(row.submission_status || 'submitted'),
        review,
      }
    })

    return {
      id: milestoneId || String(milestone.title || 'milestone'),
      title: String(milestone.title || 'Milestone'),
      status: String(milestone.status || 'pending'),
      amount_inr: Number(milestone.amount || 0) || 0,
      due_date: milestone.due_date || null,
      evidence,
      payment_done: Boolean(paid),
      paid_inr: Number(paid?.amount || 0) || 0,
      paid_at: paid?.confirmed_at || null,
    }
  })
}

/** Progress for each campaign, built with one query per table rather than per campaign. */
export async function buildCampaignTracking(
  campaigns: CampaignRow[],
  reference: Date = new Date()
): Promise<Map<string, CampaignTracking>> {
  const campaignIds = campaigns.map((campaign) => String(campaign.id))
  const leadIds = uniquePositiveInts(campaigns.map((campaign) => campaign.lead_ngo_user_id))

  const [projects, milestones, assignments] = await Promise.all([
    rowsFor(campaignIds, () => supabase.from('csr_projects').select('id, campaign_id').in('campaign_id', campaignIds)),
    rowsFor(campaignIds, () =>
      supabase
        .from('csr_project_milestones')
        .select('id, campaign_id, title, status, amount, due_date, milestone_order')
        .in('campaign_id', campaignIds)
    ),
    rowsFor(campaignIds, () =>
      supabase
        .from('service_engagement_assignments')
        .select('id, target_id, target_type, meta, assignee_user_id, owner_user_id')
        .in('target_id', campaignIds)
    ),
  ])

  const assignmentRows = (assignments || []) as AssignmentRow[]
  const projectCampaign = new Map(projects.map((project) => [String(project.id), String(project.campaign_id)]))
  const volunteerAssignments = assignmentRows.filter((row) => isCampaignVolunteerAssignment(row))
  const capabilityAssignments = assignmentRows.filter((row) => rentalFlowAssignment(row))
  const volunteerAssignmentCampaign = new Map(
    volunteerAssignments.map((row) => [String(row.id), String(row.target_id || '')])
  )

  const rentalAssignmentIds = campaigns.flatMap((campaign) =>
    parseCsrCapabilityRentals(campaign.impact_metrics).map((rental) => rental.assignment_id)
  )
  const attendanceAssignmentIds = uniqueIds([
    ...volunteerAssignments.map((row) => row.id),
    ...capabilityAssignments.map((row) => row.id),
    ...rentalAssignmentIds,
  ])
  const applicationUserIds = campaigns.flatMap((campaign) =>
    filterVolunteerApplicationsExcludingLeadNgo(campaign).map((app) => Number(app?.user_id || 0))
  )
  const userIds = uniquePositiveInts([
    ...leadIds,
    ...applicationUserIds,
    ...volunteerAssignments.map((row) => row.assignee_user_id),
    ...capabilityAssignments.map((row) => row.owner_user_id),
  ])
  const offerIds = uniquePositiveInts([
    ...campaigns.flatMap((campaign) =>
      parseCsrCapabilityRentals(campaign.impact_metrics).map((rental) => rental.service_offer_id)
    ),
    ...capabilityAssignments.map((row) => capabilityOfferId(row)),
  ])

  const projectIds = [...projectCampaign.keys()]
  const milestoneIds = uniqueIds(milestones.map((row) => row.id))
  const [confirmations, entries, offers, evidenceRows, reviewRows, actionRows] = await Promise.all([
    rowsFor(projectIds, () =>
      supabase
        .from('csr_payment_confirmations')
        .select('project_id, milestone_id, amount, payment_status, confirmed_at')
        .in('project_id', projectIds)
        .eq('payment_status', 'confirmed')
    ),
    rowsFor(attendanceAssignmentIds, () =>
      supabase
        .from('service_attendance_entries')
        .select('assignment_id, attendance_date, units')
        .in('assignment_id', attendanceAssignmentIds)
        .eq('attendance_status', 'present')
    ),
    rowsFor(offerIds, () =>
      supabase.from('service_offers').select('id, title, offer_type').in('id', offerIds)
    ),
    rowsFor(milestoneIds, () =>
      supabase
        .from('csr_milestone_evidence')
        .select('id, milestone_id, submission_status, uploaded_at, captured_at, created_at')
        .in('milestone_id', milestoneIds)
    ),
    rowsFor(milestoneIds, () =>
      supabase
        .from('csr_milestone_reviews')
        .select('milestone_id, evidence_id, reviewer_id, reviewer_platform_ca_id, decision, reviewed_at, created_at')
        .in('milestone_id', milestoneIds)
    ),
    rowsFor(milestoneIds, () =>
      supabase
        .from('company_ca_action_log')
        .select('milestone_id, company_ca_identity_id, action_type, created_at, payload')
        .in('milestone_id', milestoneIds)
    ),
  ])

  const reviewerUserIds = uniquePositiveInts(reviewRows.map((row) => row.reviewer_id))
  const platformCaIds = uniquePositiveInts(reviewRows.map((row) => row.reviewer_platform_ca_id))
  const identityIds = uniqueIds(actionRows.map((row) => row.company_ca_identity_id))
  const allUserIds = uniquePositiveInts([...userIds, ...reviewerUserIds])
  const [users, identitiesById, identitiesByUser, platformCas] = await Promise.all([
    rowsFor(allUserIds, () => supabase.from('users').select('id, name, user_type').in('id', allUserIds)),
    rowsFor(identityIds, () =>
      supabase.from('company_ca_identities').select('id, user_id, ca_id').in('id', identityIds)
    ),
    rowsFor(reviewerUserIds, () =>
      supabase.from('company_ca_identities').select('id, user_id, ca_id').in('user_id', reviewerUserIds)
    ),
    rowsFor(platformCaIds, () =>
      supabase.from('platform_ca_accounts').select('id, ca_id, display_name').in('id', platformCaIds)
    ),
  ])
  const caIdentityRows = [...identitiesById, ...identitiesByUser]

  const milestonesByCampaign = groupBy(milestones, (row) => String(row.campaign_id))
  const paidByCampaign = new Map<string, number>()
  for (const row of confirmations) {
    const campaignId = projectCampaign.get(String(row.project_id))
    if (!campaignId) continue
    paidByCampaign.set(campaignId, (paidByCampaign.get(campaignId) || 0) + (Number(row.amount) || 0))
  }

  const volunteerAssignmentsByCampaign = groupBy(volunteerAssignments, (row) => String(row.target_id || ''))
  const capabilityAssignmentsByCampaign = groupBy(capabilityAssignments, (row) => capabilityCampaignId(row))
  const entriesByAssignment = groupBy(entries, (entry) => String(entry.assignment_id || ''))
  const volunteerEntriesByCampaign = groupBy(
    entries.filter((entry) => volunteerAssignmentCampaign.has(String(entry.assignment_id))),
    (entry) => volunteerAssignmentCampaign.get(String(entry.assignment_id)) as string
  )
  const names = new Map(users.map((row) => [Number(row.id), String(row.name || '')]))
  const userTypes = new Map(
    users.map((row) => [Number(row.id), String((row as { user_type?: string | null }).user_type || '')])
  )
  const offerTitles = new Map(
    offers.map((row) => [
      Number(row.id),
      { title: String(row.title || `Offer ${row.id}`), offer_type: String(row.offer_type || '') },
    ])
  )
  const evidenceByMilestone = groupBy(evidenceRows, (row) => String(row.milestone_id || ''))
  const reviewsByMilestone = groupBy(reviewRows, (row) => String(row.milestone_id || ''))
  const actionsByMilestone = groupBy(actionRows, (row) => String(row.milestone_id || ''))
  const paymentsByMilestone = groupBy(confirmations, (row) => String(row.milestone_id || ''))
  const caByIdentityId = new Map(
    caIdentityRows.map((row) => [
      String(row.id),
      {
        ca_id: String(row.ca_id || ''),
        user_id: Number(row.user_id || 0),
        name: names.get(Number(row.user_id || 0)) || null,
      },
    ])
  )
  const caByUserId = new Map(
    caIdentityRows
      .filter((row) => Number(row.user_id || 0) > 0)
      .map((row) => [
        Number(row.user_id),
        { ca_id: String(row.ca_id || ''), name: names.get(Number(row.user_id || 0)) || null },
      ])
  )
  const platformCaById = new Map(
    platformCas.map((row) => [
      Number(row.id),
      { ca_id: String(row.ca_id || ''), name: String(row.display_name || row.ca_id || 'Platform CA') },
    ])
  )

  const result = new Map<string, CampaignTracking>()
  for (const campaign of campaigns) {
    const id = String(campaign.id)
    const impact = parseJsonObject(campaign.impact_metrics)
    const applications = filterVolunteerApplicationsExcludingLeadNgo(campaign)
    const campaignVolunteerAssignments = filterVolunteerAssignmentsExcludingLeadNgo(
      campaign,
      volunteerAssignmentsByCampaign.get(id) || []
    )
    const campaignVolunteerAssignmentIds = new Set(
      campaignVolunteerAssignments.map((row) => String(row.id || '')).filter(Boolean)
    )
    const campaignVolunteerEntries = (volunteerEntriesByCampaign.get(id) || []).filter((entry) =>
      campaignVolunteerAssignmentIds.has(String(entry.assignment_id || ''))
    )
    const checkedIn = new Set(campaignVolunteerEntries.map((entry) => String(entry.assignment_id)))
    const lastAttendance = campaignVolunteerEntries.map((entry) => isoDate(entry.attendance_date)).sort().at(-1) || null
    const parsedRentals = parseCsrCapabilityRentals(campaign.impact_metrics)

    const campaignMilestones = (milestonesByCampaign.get(id) || []).sort(
      (a, b) => Number(a.milestone_order) - Number(b.milestone_order)
    )
    const countStatus = (...statuses: string[]) =>
      campaignMilestones.filter((m) => statuses.includes(String(m.status || '').toLowerCase())).length
    const next = campaignMilestones.find((m) => String(m.status || '').toLowerCase() !== 'completed') || null

    const rentals = emptyRentals()
    for (const rental of parsedRentals) {
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
        ? { id: leadId, name: names.get(leadId) || 'Lead NGO', accepted: Boolean(impact.lead_ngo_accepted) }
        : null,
      volunteers: {
        required: Number(impact.volunteer_requirement ?? impact.volunteer_limit ?? 0) || 0,
        enrolled: applications.length,
        people_committed: applications.reduce((sum, app) => sum + Math.max(1, Number(app?.capacity || 1) || 1), 0),
        checked_in: checkedIn.size,
        person_days: campaignVolunteerEntries.reduce((sum, entry) => sum + Math.max(1, Number(entry.units) || 1), 0),
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
      attendance: buildFieldAttendance({
        campaign,
        applications,
        volunteerAssignments: campaignVolunteerAssignments,
        capabilityAssignments: capabilityAssignmentsByCampaign.get(id) || [],
        rentals: parsedRentals,
        entriesByAssignment,
        names,
        userTypes,
        offerTitles,
        reference,
      }),
      milestone_trail: buildMilestoneTrail({
        milestones: campaignMilestones,
        evidenceByMilestone,
        reviewsByMilestone,
        actionsByMilestone,
        paymentsByMilestone,
        names,
        caByUserId,
        caByIdentityId,
        platformCaById,
      }),
    })
  }

  return result
}