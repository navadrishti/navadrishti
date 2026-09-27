'use client';

import { CAConsoleHeader, formatVerifierScopeLabels } from '@/components/ca-console-header';
import {
  EvidenceMessageCard,
  EvidencePageHeader,
  EvidencePortalContentSkeleton,
  EvidencePortalMain,
  EvidencePortalShell,
} from '@/components/evidence-verification/portal-ui';
import { finalizeConsoleLogout } from '@/lib/utils';
import { buildPendingEvidenceItems, buildPendingPaymentItems } from './verification-panel/helpers';
import { MilestonePaymentsSection } from './verification-panel/milestone-payments-section';
import { OfferPaymentsSection } from './verification-panel/offer-payments-section';
import { PanelStats } from './verification-panel/panel-stats';
import { ProjectQueueSection } from './verification-panel/project-queue-section';
import { usePanelPayments } from './verification-panel/use-panel-payments';
import { useVerificationPanel } from './verification-panel/use-verification-panel';
import { VolunteerAttendanceSection } from './verification-panel/volunteer-attendance-section';

const logout = async () => {
  await finalizeConsoleLogout({
    logoutUrl: '/api/evidence-verification/logout',
    redirectTo: '/evidence-verification/login',
    tabSessionKey: 'evidence_verification_tab_session',
  });
};

export default function VerificationPanelClient() {
  const {
    loading,
    context,
    projects,
    projectTimelineById,
    caPendingPayments,
    volunteerAttendance,
    panelMessage,
    setPanelMessage,
    refreshPanel,
  } = useVerificationPanel();
  const { actionLoadingKey, handlePayGroup, handleMilestonePayment } = usePanelPayments({
    setPanelMessage,
    onPaid: refreshPanel,
  });

  const pendingEvidenceItems = buildPendingEvidenceItems(projectTimelineById);
  const pendingPaymentItems = buildPendingPaymentItems(projectTimelineById, projects);
  const scopeLabels = formatVerifierScopeLabels(context ?? undefined);

  return (
    <EvidencePortalShell>
      <CAConsoleHeader
        accountName={context?.user?.name}
        accountEmail={context?.user?.email}
        companyName={context?.company?.name || context?.company_name}
        caId={context?.ca_id}
        companyUserId={context?.company_user_id}
        onLogout={logout}
      />

      <EvidencePortalMain>
        {loading ? (
          <EvidencePortalContentSkeleton />
        ) : (
          <>
            <EvidencePageHeader
              title="CA Portal"
              description="Review milestone evidence and confirm payments for your company scope."
              scopeLabels={scopeLabels || undefined}
            />

            {panelMessage ? <EvidenceMessageCard>{panelMessage}</EvidenceMessageCard> : null}

            <PanelStats
              projectCount={projects.length}
              pendingEvidenceItems={pendingEvidenceItems}
              volunteerAttendance={volunteerAttendance}
            />

            <VolunteerAttendanceSection volunteerAttendance={volunteerAttendance} />

            <div className="grid gap-4 md:grid-cols-2">
              <MilestonePaymentsSection
                items={pendingPaymentItems}
                actionLoadingKey={actionLoadingKey}
                onPay={handleMilestonePayment}
              />
              <OfferPaymentsSection
                items={caPendingPayments}
                actionLoadingKey={actionLoadingKey}
                onPayGroup={handlePayGroup}
              />
            </div>

            <ProjectQueueSection projects={projects} />
          </>
        )}
      </EvidencePortalMain>
    </EvidencePortalShell>
  );
}
