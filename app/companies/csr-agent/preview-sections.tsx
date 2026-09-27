"use client"

import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { InlineCsrCapabilityDelhivery } from "@/components/service-card"
import { VerifiedAccountName } from "@/components/verification-badge"
import { AGENT_NAMES } from "@/lib/ai-agent-sessions"
import type { CsrCapabilityRentalRecord } from "@/lib/service-engagement"
import { isPendingLeadInvite } from "./helpers"
import type {
  GeneratedCampaign,
  LeadNgoInvite,
  NgoDirectoryItem,
  ProjectSuggestion,
  ServiceSuggestion,
} from "./session"

export function ProjectSuggestionsSection({
  suggestions,
  loading,
  selectedId,
  onSelect,
}: {
  suggestions: ProjectSuggestion[]
  loading: boolean
  selectedId: string | null
  onSelect: (project: ProjectSuggestion) => void
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-950">Existing project suggestions</p>
          <p className="mt-1 text-xs text-slate-500">Optional. Pick an existing NGO project if it already matches the campaign you want to run.</p>
        </div>
        {loading && <Loader2 className="h-4 w-4 animate-spin text-slate-500" />}
      </div>
      <div className="mt-3 space-y-2">
        {suggestions.length > 0 ? (
          suggestions.map((project) => (
            <div key={project.id} className={`rounded-xl border bg-white p-3 ${selectedId === project.id ? 'border-emerald-300 bg-emerald-50' : 'border-slate-200'}`}>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-950">{project.title}</p>
                  <p className="mt-1 text-xs text-slate-600 break-words">{project.description || 'No description available.'}</p>
                  <p className="mt-1 text-xs text-slate-500">{project.location || 'Location unavailable'}{project.timeline ? ` • ${project.timeline}` : ''}</p>
                </div>
                <Button type="button" size="sm" className="shrink-0 whitespace-nowrap self-start" variant={selectedId === project.id ? 'secondary' : 'outline'} onClick={() => onSelect(project)}>
                  {selectedId === project.id ? 'Selected' : 'Use project'}
                </Button>
              </div>
            </div>
          ))
        ) : (
          <div className="rounded-xl border border-dashed border-slate-200 bg-white p-4 text-sm text-slate-500">
            {loading ? 'Searching for similar projects...' : 'No matching existing projects found yet. Continue with manual details.'}
          </div>
        )}
      </div>
    </div>
  )
}

export function LeadNgoConfirmedSection({
  acceptedLead,
  ngos,
  linkedProjectTitle,
}: {
  acceptedLead: LeadNgoInvite | null
  ngos: NgoDirectoryItem[]
  linkedProjectTitle: string | null
}) {
  const leadNgo = ngos.find((ngo) => ngo.id === acceptedLead?.ngoId)
  return (
    <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
      <p className="text-sm font-semibold text-emerald-950">Lead NGO confirmed</p>
      <p className="mt-1 flex flex-wrap items-center gap-1 text-sm text-emerald-800">
        <VerifiedAccountName
          name={acceptedLead?.name || 'Lead NGO'}
          status={leadNgo?.verification_status}
          verified={leadNgo?.verified}
          size="xs"
          nameClassName="font-semibold text-emerald-950"
        />
        <span>has accepted and is assigned as lead NGO for this campaign.</span>
      </p>
      {linkedProjectTitle ? (
        <p className="mt-2 text-xs text-emerald-700">
          Linked project: {linkedProjectTitle}
        </p>
      ) : null}
    </div>
  )
}

export function ServiceMatchesSection({
  suggestions,
  loading,
  error,
  actionsEnabled,
  leadAccepted,
  payingOfferId,
  paidOfferIds,
  paidRentals,
  rentalCampaignId,
  onPayAndReserve,
  onRentalUpdated,
}: {
  suggestions: ServiceSuggestion[]
  loading: boolean
  error: string | null
  actionsEnabled: boolean
  leadAccepted: boolean
  payingOfferId: number | null
  paidOfferIds: number[]
  paidRentals: Record<number, CsrCapabilityRentalRecord>
  rentalCampaignId: string
  onPayAndReserve: (offerId: number, offerType?: string) => void | Promise<void>
  onRentalUpdated: (offerId: number) => void | Promise<void>
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-slate-950">{AGENT_NAMES.pulse} matches</p>
        {loading && <Loader2 className="h-4 w-4 animate-spin text-slate-500" />}
      </div>
      {!leadAccepted && suggestions.length > 0 ? (
        <p className="mt-1 text-xs text-slate-500">You can pay and reserve these offers once a lead NGO accepts the campaign.</p>
      ) : null}
      <div className="mt-3 space-y-3">
        {error ? (
          <div className="rounded-xl border border-red-200 bg-white p-3 text-sm text-red-700">{error}</div>
        ) : suggestions.length > 0 ? (
          suggestions.slice(0, 3).map((service) => (
            <div key={service.service_offer_id} className="rounded-xl border border-slate-200 bg-white p-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-950">{service.capability_name}</p>
                  <p className="mt-1 text-xs text-slate-500">Offer #{service.service_offer_id} • {service.offer_type}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2 self-start">
                  <span className="whitespace-nowrap rounded-full bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-700">Score {service.score}</span>
                  <Button
                    type="button"
                    size="sm"
                    className="whitespace-nowrap"
                    disabled={
                      paidOfferIds.includes(service.service_offer_id) ||
                      !actionsEnabled ||
                      !leadAccepted ||
                      payingOfferId === service.service_offer_id
                    }
                    variant={paidOfferIds.includes(service.service_offer_id) ? 'secondary' : 'default'}
                    onClick={() => void onPayAndReserve(service.service_offer_id, service.offer_type)}
                  >
                    {payingOfferId === service.service_offer_id ? (
                      <>
                        <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                        Paying...
                      </>
                    ) : paidOfferIds.includes(service.service_offer_id) ? (
                      'Reserved'
                    ) : (
                      'Pay & reserve'
                    )}
                  </Button>
                </div>
              </div>
              <p className="mt-2 text-xs text-slate-600 break-words">{service.city || "Any city"} • {service.state_province || "Any state"}</p>
              {paidOfferIds.includes(service.service_offer_id) && paidRentals[service.service_offer_id] ? (
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
          ))
        ) : (
          <div className="rounded-xl border border-dashed border-slate-200 bg-white p-4 text-sm text-slate-500">
            {loading
              ? `${AGENT_NAMES.pulse} is finding capability offers...`
              : `No strong capability matches from ${AGENT_NAMES.pulse} yet. You can still continue without inviting offers.`}
          </div>
        )}
      </div>
    </div>
  )
}

export function LeadNgoSection({
  ngos,
  loading,
  invites,
  actionsEnabled,
  onToggleInvite,
}: {
  ngos: NgoDirectoryItem[]
  loading: boolean
  invites: LeadNgoInvite[]
  actionsEnabled: boolean
  onToggleInvite: (ngo: NgoDirectoryItem) => void | Promise<void>
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-950">Possible Lead NGOs</p>
          <p className="mt-1 text-xs text-slate-500">Invite one or more lead NGO candidates. They accept from their dashboard. You can publish only after a lead NGO accepts and is assigned.</p>
        </div>
        {loading && <Loader2 className="h-4 w-4 animate-spin text-slate-500" />}
      </div>
      <div className="mt-3 space-y-2">
        {ngos.length > 0 ? ngos.slice(0, 5).map((ngo) => {
          const isInvited = invites.some((item) => item.ngoId === ngo.id && isPendingLeadInvite(item))
          return (
            <div key={ngo.id} className="rounded-xl border border-slate-200 bg-white p-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <VerifiedAccountName
                    name={ngo.name}
                    status={ngo.verification_status}
                    verified={ngo.verified}
                    size="xs"
                    nameClassName="text-sm font-semibold text-slate-950"
                    className="max-w-full"
                  />
                  <p className="mt-1 text-xs text-slate-500 break-words">{ngo.email || 'No email provided'}</p>
                  <p className="mt-1 text-[11px] font-medium text-blue-700">Match score {ngo.score}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2 self-start">
                  {isInvited && (
                    <span className="whitespace-nowrap rounded-full bg-blue-50 px-2 py-1 text-xs font-semibold text-blue-700">Invited</span>
                  )}
                  <Button
                    type="button"
                    size="sm"
                    className={isInvited ? 'whitespace-nowrap border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700' : 'whitespace-nowrap'}
                    disabled={!actionsEnabled}
                    variant="outline"
                    onClick={() => onToggleInvite(ngo)}
                  >
                    {isInvited ? 'Remove' : 'Invite'}
                  </Button>
                </div>
              </div>
            </div>
          )
        }) : (
          <div className="rounded-xl border border-dashed border-slate-200 bg-white p-4 text-sm text-slate-500">
            {loading
              ? 'Loading lead NGO suggestions...'
              : 'No NGOs are registered on the platform yet.'}
          </div>
        )}
      </div>
    </div>
  )
}

export function PublishStatusSection({
  generating,
  campaigns,
  error,
  invites,
  acceptedLead,
  leadLocked,
  questionnaireComplete,
  actionsEnabled,
  onPublish,
}: {
  generating: boolean
  campaigns: GeneratedCampaign[]
  error: string | null
  invites: LeadNgoInvite[]
  acceptedLead: LeadNgoInvite | null
  leadLocked: boolean
  questionnaireComplete: boolean
  actionsEnabled: boolean
  onPublish: () => void | Promise<void>
}) {
  return (
    <div className="rounded-2xl border border-blue-200 bg-white p-4 shadow-sm">
      {generating ? (
        <div className="flex items-center gap-3 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-slate-700">
          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-[#1d4ed8]" />
          Generating your campaign draft...
        </div>
      ) : acceptedLead && campaigns.length > 0 ? (
        <div className="flex flex-col gap-3 rounded-xl border border-gram-border bg-gram-sage px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm font-semibold text-slate-900">
            Ready to publish!
          </p>
          <Button
            type="button"
            className="shrink-0 bg-[#1d4ed8] text-white hover:bg-[#1e40af]"
            onClick={onPublish}
            disabled={!actionsEnabled}
          >
            Publish
          </Button>
        </div>
      ) : acceptedLead ? (
        <div className="flex items-center gap-3 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-slate-700">
          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-[#1d4ed8]" />
          {acceptedLead.name} accepted. Generating your campaign draft...
        </div>
      ) : questionnaireComplete && invites.some(isPendingLeadInvite) ? (
        <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-slate-700">
          Waiting for a lead NGO to accept the invite from their dashboard.
        </div>
      ) : questionnaireComplete && !leadLocked ? (
        <div className="rounded-xl border border-dashed border-blue-200 bg-blue-50/40 px-4 py-3 text-sm text-slate-600">
          Invite at least one lead NGO above. Once they accept from their dashboard, your campaign draft will be generated and you can publish.
        </div>
      ) : null}
      {error ? (
        <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
      ) : null}
    </div>
  )
}
