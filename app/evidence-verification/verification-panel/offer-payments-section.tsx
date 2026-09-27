import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { EvidenceQueueItem, EvidenceSectionCard } from '@/components/evidence-verification/portal-ui';
import { groupByRequest, pendingItemAmount } from './helpers';
import type { PendingPaymentItem } from './types';

export function OfferPaymentsSection({
  items,
  actionLoadingKey,
  onPayGroup,
}: {
  items: PendingPaymentItem[];
  actionLoadingKey: string | null;
  onPayGroup: (items: PendingPaymentItem[]) => void;
}) {
  const router = useRouter();
  const isPaying = actionLoadingKey === 'ca-pay-group';

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
          {Object.entries(groupByRequest(items)).map(([reqId, groupItems]) => {
            const total = groupItems.reduce((sum, it) => sum + pendingItemAmount(it), 0);
            return (
              <EvidenceQueueItem
                key={reqId}
                title={`Request #${reqId}`}
                subtitle={`${groupItems.length} pending item(s)`}
                badge={<Badge variant="outline">Rs {total.toFixed(2)}</Badge>}
                meta={
                  <div className="space-y-2">
                    {groupItems.map((it) => (
                      <div
                        key={it.id}
                        className="flex items-center justify-between gap-3 rounded-md border border-slate-100 bg-slate-50 px-3 py-2 text-sm text-slate-600"
                      >
                        <span className="min-w-0 truncate">
                          {it.attendance_date || it.created_at || 'N/A'} —{' '}
                          {it.title || it.service_request_title || (it.amount ? 'Attendance' : 'Contribution')}
                        </span>
                        <span className="shrink-0 font-medium tabular-nums">
                          Rs {pendingItemAmount(it).toFixed(2)}
                        </span>
                      </div>
                    ))}
                  </div>
                }
                footer={
                  <>
                    <Button variant="outline" onClick={() => router.push(`/service-requests/${reqId}`)}>
                      Open Request
                    </Button>
                    <Button onClick={() => onPayGroup(groupItems)} disabled={isPaying}>
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
