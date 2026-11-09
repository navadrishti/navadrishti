import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  EvidenceMetaGrid,
  EvidenceQueueItem,
  EvidenceSectionCard,
} from '@/components/evidence-verification/portal-ui';
import { PlatformPaymentSummary, getTotalChargeLabel } from '@/components/platform-payment-summary';
import { calculatePlatformCheckoutPricing } from '@/lib/utils';
import type { MilestonePaymentItem } from './types';

const MILESTONE_PAYMENT_KIND = 'csr_milestone';

export function MilestonePaymentsSection({
  items,
  actionLoadingKey,
  onPay,
  paymentMessage,
}: {
  items: MilestonePaymentItem[];
  actionLoadingKey: string | null;
  onPay: (item: MilestonePaymentItem) => void;
  paymentMessage?: string | null;
}) {
  const anyPaying = Boolean(actionLoadingKey?.startsWith('payment-'));

  return (
    <EvidenceSectionCard
      className="h-full"
      title="Approved Milestone Payments"
      description="Pay the lead NGO online after milestone evidence is approved. Recipient amount, platform fee, GST (when applicable), and total payable are shown separately."
    >
      {paymentMessage ? (
        <p className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
          {paymentMessage}
        </p>
      ) : null}
      {items.length === 0 ? (
        <p className="text-sm text-slate-600">No approved milestones awaiting payment.</p>
      ) : (
        <div className="space-y-3">
          {items.map((item) => {
            const amount = Number(item.amount || 0);
            const pricing = calculatePlatformCheckoutPricing(amount, {
              paymentKind: MILESTONE_PAYMENT_KIND,
            });
            const isPaying = actionLoadingKey === `payment-${item.milestoneId}`;
            return (
              <EvidenceQueueItem
                key={`${item.projectId}-${item.milestoneId}-payment`}
                title={item.projectTitle}
                subtitle={item.ngoName}
                badge={<Badge variant="outline">Approved — payment not initiated</Badge>}
                meta={
                  <div className="space-y-3">
                    <EvidenceMetaGrid>
                      <p>Milestone: {item.milestoneTitle}</p>
                      <p>Status: Awaiting payment initiation</p>
                    </EvidenceMetaGrid>
                    <PlatformPaymentSummary
                      baseAmountInr={amount}
                      paymentKind={MILESTONE_PAYMENT_KIND}
                    />
                    <p className="text-xs text-slate-500">
                      Lead NGO receives the milestone amount ({pricing.baseAmountInr.toLocaleString('en-IN', {
                        style: 'currency',
                        currency: 'INR',
                        maximumFractionDigits: 2,
                      })}
                      ). Platform fee
                      {pricing.gstOnPlatformFeeInr > 0 ? ' and GST on that fee' : ''} are charged on top
                      at checkout and are not deducted from the NGO receipt.
                    </p>
                  </div>
                }
                footer={
                  <Button onClick={() => onPay(item)} disabled={isPaying || anyPaying}>
                    {isPaying
                      ? 'Opening payment...'
                      : `Pay ${getTotalChargeLabel(amount, MILESTONE_PAYMENT_KIND)}`}
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
