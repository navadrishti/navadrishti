import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { MultiSelectDropdown } from '@/components/ui/multi-select-dropdown'
import {
  CSR_SCHEDULE_VII_CATEGORIES,
  COMPANY_CSR_GOVERNANCE_MECHANISMS,
  COMPANY_CSR_IMPLEMENTATION_MODELS,
} from '@/lib/categories'
import { FieldError } from '@/components/registration/field-error'
import type { FormErrors, InputChangeHandler } from '@/components/registration/types'
import type { CompanyRegistrationFormData } from './types'

type CsrProgramSectionProps = {
  values: Pick<
    CompanyRegistrationFormData,
    | 'focusAreasScheduleVii'
    | 'implementationModel'
    | 'governanceMechanism'
    | 'netWorth'
    | 'turnover'
    | 'netProfit'
    | 'csrVision'
  >
  errors: FormErrors
  onChange: InputChangeHandler
  onFocusAreasChange: (value: string[]) => void
  onSelectChange: (name: 'implementationModel' | 'governanceMechanism', value: string) => void
}

export function CsrProgramSection({
  values,
  errors,
  onChange,
  onFocusAreasChange,
  onSelectChange,
}: CsrProgramSectionProps) {
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-medium">CSR Program Details</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Optional details that help with CSR matching. You can add or update these later from your profile.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="focusAreasScheduleVii">
            Focus Areas (Schedule VII){' '}
            <span className="font-normal text-muted-foreground">(optional)</span>
          </Label>
          <MultiSelectDropdown
            value={values.focusAreasScheduleVii}
            options={CSR_SCHEDULE_VII_CATEGORIES}
            placeholder="Select Schedule VII focus areas"
            onValueChange={onFocusAreasChange}
          />
          <p className="text-xs text-muted-foreground">Choose all Schedule VII areas your CSR programs focus on.</p>
          <FieldError message={errors.focusAreasScheduleVii} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="implementationModel">
            Implementation Model{' '}
            <span className="font-normal text-muted-foreground">(optional)</span>
          </Label>
          <Select
            value={values.implementationModel || 'unset'}
            onValueChange={(value) => {
              onSelectChange('implementationModel', value === 'unset' ? '' : value)
            }}
          >
            <SelectTrigger id="implementationModel">
              <SelectValue placeholder="Select implementation model" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="unset">Select implementation model</SelectItem>
              {COMPANY_CSR_IMPLEMENTATION_MODELS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FieldError message={errors.implementationModel} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="governanceMechanism">
            Governance Mechanism{' '}
            <span className="font-normal text-muted-foreground">(optional)</span>
          </Label>
          <Select
            value={values.governanceMechanism || 'unset'}
            onValueChange={(value) => {
              onSelectChange('governanceMechanism', value === 'unset' ? '' : value)
            }}
          >
            <SelectTrigger id="governanceMechanism">
              <SelectValue placeholder="Select governance mechanism" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="unset">Select governance mechanism</SelectItem>
              {COMPANY_CSR_GOVERNANCE_MECHANISMS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FieldError message={errors.governanceMechanism} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="netWorth">
            Net Worth <span className="font-normal text-muted-foreground">(optional)</span>
          </Label>
          <Input
            id="netWorth"
            name="netWorth"
            value={values.netWorth}
            onChange={onChange}
            placeholder="e.g. INR 120 Cr"
          />
          <p className="text-xs text-muted-foreground">Use latest audited financial year figures.</p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="turnover">
            Turnover <span className="font-normal text-muted-foreground">(optional)</span>
          </Label>
          <Input
            id="turnover"
            name="turnover"
            value={values.turnover}
            onChange={onChange}
            placeholder="e.g. INR 450 Cr"
          />
          <p className="text-xs text-muted-foreground">Enter annual turnover from latest audited statements.</p>
        </div>

        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="netProfit">
            Net Profit <span className="font-normal text-muted-foreground">(optional)</span>
          </Label>
          <Input
            id="netProfit"
            name="netProfit"
            value={values.netProfit}
            onChange={onChange}
            placeholder="e.g. INR 35 Cr"
          />
          <p className="text-xs text-muted-foreground">Provide post-tax net profit for the latest financial year.</p>
        </div>

        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="csrVision">
            CSR Vision <span className="font-normal text-muted-foreground">(optional)</span>
          </Label>
          <Textarea
            id="csrVision"
            name="csrVision"
            value={values.csrVision}
            onChange={onChange}
            placeholder="Describe your long-term CSR vision"
            rows={3}
          />
          <p className="text-xs text-muted-foreground">Keep it concise: long-term impact goals and intended beneficiaries.</p>
        </div>
      </div>
    </div>
  )
}
