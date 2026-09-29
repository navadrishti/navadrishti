"use client"

import { useState } from "react"
import { Send } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { SuggestedMilestoneSet } from "./helpers"
import { type ConversationStage, formatCurrency, parseMoneyValue } from "./session"

export type MilestoneMode = 'enter' | 'suggest'

type ChatComposerProps = {
  conversationStage: ConversationStage
  fixedChoiceOptions: readonly string[]
  milestoneMode: MilestoneMode | null
  showMilestoneSuggestions: boolean
  suggestedMilestoneSets: SuggestedMilestoneSet[]
  input: string
  placeholder: string
  disabled: boolean
  onInputChange: (value: string) => void
  onInputFocus: () => void
  onSend: () => void | Promise<void>
  onQuickPick: (value: string) => void | Promise<void>
  onChooseMilestoneMode: (mode: MilestoneMode) => void
  onRefreshSuggestions: () => void
  onCloseSuggestions: () => void
  onSelectSuggestedSet: (setIndex: number) => void
}

export function ChatComposer({
  conversationStage,
  fixedChoiceOptions,
  milestoneMode,
  showMilestoneSuggestions,
  suggestedMilestoneSets,
  input,
  placeholder,
  disabled,
  onInputChange,
  onInputFocus,
  onSend,
  onQuickPick,
  onChooseMilestoneMode,
  onRefreshSuggestions,
  onCloseSuggestions,
  onSelectSuggestedSet,
}: ChatComposerProps) {
  const [isRefreshingSuggestions, setIsRefreshingSuggestions] = useState(false)

  const refreshSuggestions = async () => {
    if (isRefreshingSuggestions) return
    setIsRefreshingSuggestions(true)
    try {
      await Promise.resolve(onRefreshSuggestions())
    } finally {
      setTimeout(() => setIsRefreshingSuggestions(false), 400)
    }
  }

  return (
    <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-2.5 shadow-sm sm:p-3">
      {fixedChoiceOptions.length > 0 && !(conversationStage === 'milestone-count' && milestoneMode !== 'enter') && (
        <div className="mb-2 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:thin] md:flex-wrap md:overflow-visible md:pb-0">
          {fixedChoiceOptions.map((option) => (
            <Button
              key={option}
              type="button"
              variant="outline"
              size="sm"
              className="h-9 shrink-0 rounded-full border-slate-200 bg-slate-50 px-3 text-xs text-slate-700 hover:bg-slate-100"
              disabled={disabled}
              onClick={() => void onQuickPick(option)}
            >
              {option}
            </Button>
          ))}
        </div>
      )}

      {conversationStage === 'milestone-count' && (
        <div className="mb-3">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className={`rounded-full px-3 text-xs ${milestoneMode === 'enter' ? 'bg-slate-900 text-white border-transparent' : ''}`}
              disabled={disabled}
              onClick={() => onChooseMilestoneMode('enter')}
            >
              Enter manually
            </Button>

            <Button
              type="button"
              size="sm"
              variant="outline"
              className={`rounded-full px-3 text-xs ${milestoneMode === 'suggest' ? 'bg-slate-900 text-white border-transparent' : ''}`}
              disabled={disabled}
              onClick={() => onChooseMilestoneMode('suggest')}
            >
              Get suggestions
            </Button>

            {milestoneMode === 'suggest' && (
              <Button size="sm" variant="ghost" onClick={refreshSuggestions}>
                {isRefreshingSuggestions ? 'Refreshing...' : 'Refresh'}
              </Button>
            )}
          </div>
          <p className="mt-2 text-xs text-slate-500">Choose whether to enter milestones or use suggested sets.</p>
        </div>
      )}

      {showMilestoneSuggestions && suggestedMilestoneSets.length > 0 && (
        <div className="mb-3 grid gap-2">
          <div className="flex items-center justify-end gap-2">
            <Button size="sm" variant="outline" onClick={refreshSuggestions}>{isRefreshingSuggestions ? 'Refreshing...' : 'Refresh suggestions'}</Button>
            <Button size="sm" variant="ghost" onClick={onCloseSuggestions}>Close suggestions</Button>
          </div>
          <div className="max-h-[36rem] overflow-y-auto pr-2">
            <div className="space-y-2">
              {suggestedMilestoneSets.map((set, idx) => (
                <div key={set.id} className="rounded-lg border bg-white p-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">Suggested set — {set.milestones.length} milestones</p>
                      <p className="text-xs text-slate-500">Suggested whole set selection</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button size="sm" variant="outline" disabled={disabled} onClick={() => onSelectSuggestedSet(idx)}>Select this set</Button>
                    </div>
                  </div>
                  <div className="mt-2 grid gap-2">
                    {set.milestones.map((m, i) => (
                      <div key={i} className="rounded-md border border-slate-100 bg-slate-50 p-2 text-xs text-slate-700">
                        <p className="font-semibold text-slate-900">Milestone {i + 1}: {m.title || `Phase ${i + 1}`}</p>
                        {m.description ? <p className="mt-1 break-words whitespace-normal">{m.description}</p> : null}
                        <p className="mt-1 text-slate-600">
                          {formatCurrency(parseMoneyValue(m.budgetTarget) || 0)}
                          {m.startDate && m.endDate ? ` • ${m.startDate} to ${m.endDate}` : ''}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          value={input}
          onChange={(event) => onInputChange(event.target.value)}
          onFocus={onInputFocus}
          onKeyDown={(event) => event.key === "Enter" && onSend()}
          placeholder={placeholder}
          disabled={disabled}
          className="h-11 w-full flex-1 rounded-xl border-slate-200 bg-slate-50 sm:h-12"
        />
        <Button
          onClick={() => void onSend()}
          disabled={!input.trim() || disabled}
          className="h-11 w-full rounded-xl bg-slate-950 px-4 text-white hover:bg-slate-800 sm:h-12 sm:w-auto sm:px-5"
        >
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}
