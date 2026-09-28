import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { formatStatusLabel } from '@/lib/format-date';
import { statusBadgeClass } from './helpers';
import type { CompanyApplication } from './types';

type ApplicationSectionProps = {
  isCompanyUser: boolean;
  allVerified: boolean;
  currentApplication: CompanyApplication | null;
  eligibleForApply: boolean;
  ineligibleReason?: string;
  applyLoading: boolean;
  onApply: () => void;
};

function CsrDashboardLink({ disabled }: { disabled: boolean }) {
  return (
    <Button asChild variant="outline" className="w-full" disabled={disabled}>
      <Link href="/companies/dashboard?tab=csr-projects">Open CSR Dashboard</Link>
    </Button>
  );
}

export function ApplicationSection({
  isCompanyUser,
  allVerified,
  currentApplication,
  eligibleForApply,
  ineligibleReason,
  applyLoading,
  onApply,
}: ApplicationSectionProps) {
  if (!isCompanyUser) {
    return (
      <Alert>
        <AlertDescription>
          Everyone can view this project. Only companies can apply and manage CSR invite flow.
        </AlertDescription>
      </Alert>
    );
  }

  if (!allVerified) {
    return (
      <div className="space-y-4">
        <Alert>
          <AlertDescription>
            Company must have verified email, phone, and verification status before CSR apply/invite actions.
          </AlertDescription>
        </Alert>
        <Button asChild variant="outline" className="w-full">
          <Link href="/verification">Complete Verification</Link>
        </Button>
      </div>
    );
  }

  if (currentApplication) {
    return (
      <div className="space-y-4">
        <Alert>
          <AlertDescription>
            Your company has already applied for this project.
          </AlertDescription>
        </Alert>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Status:</span>
            <Badge className={statusBadgeClass(currentApplication.status)}>
              {formatStatusLabel(currentApplication.status)}
            </Badge>
          </div>
        </div>

        <CsrDashboardLink disabled={!allVerified} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {!eligibleForApply ? (
        <Alert>
          <AlertDescription>{ineligibleReason || 'Project is not eligible for CSR full-project apply.'}</AlertDescription>
        </Alert>
      ) : (
        <Alert>
          <AlertDescription>
            Apply once for full-project responsibility. Lead NGO invite and selection happens in Company Dashboard after NGO approval.
          </AlertDescription>
        </Alert>
      )}

      <Button
        onClick={onApply}
        className="w-full"
        disabled={!eligibleForApply || applyLoading}
      >
        {applyLoading ? 'Applying...' : 'Apply for Takeover'}
      </Button>

      <CsrDashboardLink disabled={!allVerified} />
    </div>
  );
}
