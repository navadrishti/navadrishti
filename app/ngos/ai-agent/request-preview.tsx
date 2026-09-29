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
  onApplyAll: (needIndex: number) => void
  onRemoveAll: (needIndex: number) => void
  onToggleOffer: (needIndex: number, offerId: number) => void
}

const REMOVE_BUTTON_CLASS = "border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"

function GeneratedNeedCard({
  need,
  index,
  relatedOffers,
  selectedIds,
  offersLoading,
  onApplyAll,
  onRemoveAll,
  onToggleOffer,
}: GeneratedNeedCardProps) {
  const allSelected = relatedOffers.length > 0 && relatedOffers.every((entry) => selectedIds.includes(entry.offer.id))
  const beneficiaries = Number(need.beneficiary_count) || 0
  const summary = [
    need.request_type,
    need.urgency,
    beneficiaries > 0 ? `${beneficiaries} beneficiar${beneficiaries === 1 ? 'y' : 'ies'}` : '',
  ].filter(Boolean).join(' • ')

  return (
    <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
      <p className="text-sm font-semibold text-slate-900 break-words">Need {index + 1}: {need.title || 'Untitled need'}</p>
      {summary && <p className="text-xs text-slate-600 break-words">{summary}</p>}

      <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-semibold uppercase tracking-[0.15em] text-slate-500">Related offers</p>
          <span className="text-xs text-slate-500">
            {selectedIds.length} selected
          </span>
        </div>
        <p className="mt-1 text-xs text-slate-500">Applications are sent to the selected offers when you publish.</p>

        <div className="mt-2 flex items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => onApplyAll(index)}
            disabled={relatedOffers.length === 0 || allSelected}
          >
            {allSelected ? 'All selected' : 'Apply to all'}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className={REMOVE_BUTTON_CLASS}
            onClick={() => onRemoveAll(index)}
            disabled={selectedIds.length === 0}
          >
            Remove all
          </Button>
        </div>

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
              const selected = selectedIds.includes(entry.offer.id)
              return (
                <div key={`need-${index}-offer-${entry.offer.id}`} className="rounded-md border border-slate-200 bg-white px-3 py-2">
                  <div className="flex items-start justify-between gap-2">
                    <Link href={`/service-offers/${entry.offer.id}`} className="text-xs font-semibold text-slate-900 hover:underline">
                      {entry.offer.title || `Offer #${entry.offer.id}`}
                    </Link>
                    {selected && (
                      <span className="whitespace-nowrap rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-700">Selected</span>
                    )}
                  </div>
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
                  <div className="mt-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className={selected ? REMOVE_BUTTON_CLASS : undefined}
                      onClick={() => onToggleOffer(index, entry.offer.id)}
                    >
                      {selected ? 'Remove' : 'Apply'}
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
  publishedProjectId?: string | null
  onApplyAll: (needIndex: number) => void
  onRemoveAll: (needIndex: number) => void
  onToggleOffer: (needIndex: number, offerId: number) => void
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
  publishedProjectId = null,
  onApplyAll,
  onRemoveAll,
  onToggleOffer,
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

  const generatedFields = (generatedDraft
    ? intakePath === 'need'
      ? [
          { label: 'Type', value: generatedDraft.needs[0]?.request_type },
          { label: 'Category', value: generatedDraft.needs[0]?.category },
          { label: 'Urgency', value: generatedDraft.needs[0]?.urgency },
        ]
      : [
          { label: 'Category', value: generatedDraft.project.category },
          { label: 'Location', value: generatedDraft.project.location },
          { label: 'Timeline', value: generatedDraft.project.timeline },
        ]
    : []
  ).filter((field) => String(field.value ?? '').trim())

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
                <h3 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950 [overflow-wrap:anywhere]">
                  {generatedDraft.project.title}
                </h3>
                {generatedDraft.project.description && (
                  <p className="mt-3 text-sm leading-6 text-slate-600 break-words whitespace-normal">{generatedDraft.project.description}</p>
                )}
              </div>

              {generatedFields.length > 0 && (
                <div className="rounded-2xl border border-slate-200 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                    {intakePath === 'need' ? 'Need details' : 'Project details'}
                  </p>
                  <div className="mt-4 space-y-3">
                    {generatedFields.map((field) => (
                      <div key={field.label} className="flex items-start justify-between gap-4">
                        <span className="text-sm font-medium text-slate-500">{field.label}</span>
                        <span className="max-w-[60%] text-right text-sm font-semibold text-slate-900 break-words">{field.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {generatedDraft.needs.length > 0 && (
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
                        onApplyAll={onApplyAll}
                        onRemoveAll={onRemoveAll}
                        onToggleOffer={onToggleOffer}
                      />
                    ))}
                  </div>
                </div>
              )}

              <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="flex items-center gap-2 text-sm font-semibold text-slate-950">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                    {publishedProjectId ? 'Published' : 'Draft complete'}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {publishedProjectId
                      ? 'This project is live. Start a new session to draft another request.'
                      : 'Review the details above, then publish when you are ready.'}
                  </p>
                </div>
                {publishedProjectId ? (
                  <Button asChild variant="outline" className="shrink-0">
                    <Link href={`/service-requests/projects/${publishedProjectId}`}>View project</Link>
                  </Button>
                ) : (
                  <Button
                    type="button"
                    className="shrink-0 bg-[#1d4ed8] text-white hover:bg-[#1e40af]"
                    onClick={onPublish}
                    disabled={publishingDraft}
                  >
                    {publishingDraft ? 'Publishing...' : intakePath === 'need' ? 'Publish Need' : 'Publish Project'}
                  </Button>
                )}
              </div>
            </>
          ) : (
            <>
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4">
                <div className="space-y-2">
                  <div className="text-sm font-medium text-slate-500">Project title</div>
                  <div className="text-lg font-semibold text-slate-900 [overflow-wrap:anywhere]">
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
                      <span className="max-w-[60%] text-right text-sm font-semibold text-slate-900 [overflow-wrap:anywhere]">
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
