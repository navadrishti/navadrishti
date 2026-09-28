import type { User } from '@/lib/auth-context';
import { summarizeDocumentExpiries, visibleCaBadgeNumber } from '@/lib/auth';
import { formatDisplayDate } from '@/lib/format-date';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { VerificationBadge } from '@/components/verification-badge';
import { CheckCircle } from 'lucide-react';

interface VerifiedSummaryCardProps {
  user: User;
  reverificationPending: boolean;
  onBack: () => void;
  onStartReverify: () => void;
}

export function VerifiedSummaryCard({
  user,
  reverificationPending,
  onBack,
  onStartReverify
}: VerifiedSummaryCardProps) {
  const expirySummary =
    user.user_type === 'ngo' ? summarizeDocumentExpiries(user.profile_data) : null;
  const caBadgeNumber =
    visibleCaBadgeNumber(user.verification_status, user.profile_data || user.profile) ||
    user.ca_badge_number ||
    null;

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex min-w-0 items-center gap-x-3">
            <CheckCircle className="h-5 w-5 shrink-0 text-green-600" />
            <span>You&apos;re all set</span>
          </CardTitle>
          <CardDescription>
            {caBadgeNumber ? (
              <span className="inline-flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1">
                <span>Your documents are CA-verified. Your badge number is :</span>
                <VerificationBadge
                  status="verified"
                  size="sm"
                  showText={false}
                  badgeNumber={caBadgeNumber}
                  className="max-w-full min-w-0 align-middle"
                />
              </span>
            ) : (
              'Your email and document verification are already complete.'
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {reverificationPending && (
            <Alert>
              <AlertDescription>
                Your reverification request is under review. You remain verified while we review your updated documents.
              </AlertDescription>
            </Alert>
          )}
          {(expirySummary?.has_expired || expirySummary?.has_due_soon) && !reverificationPending ? (
            <Alert>
              <AlertDescription>
                {expirySummary.has_expired
                  ? expirySummary.soonest
                    ? `${expirySummary.soonest.label} expired on ${formatDisplayDate(
                        expirySummary.soonest.valid_until
                      )}. The matching CA tag has been dropped. Reverify with an updated certificate to restore it. You stay verified.`
                    : 'A compliance certificate has expired and its CA tag was dropped. Reverify with an updated certificate to restore it.'
                  : expirySummary.soonest
                    ? `${expirySummary.soonest.label} expires on ${formatDisplayDate(
                        expirySummary.soonest.valid_until
                      )}. Reverify with an updated certificate before it lapses, or the matching CA tag will be dropped.`
                    : 'A compliance certificate is expiring soon. Reverify before it lapses.'}
              </AlertDescription>
            </Alert>
          ) : null}
          <div className="flex flex-wrap gap-3">
            <Button onClick={onBack}>Back to Dashboard</Button>
            {!reverificationPending && (
              <Button
                variant="outline"
                className="border-udaan-orange text-udaan-orange hover:bg-orange-50"
                onClick={onStartReverify}
              >
                {expirySummary?.has_expired
                  ? 'Restore expired certificate'
                  : expirySummary?.has_due_soon
                    ? 'Update expiring documents'
                    : 'Reverify documents'}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
