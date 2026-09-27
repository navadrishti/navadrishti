"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { AGENT_NAMES } from "@/lib/ai-agent-sessions"
import { type ProjectIntakeData, formatCurrency, parseMoneyValue } from "./session"

type CampaignDetailsCardProps = {
  projectData: ProjectIntakeData
  milestoneCount: number | null
  onSave: (draft: ProjectIntakeData) => boolean
}

const draftFields: Array<{ key: keyof ProjectIntakeData; placeholder: string }> = [
  { key: "campaignName", placeholder: "Campaign name" },
  { key: "category", placeholder: "Category" },
  { key: "city", placeholder: "City" },
  { key: "state", placeholder: "State / Province" },
  { key: "budget", placeholder: "Budget (INR)" },
  { key: "volunteerRequirement", placeholder: "Volunteer requirement" },
  { key: "startDate", placeholder: "Start date" },
  { key: "endDate", placeholder: "End date" },
]

export function CampaignDetailsCard({ projectData, milestoneCount, onSave }: CampaignDetailsCardProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [draft, setDraft] = useState<ProjectIntakeData>({})

  const liveFields = [
    { label: "Campaign name", value: projectData.campaignName },
    { label: "Category", value: projectData.category },
    { label: "Location", value: [projectData.city, projectData.state].filter(Boolean).join(", ") },
    { label: "Budget", value: projectData.budget ? formatCurrency(parseMoneyValue(projectData.budget) || 0) : "" },
    { label: "Start date", value: projectData.startDate },
    { label: "End date", value: projectData.endDate },
    { label: "Milestones", value: milestoneCount ? String(milestoneCount) : "" },
  ].filter((item) => Boolean(item.value))

  const handleStartEdit = () => {
    setDraft({ ...projectData })
    setIsEditing(true)
  }

  const handleSave = () => {
    if (onSave(draft)) setIsEditing(false)
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Campaign details</p>
          <p className="mt-1 text-sm text-slate-600">Captured so far from the conversation.</p>
        </div>
        {isEditing ? (
          <div className="flex items-center gap-2">
            <Button type="button" size="sm" variant="ghost" onClick={() => setIsEditing(false)}>Cancel</Button>
            <Button type="button" size="sm" onClick={handleSave}>Save</Button>
          </div>
        ) : (
          <Button type="button" size="sm" variant="outline" onClick={handleStartEdit}>Edit</Button>
        )}
      </div>
      <div className="mt-4 space-y-2">
        {isEditing ? (
          <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-3">
            {draftFields.map((field) => (
              <Input
                key={field.key}
                placeholder={field.placeholder}
                value={draft[field.key] || ''}
                onChange={(event) => setDraft((prev) => ({ ...prev, [field.key]: event.target.value }))}
              />
            ))}
          </div>
        ) : liveFields.length > 0 ? (
          liveFields.map((field) => (
            <div key={field.label} className="flex items-start justify-between gap-4 rounded-xl border border-slate-200 bg-white px-4 py-3">
              <span className="text-sm font-medium text-slate-500">{field.label}</span>
              <span className="max-w-[60%] text-right text-sm font-semibold text-slate-900 break-words">{field.value}</span>
            </div>
          ))
        ) : (
          <div className="rounded-xl border border-dashed border-slate-200 bg-white p-4 text-center text-sm text-slate-500">
            {AGENT_NAMES.catalyst} will fill this card as soon as the first answers come in.
          </div>
        )}
      </div>
    </div>
  )
}
