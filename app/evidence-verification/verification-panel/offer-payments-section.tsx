import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { EvidenceQueueItem, EvidenceSectionCard } from '@/components/evidence-verification/portal-ui';
import { groupPendingPayments, isAttendanceEntry, pendingItemAmount } from './helpers';
import type { PendingPaymentGroup, PendingPaymentItem } from './types';

function itemLabel(item: PendingPaymentItem) {
  if (isAttendanceEntry(item)) return `${item.attendance_date} — Attendance`;
  const type = item.contribution_type ? item.contribution_type.replace(/_/g, ' ') : 'Contribution';
  return `${item.created_at?.slice(0, 10) || 'N/A'} — ${type}`;
}

export function OfferPaymentsSection({
  items,
  actionLoadingKey,
  onPayGroup,
}: {
  items: PendingPaymentItem[];
  actionLoadingKey: string | null;
  onPayGroup: (group: PendingPaymentGroup) => void;
}) {
  const router = useRouter();
  const anyPaying = Boolean(actionLoadingKey?.startsWith('ca-pay-'));

  return (
    <EvidenceSectionCard
      className="h-full"
      title="Pending Offer / Attendance Payments"
      description="Payments requested for offers, attendance, or contributions."
    >
      {items.length === 0 ? (
        <p className="text-sm text-slate-600">No pending offer/attendance payments.</p>
      ) : (
        <div className="space-y-3">
          {groupPendingPayments(items).map((group) => {
            const total = group.items.reduce((sum, it) => sum + pendingItemAmount(it), 0);
            const isPaying = actionLoadingKey === `ca-pay-${group.key}`;
            return (
              <EvidenceQueueItem
                key={group.key}
                title={group.title}
                subtitle={`${group.items.length} pending item(s)`}
                badge={<Badge variant="outline">Rs {total.toFixed(2)}</Badge>}
                meta={
                  <div className="space-y-2">
                    {group.items.map((it) => (
                      <div
                        key={it.id}
                        className="flex items-center justify-between gap-3 rounded-md border border-slate-100 bg-slate-50 px-3 py-2 text-sm text-slate-600"
                      >
                        <span className="min-w-0 truncate capitalize">{itemLabel(it)}</span>
                        <span className="shrink-0 font-medium tabular-nums">
                          Rs {pendingItemAmount(it).toFixed(2)}
                        </span>
                      </div>
                    ))}
                  </div>
                }
                footer={
                  <>
                    {group.requestId && (
                      <Button variant="outline" onClick={() => router.push(`/service-requests/${group.requestId}`)}>
                        Open Request
                      </Button>
                    )}
                    <Button onClick={() => onPayGroup(group)} disabled={anyPaying || total <= 0}>
                      {isPaying ? 'Processing...' : `Pay Now • Rs ${total.toFixed(2)}`}
                    </Button>
                  </>
                }
              />
            );
          })}
        </div>
      )}
    </EvidenceSectionCard>
  );
}
