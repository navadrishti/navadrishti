"use client"

import type React from "react"
import { Send } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { VerifiedAccountName } from "@/components/verification-badge"
import { AGENT_NAMES } from "@/lib/ai-agent-sessions"
import type { RelatedOfferEntry } from "./intake"

type ChatPanelProps = {
  isDraftComplete: boolean
  promptNumber: number
  promptCount: number
  activeQuestionLabel: string
  children: React.ReactNode
}

export function ChatPanel({ isDraftComplete, promptNumber, promptCount, activeQuestionLabel, children }: ChatPanelProps) {
  return (
    <Card className="flex h-[35rem] min-h-0 flex-col overflow-hidden border-slate-200/70 bg-white/90 shadow-[0_18px_50px_rgba(15,23,42,0.08)] backdrop-blur lg:h-full">
      <CardHeader className="border-b border-slate-100 bg-gradient-to-r from-white to-slate-50/80">
        <CardTitle className="text-slate-950">{AGENT_NAMES.atlas}</CardTitle>
        <CardDescription className="text-slate-600">
          Capture the project, need type, scale, and urgency step by step.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col p-0">
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex flex-col items-start gap-3 border-b border-slate-100 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                Conversation
              </p>
              <p className="mt-1 text-sm text-slate-600">
                {isDraftComplete ? 'Draft complete' : `Prompt ${promptNumber} of ${promptCount}`}
              </p>
            </div>
            <div className="max-w-full rounded-full bg-[#1d4ed8]/8 px-3 py-1 text-xs font-medium text-[#1d4ed8] sm:max-w-[50%]">
              {activeQuestionLabel}
            </div>
          </div>

          <div className="flex min-h-0 flex-1 flex-col px-4 py-4 sm:px-5 sm:py-5">
            {children}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

type NeedOfferSuggestionsProps = {
  needIndex: number
  offers: RelatedOfferEntry[]
  appliedOfferIds: number[]
  onApplyOffer: (offerId: number, needIndex: number) => void | Promise<void>
}

function NeedOfferSuggestions({ needIndex, offers, appliedOfferIds, onApplyOffer }: NeedOfferSuggestionsProps) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-3">
      <p className="text-sm font-semibold text-slate-900">Suggestions for Need {needIndex + 1}</p>
      <p className="text-xs text-slate-600">These offers may fulfill the need — invite or apply.</p>
      <div className="mt-3 space-y-2">
        {offers.map((entry) => {
          return (
            <div key={`chat-suggest-${entry.offer.id}`} className="flex items-center justify-between gap-3 rounded-md border border-slate-100 bg-slate-50 px-3 py-2">
              <div>
                <div className="text-sm font-semibold text-slate-900">{entry.offer.title || `Offer #${entry.offer.id}`}</div>
                <div className="mt-0.5 flex flex-wrap items-center gap-1 text-[11px] text-slate-600">
                  <VerifiedAccountName
                    name={entry.offer.provider_name || 'Provider'}
                    status={entry.offer.verification_status}
                    verified={entry.offer.verified}
                    size="xs"
                    nameClassName="font-medium text-slate-700"
                  />
                  <span>• Score {entry.score}</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button type="button" size="sm" variant={appliedOfferIds.includes(entry.offer.id) ? 'default' : 'outline'} onClick={() => void onApplyOffer(entry.offer.id, needIndex)}>
                  {appliedOfferIds.includes(entry.offer.id) ? 'Applied' : 'Apply Offer'}
                </Button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

type ChatComposerProps = {
  input: string
  isTyping: boolean
  fixedChoiceOptions: string[]
  suggestionNeedIndex: number | null
  suggestedOffers: RelatedOfferEntry[]
  appliedOfferIds: number[]
  onInputChange: (value: string) => void
  onInputFocus: () => void
  onSend: () => void
  onQuickPick: (value: string) => void
  onApplyOffer: (offerId: number, needIndex: number) => void | Promise<void>
}

export function ChatComposer({
  input,
  isTyping,
  fixedChoiceOptions,
  suggestionNeedIndex,
  suggestedOffers,
  appliedOfferIds,
  onInputChange,
  onInputFocus,
  onSend,
  onQuickPick,
  onApplyOffer,
}: ChatComposerProps) {
  return (
    <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-2.5 shadow-sm sm:p-3">
      {fixedChoiceOptions.length > 0 && (
        <div className="mb-2 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:thin] md:flex-wrap md:overflow-visible md:pb-0">
          {fixedChoiceOptions.map((option) => (
            <Button
              key={option}
              type="button"
              variant="outline"
              size="sm"
              className="h-9 shrink-0 rounded-full border-slate-200 bg-slate-50 px-3 text-xs text-slate-700 hover:bg-slate-100"
              onClick={() => onQuickPick(option)}
            >
              {option}
            </Button>
          ))}

          {suggestionNeedIndex !== null && suggestedOffers.length > 0 && (
            <NeedOfferSuggestions
              needIndex={suggestionNeedIndex}
              offers={suggestedOffers}
              appliedOfferIds={appliedOfferIds}
              onApplyOffer={onApplyOffer}
            />
          )}
        </div>
      )}
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          value={input}
          onChange={(e) => onInputChange(e.target.value)}
          onFocus={onInputFocus}
          onKeyDown={(e) => e.key === 'Enter' && onSend()}
          placeholder={fixedChoiceOptions.length > 0 ? 'Pick an option or type your response...' : 'Type your response...'}
          disabled={isTyping}
          className="h-11 w-full flex-1 rounded-xl border-slate-200 bg-slate-50 sm:h-12"
        />
        <Button
          onClick={onSend}
          disabled={!input.trim() || isTyping}
          className="h-11 w-full rounded-xl bg-slate-950 px-4 text-white hover:bg-slate-800 sm:h-12 sm:w-auto sm:px-5"
        >
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}
