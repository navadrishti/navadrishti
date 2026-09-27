import type { CampaignVolunteerAttendanceSummary } from '@/lib/campaign-volunteer-attendance';
import type { Tables } from '@/lib/database.types';
import type { MilestoneEvidence } from '../types';

type Milestone = Tables<'csr_project_milestones'>;
type PaymentConfirmation = Tables<'csr_payment_confirmations'>;

export type CsrProjectSummary = Tables<'csr_projects'> & {
  ngo?: { name?: string };
  milestones_count: number;
  completed_milestones_count: number;
  next_milestone: Milestone | null;
  deadline_at: string | null;
  confirmed_funds: number;
};

type ProjectTimelineEntry = {
  milestone: Milestone;
  evidence: MilestoneEvidence[];
  latest_review: Tables<'csr_milestone_reviews'> | null;
  reviews: Tables<'csr_milestone_reviews'>[];
  latest_payment: PaymentConfirmation | null;
  payments: PaymentConfirmation[];
};

export type ProjectTimeline = {
  project: Tables<'csr_projects'>;
  summary: {
    total_milestones: number;
    completed_milestones: number;
    confirmed_funds: number;
    next_milestone: Milestone | null;
  };
  timeline: ProjectTimelineEntry[];
};

export type PendingPaymentItem = Partial<Tables<'service_attendance_entries'> & Tables<'service_request_contributions'>> & {
  id: string;
  request_id?: string | number | null;
  service_request?: string | number | null;
  title?: string | null;
  service_request_title?: string | null;
};

export type VolunteerAttendanceData = {
  campaigns: CampaignVolunteerAttendanceSummary[];
  totals: {
    campaigns: number;
    volunteers: number;
    checked_in_volunteers: number;
    never_checked_in: number;
    person_days_checked_in: number;
  };
};

export type PendingEvidenceItem = {
  projectId: string;
  milestoneId: string;
  milestoneTitle: string;
};

export type MilestonePaymentItem = {
  projectId: string;
  projectTitle: string;
  ngoName: string;
  milestoneId: string;
  milestoneTitle: string;
  amount: number;
};
