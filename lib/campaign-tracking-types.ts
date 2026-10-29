export type CampaignLifecycle =
  | 'draft'
  | 'awaiting_lead'
  | 'upcoming'
  | 'running'
  | 'ended'
  | 'completed'
  | 'cancelled'

export type CampaignAttendanceMark = 'present' | 'absent' | 'not_due'

export type CampaignDailyHeadcount = {
  date: string
  present_people: number
  expected_people: number
  due: boolean
}

export type CampaignVolunteerAttendanceRow = {
  user_id: number
  name: string
  user_type: string
  capacity: number
  today: CampaignAttendanceMark
  days_present: number
  days_absent: number
  person_days: number
  last_attendance_at: string | null
}

export type CampaignCapabilityAttendanceRow = {
  id: string
  title: string
  offer_type: string
  status: string
  today: CampaignAttendanceMark
  days_present: number
  days_absent: number
  last_attendance_at: string | null
  on_site: boolean
  outbound_delivered_at: string | null
  project_completed_at: string | null
  return_dispatched_at: string | null
  return_delivered_at: string | null
  returned_to_owner: boolean
  return_tracking_id: string | null
}

export type CampaignEvidenceReview = {
  decision: string
  reviewed_at: string | null
  reviewer_name: string | null
  reviewer_ca_id: string | null
  reviewer_kind: 'company_ca' | 'platform_ca' | 'unknown'
}

export type CampaignEvidenceTrailRow = {
  id: string
  submitted_at: string | null
  status: string
  review: CampaignEvidenceReview | null
}

export type CampaignMilestoneTrailRow = {
  id: string
  title: string
  status: string
  amount_inr: number
  due_date: string | null
  evidence: CampaignEvidenceTrailRow[]
  payment_done: boolean
  paid_inr: number
  paid_at: string | null
}

export type CampaignFieldAttendance = {
  as_of: string
  expected_volunteers: number
  present_volunteers_today: number
  expected_capabilities: number
  present_capabilities_today: number
  volunteer_days: CampaignDailyHeadcount[]
  ngo_days: CampaignDailyHeadcount[]
  capability_days: CampaignDailyHeadcount[]
  volunteers: CampaignVolunteerAttendanceRow[]
  capabilities: CampaignCapabilityAttendanceRow[]
}

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
  attendance?: CampaignFieldAttendance
  milestone_trail?: CampaignMilestoneTrailRow[]
}

export function campaignShowsFieldAttendance(lifecycle: CampaignLifecycle): boolean {
  return lifecycle === 'running' || lifecycle === 'ended' || lifecycle === 'completed'
}
