import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { EvidenceStatCard } from '@/components/evidence-verification/portal-ui';
import type { PendingEvidenceItem, VolunteerAttendanceData } from './types';

export function PanelStats({
  projectCount,
  pendingEvidenceItems,
  volunteerAttendance,
}: {
  projectCount: number;
  pendingEvidenceItems: PendingEvidenceItem[];
  volunteerAttendance: VolunteerAttendanceData | null;
}) {
  const router = useRouter();

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <EvidenceStatCard
        title="Active Projects"
        description="Projects currently scoped for your verifier access."
        value={projectCount}
        subtitle="Projects available for review"
      />
      <EvidenceStatCard
        title="Pending Reviews"
        description="Evidence submissions waiting for action."
        value={pendingEvidenceItems.length}
        subtitle="Milestones with status submitted"
        action={
          pendingEvidenceItems.length > 0 ? (
            <Button
              className="h-10 w-full"
              onClick={() => router.push(`/evidence-verification/review/${pendingEvidenceItems[0].milestoneId}`)}
            >
              Go to Review
            </Button>
          ) : null
        }
      />
      <EvidenceStatCard
        title="Volunteers checked in"
        description="Volunteers with at least one sealed present day."
        value={volunteerAttendance?.totals?.checked_in_volunteers ?? 0}
        subtitle={`${volunteerAttendance?.totals?.never_checked_in ?? 0} never checked in`}
      />
      <EvidenceStatCard
        title="Person-days checked in"
        description="Includes NGO team capacity counted per selfie."
        value={volunteerAttendance?.totals?.person_days_checked_in ?? 0}
        subtitle={`${volunteerAttendance?.totals?.volunteers ?? 0} signed-up volunteers`}
      />
    </div>
  );
}
