import { Plus, Sparkles } from 'lucide-react'
import { INDIAN_STATES_AND_UTS } from '@/lib/auth'
import { CSR_SCHEDULE_VII_CATEGORIES } from '@/lib/categories'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { StyledSelect } from '@/components/ui/styled-select'
import { Textarea } from '@/components/ui/textarea'
import { fixedBudgetOptions, type MilestoneInput } from '@/app/companies/csr-agent/session'
import type { SuggestedMilestoneSet } from '@/app/companies/csr-agent/helpers'
import { createEmptyMilestone, type ManualCampaignForm } from './helpers'

type CampaignFormFieldsProps = {
  form: ManualCampaignForm
  onChange: (update: ManualCampaignForm | ((current: ManualCampaignForm) => ManualCampaignForm)) => void
  suggestedSets: SuggestedMilestoneSet[]
  showingSuggestions: boolean
  refreshingSuggestions: boolean
  onToggleSuggestions: () => void
  onRefreshSuggestions: () => void
  onSelectSuggestedSet: (index: number) => void
}

export function CampaignFormFields({
  form,
  onChange,
  suggestedSets,
  showingSuggestions,
  refreshingSuggestions,
  onToggleSuggestions,
  onRefreshSuggestions,
  onSelectSuggestedSet,
}: CampaignFormFieldsProps) {
  const setField = (field: keyof ManualCampaignForm, value: string) => {
    onChange((current) => ({ ...current, [field]: value }))
  }

  const setMilestone = (index: number, field: keyof MilestoneInput, value: string) => {
    onChange((current) => ({
      ...current,
      milestones: current.milestones.map((milestone, milestoneIndex) =>
        milestoneIndex === index ? { ...milestone, [field]: value } : milestone
      ),
    }))
  }

  const setMilestoneCount = (count: number) => {
    const safeCount = Math.max(1, Math.min(10, Math.floor(count) || 1))
    onChange((current) => {
      const milestones = current.milestones.slice(0, safeCount)
      while (milestones.length < safeCount) milestones.push(createEmptyMilestone(milestones.length))
      return { ...current, milestones }
    })
  }

  return (
    <div className="space-y-6">
      <div>
        <Label htmlFor="campaignName">Campaign name *</Label>
        <Input
          id="campaignName"
          value={form.campaignName}
          onChange={(event) => setField('campaignName', event.target.value)}
          placeholder="e.g., Rural classroom setup in Gadchiroli"
          required
        />
      </div>

      <div>
        <Label htmlFor="requirementDetails">Campaign details *</Label>
        <Textarea
          id="requirementDetails"
          value={form.requirementDetails}
          onChange={(event) => setField('requirementDetails', event.target.value)}
          rows={4}
          placeholder="What will this campaign deliver, who benefits, and how will you measure it?"
          required
        />
      </div>

      <div>
        <Label>Schedule VII category *</Label>
        <StyledSelect
          value={form.category}
          options={[...CSR_SCHEDULE_VII_CATEGORIES]}
          placeholder="Select category"
          onValueChange={(value) => setField('category', value)}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <Label htmlFor="city">City *</Label>
          <Input id="city" value={form.city} onChange={(event) => setField('city', event.target.value)} required />
        </div>
        <div>
          <Label>State / UT *</Label>
          <StyledSelect
            value={form.state}
            options={[...INDIAN_STATES_AND_UTS]}
            placeholder="Select state / UT"
            onValueChange={(value) => setField('state', value)}
          />
        </div>
        <div>
          <Label htmlFor="budget">Budget (INR) *</Label>
          <Input
            id="budget"
            inputMode="numeric"
            value={form.budget}
            onChange={(event) => setField('budget', event.target.value)}
            placeholder="e.g., 500000"
            required
          />
          <div className="mt-2 flex flex-wrap gap-2">
            {fixedBudgetOptions.map((option) => (
              <Button
                key={option}
                type="button"
                size="sm"
                variant={form.budget === option ? 'default' : 'outline'}
                className="h-7 rounded-full px-3 text-xs"
                onClick={() => setField('budget', option)}
              >
                {option}
              </Button>
            ))}
          </div>
        </div>
        <div>
          <Label htmlFor="volunteerRequirement">Volunteer requirement *</Label>
          <Input
            id="volunteerRequirement"
            type="number"
            min="1"
            value={form.volunteerRequirement}
            onChange={(event) => setField('volunteerRequirement', event.target.value)}
            required
          />
        </div>
        <div>
          <Label htmlFor="startDate">Start date *</Label>
          <Input id="startDate" type="date" value={form.startDate} onChange={(event) => setField('startDate', event.target.value)} required />
        </div>
        <div>
          <Label htmlFor="endDate">End date *</Label>
          <Input id="endDate" type="date" value={form.endDate} onChange={(event) => setField('endDate', event.target.value)} required />
        </div>
        <div>
          <Label htmlFor="beneficiaries">Expected beneficiaries</Label>
          <Input
            id="beneficiaries"
            type="number"
            min="1"
            value={form.beneficiaries}
            onChange={(event) => setField('beneficiaries', event.target.value)}
          />
        </div>
      </div>

      <div className="space-y-4 rounded-lg border p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h3 className="font-semibold">Milestones *</h3>
            <p className="text-sm text-muted-foreground">
              Enter them yourself or use the same suggested sets Catalyst offers.
            </p>
          </div>
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
            <Label htmlFor="milestone_count" className="text-sm text-muted-foreground">
              Number of milestones
            </Label>
            <Input
              id="milestone_count"
              type="number"
              min="1"
              max="10"
              value={form.milestones.length}
              onChange={(event) => setMilestoneCount(Number(event.target.value))}
              className="w-full sm:w-24"
            />
            <Button type="button" variant="outline" onClick={onToggleSuggestions} className="w-full sm:w-auto">
              <Sparkles size={16} className="mr-2" />
              {showingSuggestions ? 'Hide suggestions' : 'Get suggestions'}
            </Button>
          </div>
        </div>

        {showingSuggestions ? (
          <div className="space-y-2">
            <div className="flex justify-end">
              <Button type="button" size="sm" variant="ghost" onClick={onRefreshSuggestions}>
                {refreshingSuggestions ? 'Refreshing...' : 'Refresh suggestions'}
              </Button>
            </div>
            {suggestedSets.length === 0 ? (
              <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
                Fill the campaign name, category, budget and dates to see suggested milestone sets.
              </p>
            ) : (
              suggestedSets.map((set, index) => (
                <div key={set.id} className="rounded-md border bg-slate-50 p-3">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="text-sm font-semibold">{set.title}</p>
                      <p className="text-xs text-muted-foreground">{set.milestones.length} milestones</p>
                    </div>
                    <Button type="button" size="sm" variant="outline" onClick={() => onSelectSuggestedSet(index)}>
                      Use this set
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        ) : null}

        <div className="space-y-4">
          {form.milestones.map((milestone, index) => (
            <div key={`milestone-${index}`} className="space-y-3 rounded-md border p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-medium">Milestone {index + 1}</p>
                {form.milestones.length > 1 ? (
                  <Button
                    type="button"
                    variant="ghost"
                    className="text-red-600 hover:bg-red-50 hover:text-red-700"
                    onClick={() =>
                      onChange((current) => ({
                        ...current,
                        milestones: current.milestones.filter((_, milestoneIndex) => milestoneIndex !== index),
                      }))
                    }
                  >
                    Remove
                  </Button>
                ) : null}
              </div>
              <div>
                <Label htmlFor={`milestone-title-${index}`}>Title</Label>
                <Input
                  id={`milestone-title-${index}`}
                  value={milestone.title || ''}
                  onChange={(event) => setMilestone(index, 'title', event.target.value)}
                />
              </div>
              <div>
                <Label htmlFor={`milestone-description-${index}`}>Description *</Label>
                <Textarea
                  id={`milestone-description-${index}`}
                  value={milestone.description}
                  onChange={(event) => setMilestone(index, 'description', event.target.value)}
                  rows={2}
                  required
                />
              </div>
              <div className="grid gap-3 md:grid-cols-3">
                <div>
                  <Label htmlFor={`milestone-budget-${index}`}>Budget (INR) *</Label>
                  <Input
                    id={`milestone-budget-${index}`}
                    inputMode="numeric"
                    value={milestone.budgetTarget}
                    onChange={(event) => setMilestone(index, 'budgetTarget', event.target.value)}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor={`milestone-start-${index}`}>Start date</Label>
                  <Input
                    id={`milestone-start-${index}`}
                    type="date"
                    value={milestone.startDate || ''}
                    onChange={(event) => setMilestone(index, 'startDate', event.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor={`milestone-end-${index}`}>End date</Label>
                  <Input
                    id={`milestone-end-${index}`}
                    type="date"
                    value={milestone.endDate || ''}
                    onChange={(event) => setMilestone(index, 'endDate', event.target.value)}
                  />
                </div>
              </div>
            </div>
          ))}
          {form.milestones.length < 10 ? (
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                onChange((current) => ({
                  ...current,
                  milestones: [...current.milestones, createEmptyMilestone(current.milestones.length)],
                }))
              }
            >
              <Plus size={16} className="mr-2" />
              Add milestone
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  )
}
