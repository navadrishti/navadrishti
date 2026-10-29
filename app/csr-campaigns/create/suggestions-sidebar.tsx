'use client'

import { useMemo, useState } from 'react'
import { Loader2 } from 'lucide-react'

import { LeadNgoConfirmedSection } from '@/app/companies/csr-agent/preview-sections'
import { isPendingLeadInvite } from '@/app/companies/csr-agent/helpers'
import type {
  LeadNgoInvite,
  NgoDirectoryItem,
  ProjectSuggestion,
  ServiceSuggestion,
} from '@/app/companies/csr-agent/session'
import { BrowseCatalogPanel, type CatalogFilter } from '@/components/browse-catalog-panel'
import { InlineCsrCapabilityDelhivery } from '@/components/service-card'
import { Button } from '@/components/ui/button'
import { VerificationRequiredNotice } from '@/components/verification-required-notice'
import { VerifiedAccountName } from '@/components/verification-badge'
import { CA_VERIFICATION_REQUIRED_TO_PAY_MESSAGE } from '@/lib/auth'
import {
  BUDGET_FILTER_OPTIONS,
  NGO_STATUS_FILTER_OPTIONS,
  OFFER_TYPE_FILTER_OPTIONS,
  TRANSACTION_FILTER_OPTIONS,
  matchesBudgetBucket,
  ngoStatusValue,
  parseFocusAreas,
  toFilterOptions,
  uniqueSorted,
} from '@/lib/catalog-filters'
import { CSR_SCHEDULE_VII_CATEGORIES } from '@/lib/categories'
import { formatStatusLabel } from '@/lib/format-date'
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

function formatBudget(amount: number | null | undefined) {
  if (amount == null || !Number.isFinite(amount) || amount <= 0) return ''
  return `INR ${amount.toLocaleString('en-IN')}`
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
  const [projectCategory, setProjectCategory] = useState('all')
  const [projectCity, setProjectCity] = useState('all')
  const [projectState, setProjectState] = useState('all')
  const [projectBudget, setProjectBudget] = useState('all')
  const [offerType, setOfferType] = useState('all')
  const [offerCity, setOfferCity] = useState('all')
  const [offerState, setOfferState] = useState('all')
  const [offerTransaction, setOfferTransaction] = useState('all')
  const [offerBudget, setOfferBudget] = useState('all')
  const [ngoCity, setNgoCity] = useState('all')
  const [ngoState, setNgoState] = useState('all')
  const [ngoStatus, setNgoStatus] = useState('all')
  const [ngoFocus, setNgoFocus] = useState('all')

  const projectCategoryOptions = useMemo(() => {
    const fromData = uniqueSorted(projectSuggestions.map((project) => project.category))
    return toFilterOptions([...CSR_SCHEDULE_VII_CATEGORIES, ...fromData], 'All categories')
  }, [projectSuggestions])

  const filteredProjects = useMemo(
    () =>
      projectSuggestions.filter((project) => {
        if (projectCategory !== 'all' && project.category !== projectCategory) return false
        if (projectCity !== 'all' && project.city !== projectCity) return false
        if (projectState !== 'all' && project.state !== projectState) return false
        if (!matchesBudgetBucket(project.budget_inr, projectBudget)) return false
        return true
      }),
    [projectBudget, projectCategory, projectCity, projectState, projectSuggestions],
  )

  const filteredOffers = useMemo(
    () =>
      serviceSuggestions.filter((offer) => {
        if (offerType !== 'all' && offer.offer_type !== offerType) return false
        if (offerCity !== 'all' && offer.city !== offerCity) return false
        if (offerState !== 'all' && offer.state_province !== offerState) return false
        if (offerTransaction !== 'all' && offer.transaction_type !== offerTransaction) return false
        if (!matchesBudgetBucket(offer.price_amount, offerBudget)) return false
        return true
      }),
    [offerBudget, offerCity, offerState, offerTransaction, offerType, serviceSuggestions],
  )

  const filteredNgos = useMemo(
    () =>
      ngos.filter((ngo) => {
        if (ngoCity !== 'all' && ngo.city !== ngoCity) return false
        if (ngoState !== 'all' && ngo.state !== ngoState) return false
        if (ngoStatus !== 'all' && ngoStatusValue(ngo) !== ngoStatus) return false
        if (ngoFocus !== 'all' && !parseFocusAreas(ngo.focus_areas).includes(ngoFocus)) return false
        return true
      }),
    [ngoCity, ngoFocus, ngoState, ngoStatus, ngos],
  )

  const projectFilters: CatalogFilter[] = [
    { id: 'project-category', label: 'Filter NGO projects by category', value: projectCategory, options: projectCategoryOptions, onChange: setProjectCategory },
    { id: 'project-city', label: 'Filter NGO projects by city', value: projectCity, options: toFilterOptions(projectSuggestions.map((project) => project.city), 'All cities'), onChange: setProjectCity },
    { id: 'project-state', label: 'Filter NGO projects by state', value: projectState, options: toFilterOptions(projectSuggestions.map((project) => project.state), 'All states'), onChange: setProjectState },
    { id: 'project-budget', label: 'Filter NGO projects by budget', value: projectBudget, options: BUDGET_FILTER_OPTIONS, onChange: setProjectBudget },
  ]

  const offerFilters: CatalogFilter[] = [
    { id: 'offer-type', label: 'Filter capability offers by type', value: offerType, options: OFFER_TYPE_FILTER_OPTIONS, onChange: setOfferType },
    { id: 'offer-city', label: 'Filter capability offers by city', value: offerCity, options: toFilterOptions(serviceSuggestions.map((offer) => offer.city), 'All cities'), onChange: setOfferCity },
    { id: 'offer-state', label: 'Filter capability offers by state', value: offerState, options: toFilterOptions(serviceSuggestions.map((offer) => offer.state_province), 'All states'), onChange: setOfferState },
    { id: 'offer-transaction', label: 'Filter capability offers by transaction', value: offerTransaction, options: TRANSACTION_FILTER_OPTIONS, onChange: setOfferTransaction },
    { id: 'offer-budget', label: 'Filter capability offers by budget', value: offerBudget, options: BUDGET_FILTER_OPTIONS, onChange: setOfferBudget },
  ]

  const ngoFilters: CatalogFilter[] = [
    { id: 'ngo-city', label: 'Filter NGOs by city', value: ngoCity, options: toFilterOptions(ngos.map((ngo) => ngo.city), 'All cities'), onChange: setNgoCity },
    { id: 'ngo-state', label: 'Filter NGOs by state', value: ngoState, options: toFilterOptions(ngos.map((ngo) => ngo.state), 'All states'), onChange: setNgoState },
    { id: 'ngo-status', label: 'Filter NGOs by verification', value: ngoStatus, options: NGO_STATUS_FILTER_OPTIONS, onChange: setNgoStatus },
    { id: 'ngo-focus', label: 'Filter NGOs by focus area', value: ngoFocus, options: toFilterOptions(ngos.flatMap((ngo) => parseFocusAreas(ngo.focus_areas)), 'All focus areas'), onChange: setNgoFocus },
  ]

  return (
    <aside className="space-y-4 lg:sticky lg:top-24">
      <BrowseCatalogPanel
        title="NGO Projects"
        description="Browse listed NGO projects. Use one to fill this campaign, or continue with your own details."
        loading={loadingProjects}
        items={filteredProjects}
        getItemKey={(project) => project.id}
        getSearchText={(project) =>
          `${project.title} ${project.description} ${project.location} ${project.ngo_name || ''} ${project.category || ''} ${project.city || ''} ${project.state || ''}`
        }
        searchPlaceholder="Search projects"
        filters={projectFilters}
        empty="No NGO projects are listed on the platform yet."
        renderItem={(project) => (
          <div className={`rounded-xl border bg-white p-3 ${selectedProjectId === project.id ? 'border-emerald-300 bg-emerald-50' : 'border-slate-200'}`}>
            <div className="flex flex-col gap-3">
              <div className="min-w-0">
                <p className="line-clamp-1 text-sm font-semibold text-slate-950">{project.title}</p>
                {project.ngo_name ? <p className="mt-1 line-clamp-1 text-xs text-slate-500">{project.ngo_name}</p> : null}
                <p className="mt-1 line-clamp-2 text-xs text-slate-600">{project.description || 'No description available.'}</p>
                <p className="mt-1 line-clamp-1 text-xs text-slate-500">
                  {project.location || 'Location unavailable'}
                  {formatBudget(project.budget_inr) ? ` • ${formatBudget(project.budget_inr)}` : ''}
                  {project.category ? ` • ${project.category}` : ''}
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                className="w-full"
                variant={selectedProjectId === project.id ? 'secondary' : 'outline'}
                onClick={() => onSelectProject(project)}
              >
                {selectedProjectId === project.id ? 'Selected' : 'Use project'}
              </Button>
            </div>
          </div>
        )}
      />

      <BrowseCatalogPanel
        title="Capability Offers"
        description="Browse listed capability offers. Pay and reserve after a lead NGO accepts."
        loading={loadingServices}
        error={serviceError}
        items={filteredOffers}
        getItemKey={(offer) => String(offer.service_offer_id)}
        getSearchText={(offer) =>
          `${offer.capability_name} ${offer.offer_type} ${offer.city} ${offer.state_province} ${offer.transaction_type}`
        }
        searchPlaceholder="Search offers"
        filters={offerFilters}
        empty="No capability offers are listed on the platform yet."
        renderItem={(service) => {
          const reserved = paidOfferIds.includes(service.service_offer_id)
          return (
            <div className="rounded-xl border border-slate-200 bg-white p-3">
              <div className="min-w-0">
                <p className="line-clamp-1 text-sm font-semibold text-slate-950">{service.capability_name}</p>
                <p className="mt-1 line-clamp-1 text-xs text-slate-500">
                  {service.offer_type && service.offer_type !== 'unknown' ? formatStatusLabel(service.offer_type) : 'Offer'}
                  {service.transaction_type ? ` • ${formatStatusLabel(service.transaction_type)}` : ''}
                  {service.city || service.state_province
                    ? ` • ${service.city || 'Any city'}${service.state_province ? `, ${service.state_province}` : ''}`
                    : ''}
                  {formatBudget(service.price_amount) ? ` • ${formatBudget(service.price_amount)}` : ''}
                </p>
              </div>
              {!payerVerified ? (
                <div className="mt-3">
                  <VerificationRequiredNotice description={CA_VERIFICATION_REQUIRED_TO_PAY_MESSAGE} />
                </div>
              ) : !leadAccepted ? (
                <p className="mt-2 line-clamp-1 text-xs text-slate-500">Pay and reserve once a lead NGO accepts this campaign.</p>
              ) : null}
              <Button
                type="button"
                size="sm"
                className="mt-3 w-full"
                disabled={
                  reserved ||
                  !actionsEnabled ||
                  !leadAccepted ||
                  !payerVerified ||
                  payingOfferId === service.service_offer_id
                }
                variant={reserved ? 'secondary' : 'default'}
                onClick={() => void onPayAndReserve(service.service_offer_id, service.offer_type)}
              >
                {payingOfferId === service.service_offer_id ? (
                  <>
                    <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                    Paying...
                  </>
                ) : reserved ? (
                  'Reserved'
                ) : (
                  'Pay & reserve'
                )}
              </Button>
              {reserved && paidRentals[service.service_offer_id] ? (
                <div className="mt-3">
                  <InlineCsrCapabilityDelhivery
                    campaignId={rentalCampaignId}
                    offerId={service.service_offer_id}
                    leg="outbound"
                    delivery={paidRentals[service.service_offer_id]?.outbound_delivery}
                    onUpdated={() => onRentalUpdated(service.service_offer_id)}
                  />
                </div>
              ) : null}
            </div>
          )
        }}
      />

      {acceptedLead ? (
        <LeadNgoConfirmedSection
          acceptedLead={acceptedLead}
          ngos={ngos}
          linkedProjectTitle={linkedProjectTitle}
        />
      ) : (
        <BrowseCatalogPanel
          title="NGOs"
          description="Invite one or more lead NGO candidates. They accept from their dashboard. You can publish only after a lead NGO accepts and is assigned."
          loading={loadingNgos}
          items={filteredNgos}
          getItemKey={(ngo) => String(ngo.id)}
          getSearchText={(ngo) =>
            `${ngo.name} ${ngo.email} ${ngo.city || ''} ${ngo.state || ''} ${ngo.focus_areas || ''}`
          }
          searchPlaceholder="Search NGOs"
          filters={ngoFilters}
          empty="No NGOs are registered on the platform yet."
          renderItem={(ngo) => {
            const isInvited = invites.some((item) => item.ngoId === ngo.id && isPendingLeadInvite(item))
            return (
              <div className="rounded-xl border border-slate-200 bg-white p-3">
                <div className="min-w-0">
                  <VerifiedAccountName
                    name={ngo.name}
                    status={ngo.verification_status}
                    verified={ngo.verified}
                    size="xs"
                    nameClassName="text-sm font-semibold text-slate-950"
                    className="max-w-full"
                  />
                  <p className="mt-1 line-clamp-1 text-xs text-slate-500">{ngo.email || 'No email provided'}</p>
                  <p className="mt-1 line-clamp-1 text-xs text-slate-500">
                    {[ngo.city, ngo.state].filter(Boolean).join(', ') || 'Location unavailable'}
                    {parseFocusAreas(ngo.focus_areas)[0] ? ` • ${parseFocusAreas(ngo.focus_areas)[0]}` : ''}
                  </p>
                </div>
                <div className="mt-3 flex items-center gap-2">
                  {isInvited ? (
                    <span className="rounded-full bg-blue-50 px-2 py-1 text-xs font-semibold text-blue-700">Invited</span>
                  ) : null}
                  <Button
                    type="button"
                    size="sm"
                    className={isInvited ? 'ml-auto border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700' : 'ml-auto'}
                    disabled={!actionsEnabled}
                    variant="outline"
                    onClick={() => onToggleInvite(ngo)}
                  >
                    {isInvited ? 'Remove' : 'Invite'}
                  </Button>
                </div>
              </div>
            )
          }}
        />
      )}
      {inviteError ? (
        <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{inviteError}</p>
      ) : null}
    </aside>
  )
}
