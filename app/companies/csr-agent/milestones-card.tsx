"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { buildPreviewMilestoneDrafts } from "./helpers"
import { type MilestoneInput, formatCurrency, parseMoneyValue } from "./session"

type MilestonesCardProps = {
  milestoneCount: number | null
  milestoneInputs: MilestoneInput[]
  onSave: (count: number | null, drafts: MilestoneInput[]) => boolean
}

export function MilestonesCard({ milestoneCount, milestoneInputs, onSave }: MilestonesCardProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [draftCount, setDraftCount] = useState<number | null>(null)
  const [drafts, setDrafts] = useState<MilestoneInput[]>([])

  const handleStartEdit = () => {
    const { count, drafts: baseMilestones } = buildPreviewMilestoneDrafts(milestoneInputs, milestoneCount)
    setDraftCount(count)
    setDrafts(baseMilestones)
    setIsEditing(true)
  }

  const handleSave = () => {
    if (onSave(draftCount, drafts)) setIsEditing(false)
  }

  const updateDraft = (index: number, patch: Partial<MilestoneInput>) => {
    setDrafts((prev) => prev.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item))
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-slate-950">Milestones</p>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500">{milestoneCount ? `${milestoneInputs.length}/${milestoneCount}` : "Waiting"}</span>
          {isEditing ? (
            <>
              <Button type="button" size="sm" variant="ghost" onClick={() => setIsEditing(false)}>Cancel</Button>
              <Button type="button" size="sm" onClick={handleSave}>Save</Button>
            </>
          ) : (
            <Button type="button" size="sm" variant="outline" onClick={handleStartEdit}>Edit</Button>
          )}
        </div>
      </div>
      <div className="mt-3 space-y-2">
        {isEditing ? (
          <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-3">
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500">Milestone count</span>
              <Input
                type="number"
                min={1}
                max={10}
                value={draftCount || 1}
                onChange={(event) => {
                  const count = Math.max(1, Math.min(10, Number(event.target.value || 1)))
                  setDraftCount(count)
                  setDrafts((prev) => Array.from({ length: count }, (_, index) => prev[index] || { title: '', description: '', budgetTarget: '' }))
                }}
                className="h-9 w-24"
              />
            </div>
            {(drafts || []).map((milestone, index) => (
              <div key={`preview-edit-milestone-${index}`} className="rounded-xl border border-slate-200 p-3">
                <p className="mb-2 text-xs font-semibold text-slate-500">Milestone {index + 1}</p>
                <Input
                  value={milestone.title || ''}
                  onChange={(event) => updateDraft(index, { title: event.target.value })}
                  placeholder="Milestone title"
                />
                <textarea
                  value={milestone.description || ''}
                  onChange={(event) => updateDraft(index, { description: event.target.value })}
                  placeholder="Milestone description"
                  className="mt-2 min-h-[70px] w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm outline-none ring-0 focus:border-slate-300"
                />
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  <Input
                    placeholder="Budget (INR)"
                    value={milestone.budgetTarget || ''}
                    onChange={(event) => updateDraft(index, { budgetTarget: event.target.value })}
                  />
                  <Input
                    type="date"
                    placeholder="Start date"
                    value={milestone.startDate || ''}
                    onChange={(event) => updateDraft(index, { startDate: event.target.value })}
                  />
                  <Input
                    type="date"
                    placeholder="End date"
                    value={milestone.endDate || ''}
                    onChange={(event) => updateDraft(index, { endDate: event.target.value })}
                  />
                </div>
              </div>
            ))}
          </div>
        ) : milestoneInputs.length > 0 ? (
          milestoneInputs.map((milestone, index) => (
            <div key={`milestone-${index}`} className="rounded-xl border border-slate-200 bg-white p-3">
              <p className="text-sm font-semibold text-slate-950">{milestone.title || `Milestone ${index + 1}`}</p>
              <p className="mt-1 text-xs text-slate-600 break-words">{milestone.description || "Waiting for description"}</p>
              <p className="mt-1 text-xs text-slate-600">{milestone.budgetTarget ? formatCurrency(parseMoneyValue(milestone.budgetTarget) || 0) : "Waiting for budget"} {milestone.startDate && milestone.endDate ? `• ${milestone.startDate} — ${milestone.endDate}` : ''}</p>
            </div>
          ))
        ) : (
          <div className="rounded-xl border border-dashed border-slate-200 bg-white p-4 text-sm text-slate-500">
            The milestone list will appear here once the count is chosen.
          </div>
        )}
      </div>
    </div>
  )
}
