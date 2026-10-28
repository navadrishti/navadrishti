import {
  LeadNgoConfirmedSection,
  LeadNgoSection,
  ProjectSuggestionsSection,
  ServiceMatchesSection,
} from '@/app/companies/csr-agent/preview-sections'
import type {
  LeadNgoInvite,
  NgoDirectoryItem,
  ProjectSuggestion,
  ServiceSuggestion,
} from '@/app/companies/csr-agent/session'
import type { CsrCapabilityRentalRecord } from '@/lib/service-engagement'

type SuggestionsSidebarProps = {
  projectSuggestions: ProjectSuggestion[]
  loadingProjects: boolean
  selectedProjectId: string | null
  onSelectProject: (project: ProjectSuggestion) => void
  serviceSuggestions: ServiceSuggestion[]
  loadingServices: boolean
  serviceError: string | null
  actionsEnabled: boolean
  leadAccepted: boolean
  payingOfferId: number | null
  paidOfferIds: number[]
  paidRentals: Record<number, CsrCapabilityRentalRecord>
  rentalCampaignId: string
  onPayAndReserve: (offerId: number, offerType?: string) => void | Promise<void>
  onRentalUpdated: (offerId: number) => void | Promise<void>
  payerVerified?: boolean
  ngos: NgoDirectoryItem[]
  loadingNgos: boolean
  invites: LeadNgoInvite[]
  acceptedLead: LeadNgoInvite | null
  linkedProjectTitle: string | null
  onToggleInvite: (ngo: NgoDirectoryItem) => void | Promise<void>
  inviteError: string
}

export function SuggestionsSidebar({
  projectSuggestions,
  loadingProjects,
  selectedProjectId,
  onSelectProject,
  serviceSuggestions,
  loadingServices,
  serviceError,
  actionsEnabled,
  leadAccepted,
  payingOfferId,
  paidOfferIds,
  paidRentals,
  rentalCampaignId,
  onPayAndReserve,
  onRentalUpdated,
  payerVerified,
  ngos,
  loadingNgos,
  invites,
  acceptedLead,
  linkedProjectTitle,
  onToggleInvite,
  inviteError,
}: SuggestionsSidebarProps) {
  return (
    <aside className="space-y-4 lg:sticky lg:top-24">
      <ProjectSuggestionsSection
        suggestions={projectSuggestions}
        loading={loadingProjects}
        selectedId={selectedProjectId}
        onSelect={onSelectProject}
      />
      <ServiceMatchesSection
        suggestions={serviceSuggestions}
        loading={loadingServices}
        error={serviceError}
        actionsEnabled={actionsEnabled}
        leadAccepted={leadAccepted}
        payingOfferId={payingOfferId}
        paidOfferIds={paidOfferIds}
        paidRentals={paidRentals}
        rentalCampaignId={rentalCampaignId}
        onPayAndReserve={onPayAndReserve}
        onRentalUpdated={onRentalUpdated}
        payerVerified={payerVerified}
      />
      {acceptedLead ? (
        <LeadNgoConfirmedSection
          acceptedLead={acceptedLead}
          ngos={ngos}
          linkedProjectTitle={linkedProjectTitle}
        />
      ) : (
        <LeadNgoSection
          ngos={ngos}
          loading={loadingNgos}
          invites={invites}
          actionsEnabled={actionsEnabled}
          onToggleInvite={onToggleInvite}
        />
      )}
      {inviteError ? (
        <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{inviteError}</p>
      ) : null}
    </aside>
  )
}
