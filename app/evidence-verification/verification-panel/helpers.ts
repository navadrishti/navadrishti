import type {
  CsrProjectSummary,
  MilestonePaymentItem,
  PendingEvidenceItem,
  PendingPaymentGroup,
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

const TARGET_LABELS: Record<string, string> = {
  service_request: 'Request',
  service_offer: 'Offer',
  csr_project: 'CSR Project',
  campaign: 'Campaign',
};

export function isAttendanceEntry(item: PendingPaymentItem) {
  return Boolean(item.attendance_date);
}

function paymentTarget(item: PendingPaymentItem) {
  if (isAttendanceEntry(item)) {
    return { type: item.target_type || '', id: item.target_id ? String(item.target_id) : '' };
  }
  return { type: 'service_request', id: item.service_request_id ? String(item.service_request_id) : '' };
}

export function groupPendingPayments(items: PendingPaymentItem[]): PendingPaymentGroup[] {
  const groups = new Map<string, PendingPaymentGroup>();
  items.forEach((item) => {
    const target = paymentTarget(item);
    const key = target.id ? `${target.type}:${target.id}` : 'unlinked';
    let group = groups.get(key);
    if (!group) {
      group = {
        key,
        title: target.id ? `${TARGET_LABELS[target.type] || 'Item'} #${target.id}` : 'Unlinked payments',
        requestId: target.type === 'service_request' && target.id ? target.id : null,
        items: [],
      };
      groups.set(key, group);
    }
    group.items.push(item);
  });
  return [...groups.values()];
}

export function pendingItemAmount(item: PendingPaymentItem) {
  return Number(item.amount_due ?? item.amount ?? 0);
}
