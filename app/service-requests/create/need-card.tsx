import { CSR_SCHEDULE_VII_CATEGORIES, SERVICE_REQUEST_CATEGORIES } from '@/lib/categories'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { StyledSelect } from '@/components/ui/styled-select'
import { Textarea } from '@/components/ui/textarea'
import { budgetRanges } from './helpers'
import { NeedImagesField } from './need-images-field'
import type { NeedDraft, UploadProgressState } from './types'

interface NeedCardProps {
  need: NeedDraft
  index: number
  uploadProgress?: UploadProgressState
  onChange: (field: keyof NeedDraft, value: string) => void
  onRemove: () => void
  onImageFiles: (files: FileList | null) => void
  onRemoveImage: (url: string) => void
}

export function NeedCard({ need, index, uploadProgress, onChange, onRemove, onImageFiles, onRemoveImage }: NeedCardProps) {
  return (
    <div className="rounded-lg border p-4 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="font-semibold">Need {index + 1}</h3>
          <p className="text-sm text-muted-foreground">Each need is saved as its own standalone request.</p>
        </div>
        {index > 0 && (
          <Button type="button" variant="ghost" onClick={onRemove} className="text-red-600 hover:text-red-700 hover:bg-red-50">
            Remove
          </Button>
        )}
      </div>

      <div className="grid gap-4">
        <div>
          <Label htmlFor={`title-${index}`}>Need Title *</Label>
          <Input id={`title-${index}`} value={need.title} onChange={(e) => onChange('title', e.target.value)} placeholder="e.g., School kit support for 300 students" required />
        </div>

        <div>
          <Label htmlFor={`description-${index}`}>Need Description *</Label>
          <Textarea id={`description-${index}`} value={need.description} onChange={(e) => onChange('description', e.target.value)} placeholder="Describe the exact need and context." rows={4} required />
        </div>

        <NeedImagesField
          index={index}
          images={need.images}
          uploadProgress={uploadProgress}
          onFilesSelected={onImageFiles}
          onRemoveImage={onRemoveImage}
        />

        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <Label htmlFor={`request_type-${index}`}>Need Type *</Label>
            <StyledSelect
              value={need.request_type}
              options={SERVICE_REQUEST_CATEGORIES}
              placeholder="Select need type"
              onValueChange={(value) => onChange('request_type', value)}
            />
          </div>
          <div>
            <Label htmlFor={`category-${index}`}>Schedule VII Category *</Label>
            <StyledSelect
              value={need.category}
              options={CSR_SCHEDULE_VII_CATEGORIES}
              placeholder="Select Schedule VII category"
              onValueChange={(value) => onChange('category', value)}
            />
          </div>
        </div>

        <div>
          <Label htmlFor={`location-${index}`}>Location *</Label>
          <Input
            id={`location-${index}`}
            value={need.location}
            onChange={(e) => onChange('location', e.target.value)}
            placeholder="e.g., Greater Noida, Uttar Pradesh"
            required
          />
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <Label htmlFor={`beneficiary_count-${index}`}>Beneficiary Count *</Label>
            <Input id={`beneficiary_count-${index}`} type="number" min="1" step="1" value={need.beneficiary_count} onChange={(e) => onChange('beneficiary_count', e.target.value)} placeholder="e.g., 300" required />
          </div>
          <div>
            <Label htmlFor={`budget-${index}`}>Budget Range *</Label>
            <Select value={need.budget} onValueChange={(value) => onChange('budget', value)}>
              <SelectTrigger>
                <SelectValue placeholder="Select budget range" />
              </SelectTrigger>
              <SelectContent>
                {budgetRanges.map((range) => (
                  <SelectItem key={range} value={range}>
                    {range}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div>
          <Label htmlFor={`impact_description-${index}`}>Impact Description *</Label>
          <Textarea id={`impact_description-${index}`} value={need.impact_description} onChange={(e) => onChange('impact_description', e.target.value)} placeholder="Who benefits? How many? What measurable change occurs after execution?" rows={3} required />
        </div>

        <div>
          <Label htmlFor={`timeline-${index}`}>Timeline / Deadline *</Label>
          <div className="mt-2">
            <Input id={`timeline-${index}`} value={need.timeline} onChange={(e) => onChange('timeline', e.target.value)} placeholder="e.g., 4 weeks, 2026-05-15" required />
          </div>
          <p className="mt-1 text-xs text-muted-foreground">Provide a duration like &quot;4 weeks&quot; or an exact date like &quot;2026-05-15&quot;.</p>
        </div>

        <div>
          <Label htmlFor={`contactInfo-${index}`}>Contact Information *</Label>
          <Textarea id={`contactInfo-${index}`} value={need.contactInfo} onChange={(e) => onChange('contactInfo', e.target.value)} placeholder="Primary contact and escalation details" rows={3} required />
        </div>

        {need.request_type === 'Material Need' && (
          <div className="rounded-lg border p-4 space-y-4">
            <div>
              <h4 className="font-semibold">Material Details</h4>
              <p className="text-sm text-muted-foreground">Describe the exact items and delivery quantity.</p>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <Label htmlFor={`material_items-${index}`}>Items Needed *</Label>
                <Input id={`material_items-${index}`} value={need.material_items} onChange={(e) => onChange('material_items', e.target.value)} placeholder="e.g., books, notebooks, uniforms" required />
              </div>
            </div>
          </div>
        )}

        {need.request_type === 'Skill / Service Need' && (
          <div className="rounded-lg border p-4 space-y-4">
            <div>
              <h4 className="font-semibold">Skill / Service Details</h4>
              <p className="text-sm text-muted-foreground">Define the role, headcount, and duration clearly.</p>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <Label htmlFor={`skill_role-${index}`}>Role Needed *</Label>
                <Input id={`skill_role-${index}`} value={need.skill_role} onChange={(e) => onChange('skill_role', e.target.value)} placeholder="e.g., Mathematics teacher" required />
              </div>
              <div className="md:col-span-2">
                <Label htmlFor={`skill_duration-${index}`}>Duration *</Label>
                <Input id={`skill_duration-${index}`} value={need.skill_duration} onChange={(e) => onChange('skill_duration', e.target.value)} placeholder="e.g., 1 month" required />
              </div>
            </div>
          </div>
        )}

        {need.request_type === 'Infrastructure Project' && (
          <div className="rounded-lg border p-4 space-y-4">
            <div>
              <h4 className="font-semibold">Infrastructure Scope</h4>
              <p className="text-sm text-muted-foreground">Summarize the execution scope and budget target.</p>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="md:col-span-2">
                <Label htmlFor={`infrastructure_scope-${index}`}>Scope *</Label>
                <Textarea id={`infrastructure_scope-${index}`} value={need.infrastructure_scope} onChange={(e) => onChange('infrastructure_scope', e.target.value)} placeholder="e.g., Build two classrooms and one washroom block." rows={3} required />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
