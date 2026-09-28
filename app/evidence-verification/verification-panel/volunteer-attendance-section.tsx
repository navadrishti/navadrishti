import { Badge } from '@/components/ui/badge';
import { EvidenceMetaGrid, EvidenceSectionCard } from '@/components/evidence-verification/portal-ui';
import { formatStatusLabel } from '@/lib/format-date';
import type { CampaignVolunteerAttendanceSummary } from '@/lib/campaign-volunteer-attendance';
import type { VolunteerAttendanceData } from './types';

function CampaignAttendanceCard({ campaign }: { campaign: CampaignVolunteerAttendanceSummary }) {
  return (
    <div className="rounded-md border border-slate-200 p-3">
      <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-medium text-slate-900">{campaign.campaign_title}</p>
          <p className="text-xs text-slate-500">
            {campaign.start_date || '—'} → {campaign.end_date || '—'} · {campaign.project_days} project days ·{' '}
            {formatStatusLabel(campaign.status)}
          </p>
        </div>
        <Badge variant="outline">
          {campaign.volunteers_checked_in}/{campaign.volunteer_count} checked in
        </Badge>
      </div>
      <EvidenceMetaGrid>
        <p>Person-days: {campaign.total_person_days_checked_in}</p>
        <p>Total capacity signed up: {campaign.total_capacity}</p>
        <p>Never checked in: {campaign.volunteers_never_checked_in}</p>
      </EvidenceMetaGrid>
      <div className="mt-3 space-y-2">
        {(campaign.roster || []).map((row) => (
          <div
            key={`${campaign.campaign_id}-${row.user_id}`}
            className="grid gap-1 rounded border border-slate-100 bg-slate-50 px-2 py-2 text-xs text-slate-700 sm:grid-cols-4"
          >
            <p className="font-medium text-slate-900">
              {row.name}
              <span className="ml-1 font-normal text-slate-500">
                ({row.user_type}
                {row.capacity > 1 ? ` · ×${row.capacity}` : ''})
              </span>
            </p>
            <p>
              Present {row.days_present} / Absent {row.days_absent}
            </p>
            <p>Person-days {row.person_days_checked_in}</p>
            <p>
              {row.days_present === 0
                ? 'No check-in'
                : `${Math.round((row.attendance_rate || 0) * 100)}% of project`}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

export function VolunteerAttendanceSection({
  volunteerAttendance,
}: {
  volunteerAttendance: VolunteerAttendanceData | null;
}) {
  return (
    <EvidenceSectionCard
      title="CSR volunteer attendance"
      description="Present = sealed photo mark in GRAM App. Unmarked days count as absent. NGO volunteers count as their team capacity from one selfie."
    >
      {!volunteerAttendance?.campaigns?.length ? (
        <p className="text-sm text-slate-600">No campaign volunteer attendance yet.</p>
      ) : (
        <div className="space-y-4">
          {volunteerAttendance.campaigns.map((campaign) => (
            <CampaignAttendanceCard key={campaign.campaign_id} campaign={campaign} />
          ))}
        </div>
      )}
    </EvidenceSectionCard>
  );
}
