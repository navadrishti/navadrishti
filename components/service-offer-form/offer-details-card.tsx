import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { StyledSelect } from '@/components/ui/styled-select'
import { Textarea } from '@/components/ui/textarea'

import type { ServiceOfferForm } from './use-service-offer-form'

const FUNDING_TYPE_OPTIONS = [
  { value: '', label: 'Select funding type' },
  { value: 'grant', label: 'Grant' },
  { value: 'donation', label: 'Donation' },
  { value: 'loan', label: 'Loan' },
  { value: 'scholarship', label: 'Scholarship' }
]

const DISBURSEMENT_SCHEDULE_OPTIONS = [
  { value: '', label: 'Select schedule' },
  { value: 'one-time', label: 'One-time' },
  { value: 'milestone', label: 'Milestone' },
  { value: 'quarterly', label: 'Quarterly' }
]

const EMPLOYMENT_TYPE_OPTIONS = [
  { value: '', label: 'Select employment type' },
  { value: 'full_time', label: 'Full Time' },
  { value: 'part_time', label: 'Part Time' },
  { value: 'contract', label: 'Contract' }
]

const REMOTE_ONSITE_OPTIONS = [
  { value: '', label: 'Select mode' },
  { value: 'remote', label: 'Remote' },
  { value: 'onsite', label: 'Onsite' },
  { value: 'hybrid', label: 'Hybrid' }
]

const CONDITION_OPTIONS = [
  { value: '', label: 'Select condition' },
  { value: 'new', label: 'New' },
  { value: 'used', label: 'Used' },
  { value: 'refurbished', label: 'Refurbished' }
]

const STOCK_STATUS_OPTIONS = [
  { value: '', label: 'Select stock status' },
  { value: 'in_stock', label: 'In Stock' },
  { value: 'out_of_stock', label: 'Out of Stock' },
  { value: 'limited', label: 'Limited' }
]

const INFRA_TYPE_OPTIONS = [
  { value: '', label: 'Select infra type' },
  { value: 'machine', label: 'Machine' },
  { value: 'building', label: 'Building' },
  { value: 'lab', label: 'Lab' },
  { value: 'vehicle', label: 'Vehicle' },
  { value: 'land', label: 'Land' }
]

type SectionProps = {
  form: ServiceOfferForm
}

function FinancialDetailsFields({ form }: SectionProps) {
  const { formData, setField, handleTextInput } = form

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div>
        <Label>Funding Type</Label>
        <StyledSelect
          value={formData.funding_type}
          options={FUNDING_TYPE_OPTIONS}
          onValueChange={(value) => setField('funding_type', value)}
        />
      </div>
      <div>
        <Label htmlFor="budget_amount">Budget Amount</Label>
        <Input id="budget_amount" name="budget_amount" type="number" min="0" value={formData.budget_amount} onChange={handleTextInput} />
      </div>
      <div>
        <Label>Disbursement Schedule</Label>
        <StyledSelect
          value={formData.disbursement_schedule}
          options={DISBURSEMENT_SCHEDULE_OPTIONS}
          onValueChange={(value) => setField('disbursement_schedule', value)}
        />
      </div>
      <div>
        <Label htmlFor="funding_window_start">Funding Window Start</Label>
        <Input id="funding_window_start" name="funding_window_start" type="date" value={formData.funding_window_start} onChange={handleTextInput} />
      </div>
      <div>
        <Label htmlFor="funding_window_end">Funding Window End</Label>
        <Input id="funding_window_end" name="funding_window_end" type="date" value={formData.funding_window_end} onChange={handleTextInput} />
      </div>
      <div className="md:col-span-2">
        <Label htmlFor="eligibility_conditions">Eligibility Conditions</Label>
        <Textarea id="eligibility_conditions" name="eligibility_conditions" value={formData.eligibility_conditions} onChange={handleTextInput} rows={3} />
      </div>
    </div>
  )
}

function ServiceDetailsFields({ form }: SectionProps) {
  const { formData, setField, handleTextInput } = form

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div className="md:col-span-2">
        <Label htmlFor="skills_required">Skills Required (comma separated)</Label>
        <Input id="skills_required" name="skills_required" value={formData.skills_required} onChange={handleTextInput} placeholder="teaching, legal, project management" />
      </div>
      <div className="md:col-span-2">
        <Label htmlFor="experience_requirements">Experience Requirements</Label>
        <Input id="experience_requirements" name="experience_requirements" value={formData.experience_requirements} onChange={handleTextInput} />
      </div>
      <div>
        <Label>Employment Type</Label>
        <StyledSelect
          value={formData.employment_type}
          options={EMPLOYMENT_TYPE_OPTIONS}
          onValueChange={(value) => setField('employment_type', value)}
        />
      </div>
      <div>
        <Label>Remote / Onsite</Label>
        <StyledSelect
          value={formData.remote_onsite}
          options={REMOTE_ONSITE_OPTIONS}
          onValueChange={(value) => setField('remote_onsite', value)}
        />
      </div>
      <div>
        <Label htmlFor="wage_per_day">Wage Per Day</Label>
        <Input id="wage_per_day" name="wage_per_day" type="number" min="0" value={formData.wage_per_day} onChange={handleTextInput} />
      </div>
      <div>
        <Label htmlFor="hours_per_day">Hours Per Day</Label>
        <Input id="hours_per_day" name="hours_per_day" type="number" min="0" value={formData.hours_per_day} onChange={handleTextInput} />
      </div>
      <div className="md:col-span-2">
        <Label htmlFor="duration">Duration</Label>
        <Input id="duration" name="duration" value={formData.duration} onChange={handleTextInput} placeholder="e.g., 3 months" />
      </div>
    </div>
  )
}

function MaterialDetailsFields({ form }: SectionProps) {
  const { formData, setField, handleTextInput } = form

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div>
        <Label>Condition</Label>
        <StyledSelect
          value={formData.condition}
          options={CONDITION_OPTIONS}
          onValueChange={(value) => setField('condition', value)}
        />
      </div>
      <div>
        <Label>Stock Status</Label>
        <StyledSelect
          value={formData.stock_status}
          options={STOCK_STATUS_OPTIONS}
          onValueChange={(value) => setField('stock_status', value)}
        />
      </div>
      <div>
        <Label htmlFor="material_quantity">Quantity</Label>
        <Input id="material_quantity" name="material_quantity" type="number" min="0" value={formData.material_quantity} onChange={handleTextInput} />
      </div>
      <div>
        <Label htmlFor="material_unit">Unit</Label>
        <Input id="material_unit" name="material_unit" value={formData.material_unit} onChange={handleTextInput} placeholder="kits, items, pieces" />
      </div>
      <div>
        <Label htmlFor="material_available_from">Available From</Label>
        <Input id="material_available_from" name="material_available_from" type="date" value={formData.material_available_from} onChange={handleTextInput} />
      </div>
      <div>
        <Label htmlFor="material_available_to">Available To</Label>
        <Input id="material_available_to" name="material_available_to" type="date" value={formData.material_available_to} onChange={handleTextInput} />
      </div>
    </div>
  )
}

function InfrastructureDetailsFields({ form }: SectionProps) {
  const { formData, setField, handleTextInput } = form

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div>
        <Label>Infrastructure Type</Label>
        <StyledSelect
          value={formData.infra_type}
          options={INFRA_TYPE_OPTIONS}
          onValueChange={(value) => setField('infra_type', value)}
        />
      </div>
      <div>
        <Label htmlFor="infra_capacity">Capacity</Label>
        <Input id="infra_capacity" name="infra_capacity" type="number" min="0" value={formData.infra_capacity} onChange={handleTextInput} />
      </div>
      <div className="md:col-span-2">
        <Label htmlFor="facilities">Facilities (comma separated)</Label>
        <Input id="facilities" name="facilities" value={formData.facilities} onChange={handleTextInput} placeholder="AC, projector, parking" />
      </div>
      <div>
        <Label htmlFor="infra_available_from">Available From</Label>
        <Input id="infra_available_from" name="infra_available_from" type="date" value={formData.infra_available_from} onChange={handleTextInput} />
      </div>
      <div>
        <Label htmlFor="infra_available_to">Available To</Label>
        <Input id="infra_available_to" name="infra_available_to" type="date" value={formData.infra_available_to} onChange={handleTextInput} />
      </div>
    </div>
  )
}

export function OfferDetailsCard({ form }: SectionProps) {
  const offerType = form.formData.offer_type

  return (
    <Card>
      <CardHeader>
        <CardTitle>Offer Details</CardTitle>
        <CardDescription>Type-specific fields based on offer type.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {offerType === 'financial' && <FinancialDetailsFields form={form} />}
        {offerType === 'service' && <ServiceDetailsFields form={form} />}
        {offerType === 'material' && <MaterialDetailsFields form={form} />}
        {offerType === 'infrastructure' && <InfrastructureDetailsFields form={form} />}
      </CardContent>
    </Card>
  )
}
