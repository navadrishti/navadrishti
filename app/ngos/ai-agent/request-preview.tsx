"use client"

import Link from "next/link"
import { CheckCircle2, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { VerifiedAccountName } from "@/components/verification-badge"
import { AGENT_NAMES } from "@/lib/ai-agent-sessions"
import {
  type NeedIntakeData,
  type ProjectIntakeData,
  type RelatedOfferEntry,
  type ServiceRequestDraftPayload,
  getNeedQuestions,
  normalizeRequestType,
  projectQuestions,
} from "./intake"

type IntakePath = 'need' | 'project' | null

type GeneratedNeedCardProps = {
  need: ServiceRequestDraftPayload['needs'][number]
  index: number
  relatedOffers: RelatedOfferEntry[]
  selectedIds: number[]
  offersLoading: boolean
  onInviteAll: (needIndex: number) => void
  onClearInvites: (needIndex: number) => void
  onToggleInvite: (needIndex: number, offerId: number) => void
}

function GeneratedNeedCard({
  need,
  index,
  relatedOffers,
  selectedIds,
  offersLoading,
  onInviteAll,
  onClearInvites,
  onToggleInvite,
}: GeneratedNeedCardProps) {
  const allInvited = relatedOffers.length > 0 && relatedOffers.every((entry) => selectedIds.includes(entry.offer.id))

  return (
    <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
      <p className="text-sm font-semibold text-slate-900 break-words">Need {index + 1}: {need.title}</p>
      <p className="text-xs text-slate-600 break-words">{need.request_type} • {need.urgency} • {need.beneficiary_count} beneficiaries</p>

      <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-semibold uppercase tracking-[0.15em] text-slate-500">Related offers</p>
          <span className="text-xs text-slate-500">
            Invited {selectedIds.length}
          </span>
        </div>

        <div className="mt-2 flex items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => onInviteAll(index)}
            disabled={relatedOffers.length === 0 || allInvited}
          >
            {allInvited ? 'All Invited' : 'Invite All'}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => onClearInvites(index)}
            disabled={selectedIds.length === 0}
          >
            Clear
          </Button>
        </div>

        {allInvited && (
          <div className="mt-2 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1.5 text-xs text-emerald-700">
            All related offers are invited for this need.
          </div>
        )}

        <div className="mt-2 space-y-2">
          {offersLoading ? (
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Loading related offers...
            </div>
          ) : relatedOffers.length === 0 ? (
            <p className="text-xs text-slate-500">No active offers found for this need type yet.</p>
          ) : (
            relatedOffers.map((entry) => {
              const invited = selectedIds.includes(entry.offer.id)
              return (
                <div key={`need-${index}-offer-${entry.offer.id}`} className="rounded-md border border-slate-200 bg-white px-3 py-2">
                  <p className="text-xs font-semibold text-slate-900">{entry.offer.title || `Offer #${entry.offer.id}`}</p>
                  <p className="mt-1 flex flex-wrap items-center gap-1 text-[11px] text-slate-600">
                    <VerifiedAccountName
                      name={entry.offer.provider_name || entry.offer.ngo_name || 'Offer provider'}
                      status={entry.offer.verification_status}
                      verified={entry.offer.verified}
                      size="xs"
                      nameClassName="font-medium text-slate-700"
                    />
                    <span>• Score {entry.score}</span>
                  </p>
                  <div className="mt-2 flex items-center gap-2">
                    <Button type="button" size="sm" variant={invited ? 'default' : 'outline'} onClick={() => onToggleInvite(index, entry.offer.id)}>
                      {invited ? 'Invited' : 'Invite'}
                    </Button>
                    <Button type="button" size="sm" variant="ghost" asChild>
                      <Link href={`/service-offers/${entry.offer.id}`}>
                        Apply
                      </Link>
                    </Button>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}

type RequestPreviewProps = {
  generatedDraft: ServiceRequestDraftPayload | null
  intakePath: IntakePath
  projectData: ProjectIntakeData
  needsData: NeedIntakeData[]
  answeredQuestions: number
  answeredProjectQuestions: number
  relatedOffersByNeed: Record<number, RelatedOfferEntry[]>
  selectedOfferIdsByNeed: Record<number, number[]>
  offersLoading: boolean
  publishingDraft: boolean
  onInviteAll: (needIndex: number) => void
  onClearInvites: (needIndex: number) => void
  onToggleInvite: (needIndex: number, offerId: number) => void
  onPublish: () => void
}

export function RequestPreview({
  generatedDraft,
  intakePath,
  projectData,
  needsData,
  answeredQuestions,
  answeredProjectQuestions,
  relatedOffersByNeed,
  selectedOfferIdsByNeed,
  offersLoading,
  publishingDraft,
  onInviteAll,
  onClearInvites,
  onToggleInvite,
  onPublish,
}: RequestPreviewProps) {
  const liveFields = intakePath === 'need'
    ? [
        { label: 'Need title', value: needsData[0]?.title },
        { label: 'Need type', value: needsData[0]?.requestType },
        { label: 'Timeline', value: needsData[0]?.timeline },
        { label: 'Beneficiaries', value: needsData[0]?.beneficiaryCount },
      ].filter((item) => Boolean(item.value))
    : [
        { label: 'Project title', value: projectData.projectTitle },
        { label: 'Project category', value: projectData.projectCategory },
        { label: 'Project location', value: projectData.location },
        { label: 'Project timeline', value: projectData.timeline },
        { label: 'Beneficiaries', value: projectData.expectedBeneficiaries },
      ].filter((item) => Boolean(item.value))

  const completedNeeds = needsData.filter((need) => {
    const requiredFields = getNeedQuestions(need.requestType)
    return requiredFields.every((field) => String(need[field.key as keyof NeedIntakeData] || '').trim())
  })

  const generatedFields = generatedDraft
    ? intakePath === 'need'
      ? [
          { label: 'Need', value: generatedDraft.needs[0]?.title || 'N/A' },
          { label: 'Type', value: generatedDraft.needs[0]?.request_type || 'N/A' },
          { label: 'Category', value: generatedDraft.needs[0]?.category || 'N/A' },
          { label: 'Urgency', value: generatedDraft.needs[0]?.urgency || 'N/A' },
        ]
      : [
          { label: 'Project', value: generatedDraft.project.title },
          { label: 'Category', value: generatedDraft.project.category },
          { label: 'Location', value: generatedDraft.project.location },
          { label: 'Timeline', value: generatedDraft.project.timeline },
        ]
    : []

  return (
    <Card className="flex h-auto min-h-0 flex-col overflow-hidden border-slate-200/70 bg-white/90 shadow-[0_18px_50px_rgba(15,23,42,0.08)] backdrop-blur max-md:[overflow-anchor:none] md:h-full">
      <CardHeader className="border-b border-slate-100">
        <CardTitle className="text-slate-950">Request Preview</CardTitle>
        <CardDescription className="text-slate-600">
          {generatedDraft
            ? 'Your multi-need service request draft is ready.'
            : answeredQuestions === 0
              ? 'Draft details will appear here as you chat.'
              : 'Building your request draft in real time.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-5">
        <div className="space-y-5">
          {generatedDraft ? (
            <>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Project title</p>
                <h3 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
                  {generatedDraft.project.title}
                </h3>
                <p className="mt-3 text-sm leading-6 text-slate-600 break-words whitespace-normal">{generatedDraft.project.description}</p>
              </div>

              <div className="rounded-2xl border border-slate-200 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Generated needs</p>
                <div className="mt-4 space-y-3">
                  {generatedFields.slice(2).map((field) => (
                    <div key={field.label} className="flex items-start justify-between gap-4">
                      <span className="text-sm font-medium text-slate-500">{field.label}</span>
                      <span className="max-w-[60%] text-right text-sm font-semibold text-slate-900 break-words">{field.value}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Need list</p>
                <div className="mt-3 space-y-2">
                  {generatedDraft.needs.map((need, index) => (
                    <GeneratedNeedCard
                      key={`generated-need-${index}`}
                      need={need}
                      index={index}
                      relatedOffers={relatedOffersByNeed[index] || []}
                      selectedIds={selectedOfferIdsByNeed[index] || []}
                      offersLoading={offersLoading}
                      onInviteAll={onInviteAll}
                      onClearInvites={onClearInvites}
                      onToggleInvite={onToggleInvite}
                    />
                  ))}
                </div>
              </div>

              <div className="rounded-2xl bg-gradient-to-r from-slate-950 to-slate-900 p-4 text-white">
                <div className="flex items-center gap-2 text-sm font-semibold text-white/70">
                  <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                  Draft complete
                </div>
                <Button
                  className="mt-4 w-full rounded-xl bg-white text-slate-950"
                  onClick={onPublish}
                  disabled={publishingDraft}
                >
                  {publishingDraft ? 'Publishing...' : intakePath === 'need' ? 'Publish Need' : 'Publish Project'}
                </Button>
              </div>
            </>
          ) : (
            <>
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4">
                <div className="space-y-2">
                  <div className="text-sm font-medium text-slate-500">Project title</div>
                  <div className="text-lg font-semibold text-slate-900">
                    {projectData.projectTitle || 'Waiting for the first answer'}
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                <div className="flex items-start justify-between gap-4">
                  <span className="text-sm font-medium text-slate-500">
                    {intakePath === 'need' ? 'Need progress' : intakePath === 'project' ? 'Project progress' : 'Progress'}
                  </span>
                  <span className="text-right text-sm font-semibold text-slate-900">
                    {intakePath === 'need'
                      ? `${completedNeeds.length} / 1`
                      : intakePath === 'project'
                        ? `${answeredProjectQuestions} / ${projectQuestions.length}`
                        : 'Choose Need or Project'}
                  </span>
                </div>
                {intakePath === 'need' && completedNeeds.length > 0 && (
                  <div className="mt-3 space-y-2">
                    {completedNeeds.map((need, index) => (
                      <div key={`completed-need-${index}`} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                        <p className="text-sm font-semibold text-slate-900">{need.title}</p>
                        <p className="text-xs text-slate-600">{normalizeRequestType(need.requestType)}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="space-y-3">
                {liveFields.length > 0 ? (
                  liveFields.map((field) => (
                    <div key={field.label} className="flex items-start justify-between gap-4 rounded-2xl border border-slate-200 bg-white px-4 py-3">
                      <span className="text-sm font-medium text-slate-500">{field.label}</span>
                      <span className="max-w-[60%] text-right text-sm font-semibold text-slate-900">
                        {field.value}
                      </span>
                    </div>
                  ))
                ) : (
                  <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-5 text-center text-slate-500">
                    <p className="text-sm font-medium text-slate-700">No draft fields yet.</p>
                    <p className="mt-1 text-sm leading-6 text-slate-500">
                      {AGENT_NAMES.atlas} will fill this card as soon as you answer the first prompt.
                    </p>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
