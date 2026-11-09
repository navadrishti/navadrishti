"use client"

import Link from "next/link"
import { useState } from "react"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { InlineCsrCapabilityDelhivery } from "@/components/service-card"
import { VerificationRequiredNotice } from "@/components/verification-required-notice"
import { VerifiedAccountName } from "@/components/verification-badge"
import { CA_VERIFICATION_REQUIRED_TO_PAY_MESSAGE } from "@/lib/auth"
import { MatchHeading, MATCH_CARD_CLASS, MATCH_PANEL_CLASS, MATCH_SCORE_CLASS } from "@/components/agent-shell"
import { SuggestionDisclaimer } from "@/components/agent-guidance"
import { EvidenceVerifierSelect } from "@/components/evidence-verifier-select"
import { AGENT_NAMES } from "@/lib/ai-agent-sessions"
import { formatStatusLabel } from "@/lib/format-date"
import type { CsrCapabilityRentalRecord } from "@/lib/service-engagement"
import { isPendingLeadInvite } from "./helpers"
import {
  formatCurrency,
  type GeneratedCampaign,
  type LeadNgoInvite,
  type NgoDirectoryItem,
  type ProjectSuggestion,
  type ServiceSuggestion,
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
              <p className="text-sm font-semibold leading-5 text-slate-950 [overflow-wrap:anywhere]">{project.title}</p>
              <p className="mt-1 text-xs leading-5 text-slate-600 [overflow-wrap:anywhere]">{project.description || 'No description available.'}</p>
              <p className="mt-1 text-xs leading-5 text-slate-500 [overflow-wrap:anywhere]">{project.location || 'Location unavailable'}{project.timeline ? ` • ${project.timeline}` : ''}</p>
              <Button type="button" size="sm" className="mt-3 w-full" variant={selectedId === project.id ? 'secondary' : 'outline'} onClick={() => onSelect(project)}>
                {selectedId === project.id ? 'Selected' : 'Use project'}
              </Button>
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
    <div className="rounded-2xl border border-[#2B3E41]/25 bg-[#2B3E41] p-4 text-white shadow-sm">
      <p className="text-sm font-semibold text-white">Lead NGO confirmed</p>
      <p className="mt-1 flex flex-wrap items-center gap-1 text-sm text-white/85">
        <VerifiedAccountName
          name={acceptedLead?.name || 'Lead NGO'}
          status={leadNgo?.verification_status}
          verified={leadNgo?.verified}
          size="xs"
          nameClassName="font-semibold text-white"
        />
        <span>has accepted and is assigned as lead NGO for this campaign.</span>
      </p>
      {linkedProjectTitle ? (
        <p className="mt-2 text-xs text-white/70">
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
  payerVerified = true,
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
  payerVerified?: boolean
}) {
  return (
    <div className={MATCH_PANEL_CLASS}>
      <MatchHeading
        title={`${AGENT_NAMES.pulse} matches`}
        description={!payerVerified || leadAccepted || suggestions.length === 0 ? undefined : 'You can pay and reserve these offers once a lead NGO accepts the campaign.'}
        loading={loading}
      />
      <SuggestionDisclaimer>
        Match scores are recommendations from marketplace data. They are not verified assignments until you reserve or publish through platform workflows.
      </SuggestionDisclaimer>
      {!payerVerified && suggestions.length > 0 ? (
        <div className="mt-3">
          <VerificationRequiredNotice description={CA_VERIFICATION_REQUIRED_TO_PAY_MESSAGE} />
        </div>
      ) : null}
      <div className="mt-3 space-y-3">
        {error ? (
          <div className="rounded-xl border border-red-200 bg-white p-3 text-sm text-red-700">{error}</div>
        ) : suggestions.length > 0 ? (
          suggestions.slice(0, 3).map((service) => (
            <div key={service.service_offer_id} className={MATCH_CARD_CLASS}>
              <div className="flex items-start gap-2">
                <p className="min-w-0 flex-1 text-sm font-semibold leading-5 text-slate-950 [overflow-wrap:anywhere]">{service.capability_name}</p>
                <span className={MATCH_SCORE_CLASS}>Score {service.score}</span>
              </div>
              <p className="mt-1 text-xs leading-5 text-slate-500 [overflow-wrap:anywhere]">
                Offer #{service.service_offer_id}
                {service.offer_type && service.offer_type !== "unknown" ? ` • ${formatStatusLabel(service.offer_type)}` : ""}
              </p>
              <p className="mt-1 text-xs leading-5 text-slate-600 [overflow-wrap:anywhere]">{service.city || "Any city"} • {service.state_province || "Any state"}</p>
              <Button
                type="button"
                size="sm"
                className="mt-3 w-full"
                disabled={
                  paidOfferIds.includes(service.service_offer_id) ||
                  !actionsEnabled ||
                  !leadAccepted ||
                  !payerVerified ||
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
          <p className="mt-1 text-xs text-slate-500">Invite one or more lead NGO candidates. They accept from their dashboard. After acceptance, allot an Evidence Verifier — then Catalyst drafts for publish.</p>
        </div>
        {loading && <Loader2 className="h-4 w-4 animate-spin text-slate-500" />}
      </div>
      <div className="mt-3 space-y-2">
        {ngos.length > 0 ? ngos.slice(0, 5).map((ngo) => {
          const isInvited = invites.some((item) => item.ngoId === ngo.id && isPendingLeadInvite(item))
          return (
            <div key={ngo.id} className="rounded-xl border border-slate-200 bg-white p-3">
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <VerifiedAccountName
                    name={ngo.name}
                    status={ngo.verification_status}
                    verified={ngo.verified}
                    size="xs"
                    nameClassName="text-sm font-semibold text-slate-950"
                    className="max-w-full"
                  />
                </div>
                {isInvited ? (
                  <span className="shrink-0 rounded-full bg-udaan-cream px-2 py-0.5 text-[11px] font-semibold leading-4 text-primary">Invited</span>
                ) : null}
              </div>
              <p className="mt-1 text-xs leading-5 text-slate-500 [overflow-wrap:anywhere]">{ngo.email || 'No email provided'}</p>
              <p className="mt-1 text-[11px] font-medium text-blue-700">Match score {ngo.score}</p>
              <Button
                type="button"
                size="sm"
                className={isInvited ? 'mt-3 w-full border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700' : 'mt-3 w-full'}
                disabled={!actionsEnabled}
                variant="outline"
                onClick={() => onToggleInvite(ngo)}
              >
                {isInvited ? 'Remove' : 'Invite'}
              </Button>
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
  publishing = false,
  publishedCampaignId = null,
  evidenceVerifierIdentityId = '',
  onEvidenceVerifierChange,
  onPublish,
  onRetry,
}: {
  generating: boolean
  campaigns: GeneratedCampaign[]
  error: string | null
  invites: LeadNgoInvite[]
  acceptedLead: LeadNgoInvite | null
  leadLocked: boolean
  questionnaireComplete: boolean
  actionsEnabled: boolean
  publishing?: boolean
  publishedCampaignId?: string | null
  evidenceVerifierIdentityId?: string
  onEvidenceVerifierChange?: (identityId: string) => void
  onPublish: () => void | Promise<void>
  onRetry?: () => void | Promise<void>
}) {
  const [reviewOpen, setReviewOpen] = useState(false)
  const draft = campaigns[0] || null
  const hasEvidenceVerifier = Boolean(String(evidenceVerifierIdentityId || "").trim())
  const generationFailed =
    Boolean(error) && Boolean(acceptedLead) && hasEvidenceVerifier && campaigns.length === 0 && !generating
  const canPublish =
    actionsEnabled &&
    Boolean(acceptedLead) &&
    hasEvidenceVerifier &&
    !publishing

  const openReview = () => {
    if (!canPublish || !draft) return
    setReviewOpen(true)
  }

  const confirmPublish = async () => {
    await onPublish()
    setReviewOpen(false)
  }

  return (
    <div className="rounded-2xl border border-[#2B3E41]/25 bg-[#2B3E41] p-4 text-white shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-white">Publish</p>
        <span className="text-xs text-white/70">
          {publishedCampaignId ? "Published" : campaigns.length > 0 ? "Draft ready" : "Waiting"}
        </span>
      </div>
      {acceptedLead && !publishedCampaignId && onEvidenceVerifierChange ? (
        <div className="mb-3 rounded-xl border border-white/15 bg-white/95 p-3 text-slate-900">
          <EvidenceVerifierSelect
            enabled
            value={evidenceVerifierIdentityId}
            onChange={(identityId) => onEvidenceVerifierChange(identityId)}
            disabled={publishing || generating}
          />
        </div>
      ) : null}
      {generating ? (
        <div className="flex w-full items-start gap-3 rounded-xl border border-white/15 bg-white/10 px-4 py-3 text-sm leading-5 text-white">
          <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-[#93c5fd]" />
          <p className="min-w-0 flex-1">Catalyst is assembling your campaign draft from the intake and milestones.</p>
        </div>
      ) : publishedCampaignId ? (
        <div className="flex w-full flex-col gap-3 rounded-xl border border-white/15 bg-white/10 p-4">
          <p className="text-sm font-semibold text-white">This campaign is live on CSR Campaigns.</p>
          <Button asChild variant="outline" className="w-full shrink-0 border-white/30 bg-white text-[#1d4ed8] hover:bg-slate-50">
            <Link href={`/csr-campaigns/${publishedCampaignId}`}>View campaign</Link>
          </Button>
        </div>
      ) : acceptedLead && draft ? (
        <div className="flex w-full flex-col gap-3 rounded-xl border border-white/15 bg-white/10 p-4">
          <div className="min-w-0 space-y-2">
            <p className="text-sm font-semibold leading-5 text-white">Draft ready for review</p>
            <p className="text-xs leading-5 text-white/75">
              Open the draft review to check title, budget, milestones, lead NGO, and Evidence Verifier before publishing.
            </p>
          </div>
          <Button
            type="button"
            className="w-full shrink-0 bg-[#1d4ed8] text-white hover:bg-[#1e40af]"
            onClick={openReview}
            disabled={!canPublish}
          >
            {publishing ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Publishing...
              </>
            ) : (
              "Review and publish"
            )}
          </Button>
        </div>
      ) : generationFailed ? (
        <div className="flex w-full flex-col gap-3 rounded-xl border border-red-300/40 bg-red-950/40 p-4">
          <div className="min-w-0 space-y-1">
            <p className="text-sm font-semibold text-red-100">Draft generation incomplete</p>
            <p className="text-sm leading-5 text-red-100/90">{error}</p>
          </div>
          {onRetry && (
            <Button type="button" variant="outline" className="w-full shrink-0 border-white/30 bg-white text-[#1d4ed8]" onClick={onRetry}>
              Try again
            </Button>
          )}
        </div>
      ) : acceptedLead && !hasEvidenceVerifier ? (
        <div className="rounded-xl border border-amber-200/40 bg-amber-950/30 px-4 py-3 text-sm leading-5 text-amber-50">
          {acceptedLead.name} accepted as lead NGO. Allot an Evidence Verifier above — Catalyst starts drafting only after that assignment.
        </div>
      ) : acceptedLead ? (
        <div className="flex w-full items-start gap-3 rounded-xl border border-white/15 bg-white/10 px-4 py-3 text-sm leading-5 text-white">
          <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-[#93c5fd]" />
          <p className="min-w-0 flex-1">Evidence Verifier allotted. Catalyst is assembling your campaign draft…</p>
        </div>
      ) : questionnaireComplete && invites.some(isPendingLeadInvite) ? (
        <div className="rounded-xl border border-white/15 bg-white/10 px-4 py-3 text-sm leading-5 text-white/90">
          Waiting for a lead NGO to accept the invite from their dashboard. After acceptance, allot an Evidence Verifier so Catalyst can draft.
        </div>
      ) : questionnaireComplete && !leadLocked ? (
        <div className="rounded-xl border border-dashed border-white/25 bg-white/5 px-4 py-3 text-sm leading-5 text-white/80">
          Invite at least one lead NGO above. Once they accept, allot an Evidence Verifier — then Catalyst will assemble the draft for publish.
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-white/25 bg-white/5 px-4 py-3 text-sm leading-5 text-white/75">
          Answer the remaining questions in the chat. After a lead NGO accepts and you allot an Evidence Verifier, Catalyst prepares the draft here.
        </div>
      )}
      {error && !generationFailed ? (
        <div className="mt-3 rounded-xl border border-red-300/40 bg-red-950/40 p-3 text-sm text-red-100">{error}</div>
      ) : null}

      <Dialog open={reviewOpen} onOpenChange={(open) => !publishing && setReviewOpen(open)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Review campaign draft</DialogTitle>
            <DialogDescription>
              Check the assembled draft below. Publishing creates live campaign records.
            </DialogDescription>
          </DialogHeader>

          {draft ? (
            <div className="space-y-4 text-sm text-slate-700">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-base font-semibold text-slate-950">{draft.title}</p>
                <p className="mt-2 leading-5 text-slate-600">{draft.description}</p>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <p><span className="font-medium text-slate-900">Category:</span> {draft.category || '—'}</p>
                  <p><span className="font-medium text-slate-900">Location:</span> {draft.location || '—'}</p>
                  <p><span className="font-medium text-slate-900">Budget:</span> {formatCurrency(draft.budget_inr || 0)}</p>
                  <p><span className="font-medium text-slate-900">Timeline:</span> {draft.start_date || '—'} → {draft.end_date || '—'}</p>
                  <p><span className="font-medium text-slate-900">Lead NGO:</span> {acceptedLead?.name || '—'}</p>
                  <p><span className="font-medium text-slate-900">Beneficiaries:</span> {draft.impact_metrics?.beneficiaries ?? '—'}</p>
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <p className="font-semibold text-slate-950">Milestones ({draft.milestones?.length || 0})</p>
                <div className="mt-3 space-y-2">
                  {(draft.milestones || []).map((milestone, index) => (
                    <div key={`${milestone.title}-${index}`} className="rounded-lg border border-slate-100 bg-slate-50 p-3">
                      <p className="font-medium text-slate-900">
                        {index + 1}. {milestone.title || `Milestone ${index + 1}`}
                      </p>
                      {milestone.description ? (
                        <p className="mt-1 text-xs leading-5 text-slate-600">{milestone.description}</p>
                      ) : null}
                      <p className="mt-1 text-xs text-slate-500">
                        {formatCurrency(Number(milestone.budget_allocated) || 0)}
                        {milestone.start_date && milestone.end_date ? ` • ${milestone.start_date} to ${milestone.end_date}` : ''}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : null}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" disabled={publishing} onClick={() => setReviewOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              className="bg-[#1d4ed8] text-white hover:bg-[#1e40af]"
              disabled={publishing || !canPublish}
              onClick={() => void confirmPublish()}
            >
              {publishing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Publishing...
                </>
              ) : (
                'Confirm publish'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
