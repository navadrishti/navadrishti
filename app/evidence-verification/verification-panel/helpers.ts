import type {
  CsrProjectSummary,
  MilestonePaymentItem,
  PendingEvidenceItem,
  PendingPaymentItem,
  ProjectTimeline,
} from './types';

function timelineEntries(timelineData: ProjectTimeline | undefined) {
  return Array.isArray(timelineData?.timeline) ? timelineData.timeline : [];
}

export function buildPendingEvidenceItems(
  projectTimelineById: Record<string, ProjectTimeline>
): PendingEvidenceItem[] {
  return Object.entries(projectTimelineById).flatMap(([projectId, timelineData]) =>
    timelineEntries(timelineData)
      .filter((entry) => entry?.milestone?.status === 'submitted')
      .map((entry) => ({
        projectId,
        milestoneId: entry.milestone.id,
        milestoneTitle: entry.milestone.title,
      }))
  );
}

export function buildPendingPaymentItems(
  projectTimelineById: Record<string, ProjectTimeline>,
  projects: CsrProjectSummary[]
): MilestonePaymentItem[] {
  return Object.entries(projectTimelineById).flatMap(([projectId, timelineData]) => {
    const project = projects.find((item) => item.id === projectId);

    return timelineEntries(timelineData)
      .map((entry): MilestonePaymentItem | null => {
        const milestone = entry?.milestone;
        if (!milestone || String(milestone.status || '').toLowerCase() !== 'approved') {
          return null;
        }

        const hasConfirmedPayment = Array.isArray(entry.payments)
          ? entry.payments.some((payment) => payment.payment_status === 'confirmed')
          : false;

        if (hasConfirmedPayment) {
          return null;
        }

        return {
          projectId,
          projectTitle: project?.title || timelineData?.project?.title || 'Project',
          ngoName: String(project?.ngo?.name || project?.ngo_user_id || 'Lead NGO'),
          milestoneId: milestone.id,
          milestoneTitle: milestone.title,
          amount: milestone.amount,
        };
      })
      .filter((item) => item !== null);
  });
}

export function groupByRequest(items: PendingPaymentItem[]) {
  const map: Record<string, PendingPaymentItem[]> = {};
  items.forEach((it) => {
    const req = String(it.service_request_id || it.request_id || it.service_request || 'unknown');
    if (!map[req]) map[req] = [];
    map[req].push(it);
  });
  return map;
}

export function pendingItemAmount(item: PendingPaymentItem) {
  return Number(item.amount_due ?? item.amount ?? 0);
}
