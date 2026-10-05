import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  EvidenceMetaGrid,
  EvidenceQueueItem,
  EvidenceSectionCard,
} from '@/components/evidence-verification/portal-ui';
import { getTotalChargeLabel } from '@/components/platform-payment-summary';
import type { MilestonePaymentItem } from './types';

export function MilestonePaymentsSection({
  items,
  actionLoadingKey,
  onPay,
}: {
  items: MilestonePaymentItem[];
  actionLoadingKey: string | null;
  onPay: (item: MilestonePaymentItem) => void;
}) {
  return (
    <EvidenceSectionCard
      className="h-full"
      title="Approved Milestone Payments"
      description="Pay the lead NGO online after milestone evidence is approved."
    >
      {items.length === 0 ? (
        <p className="text-sm text-slate-600">No approved milestones awaiting payment.</p>
      ) : (
        <div className="space-y-3">
          {items.map((item) => {
            const amount = Number(item.amount || 0);
            const isPaying = actionLoadingKey === `payment-${item.milestoneId}`;
            return (
              <EvidenceQueueItem
                key={`${item.projectId}-${item.milestoneId}-payment`}
                title={item.projectTitle}
                subtitle={item.ngoName}
                badge={<Badge variant="outline">Approved</Badge>}
                meta={
                  <EvidenceMetaGrid>
                    <p>Milestone: {item.milestoneTitle}</p>
                    <p>Lead NGO receives: Rs {amount.toLocaleString('en-IN')}</p>
                    <p>Total due: {getTotalChargeLabel(amount)}</p>
                  </EvidenceMetaGrid>
                }
                footer={
                  <Button onClick={() => onPay(item)} disabled={isPaying}>
                    {isPaying ? 'Opening payment...' : `Pay ${getTotalChargeLabel(amount)}`}
                  </Button>
                }
              />
            );
          })}
        </div>
      )}
    </EvidenceSectionCard>
  );
}
