"use client"

import type React from "react"
import { Send } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { MatchHeading, MATCH_CARD_CLASS, MATCH_PANEL_CLASS, MATCH_SCORE_CLASS } from "@/components/agent-shell"
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
    <Card className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-none border-0 bg-white shadow-none lg:h-full lg:rounded-xl lg:border-slate-200/70 lg:bg-white/90 lg:shadow-[0_18px_50px_rgba(15,23,42,0.08)] lg:backdrop-blur">
      <CardHeader className="hidden border-b border-slate-100 bg-gradient-to-r from-white to-slate-50/80 lg:block">
        <CardTitle className="text-slate-950">{AGENT_NAMES.atlas}</CardTitle>
        <CardDescription className="text-slate-600">
          Capture the project, need type, scale, and urgency step by step.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col p-0">
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="hidden flex-col items-start gap-3 border-b border-slate-100 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5 lg:flex">
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

          <div className="flex min-h-0 flex-1 flex-col px-3 pt-3 lg:px-5 lg:py-5">
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
  onRemoveOffer: (needIndex: number, offerId: number) => void
}

function NeedOfferSuggestions({ needIndex, offers, appliedOfferIds, onApplyOffer, onRemoveOffer }: NeedOfferSuggestionsProps) {
  return (
    <div className={MATCH_PANEL_CLASS}>
      <MatchHeading
        title={`${AGENT_NAMES.atlas} matches`}
        description={`Need ${needIndex + 1}. Applications are sent when you publish.`}
      />
      <div className="mt-3 space-y-2">
        {offers.map((entry) => {
          const applied = appliedOfferIds.includes(entry.offer.id)
          return (
            <div key={`chat-suggest-${entry.offer.id}`} className={MATCH_CARD_CLASS}>
              <div className="flex items-start gap-2">
                <p className="min-w-0 flex-1 text-sm font-semibold leading-5 text-slate-900 [overflow-wrap:anywhere]">
                  {entry.offer.title || `Offer #${entry.offer.id}`}
                </p>
                <span className={MATCH_SCORE_CLASS}>Score {entry.score}</span>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-1 text-[11px] text-slate-600">
                <VerifiedAccountName
                  name={entry.offer.provider_name || 'Provider'}
                  status={entry.offer.verification_status}
                  verified={entry.offer.verified}
                  size="xs"
                  nameClassName="font-medium text-slate-700"
                />
              </div>
              {applied ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="mt-3 w-full border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
                  onClick={() => onRemoveOffer(needIndex, entry.offer.id)}
                >
                  Remove
                </Button>
              ) : (
                <Button type="button" size="sm" variant="outline" className="mt-3 w-full" onClick={() => void onApplyOffer(entry.offer.id, needIndex)}>
                  Apply
                </Button>
              )}
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
  onRemoveOffer: (needIndex: number, offerId: number) => void
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
  onRemoveOffer,
}: ChatComposerProps) {
  return (
    <div className="-mx-3 mt-auto shrink-0 border-t border-slate-200 bg-white px-3 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] lg:mx-0 lg:mt-4 lg:rounded-2xl lg:border lg:px-2.5 lg:py-3 lg:pb-3 lg:shadow-sm">
      {fixedChoiceOptions.length > 0 && (
        <div className="mb-2 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:thin] md:flex-wrap md:overflow-visible md:pb-0">
          {fixedChoiceOptions.map((option) => (
            <Button
              key={option}
              type="button"
              variant="outline"
              size="sm"
              className="h-9 shrink-0 rounded-full border-slate-200 bg-slate-50 px-3 text-xs text-slate-700 hover:bg-slate-100"
              disabled={isTyping}
              onClick={() => onQuickPick(option)}
            >
              {option}
            </Button>
          ))}
        </div>
      )}
      {suggestionNeedIndex !== null && suggestedOffers.length > 0 && (
        <div className="mb-2">
          <NeedOfferSuggestions
            needIndex={suggestionNeedIndex}
            offers={suggestedOffers}
            appliedOfferIds={appliedOfferIds}
            onApplyOffer={onApplyOffer}
            onRemoveOffer={onRemoveOffer}
          />
        </div>
      )}
      <div className="flex items-end gap-2">
        <Input
          value={input}
          onChange={(e) => onInputChange(e.target.value)}
          onFocus={onInputFocus}
          onKeyDown={(e) => e.key === 'Enter' && onSend()}
          placeholder={fixedChoiceOptions.length > 0 ? 'Pick an option or type your response...' : 'Type your response...'}
          disabled={isTyping}
          className="h-11 w-full flex-1 rounded-2xl border-slate-200 bg-slate-50 lg:h-12"
        />
        <Button
          onClick={onSend}
          disabled={!input.trim() || isTyping}
          aria-label="Send"
          className="h-11 w-11 shrink-0 rounded-2xl bg-slate-950 px-0 text-white hover:bg-slate-800 lg:h-12 lg:w-auto lg:px-5"
        >
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}
