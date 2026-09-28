import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { FieldError } from '@/components/registration/field-error'
import type { FormErrors, InputChangeHandler } from '@/components/registration/types'
import type { NgoRegistrationFormData } from './types'

type NgoDetailsSectionProps = {
  values: Pick<NgoRegistrationFormData, 'founded' | 'registrationDate' | 'ngoVolunteerCapacity'>
  errors: FormErrors
  onChange: InputChangeHandler
}

export function NgoDetailsSection({ values, errors, onChange }: NgoDetailsSectionProps) {
  return (
    <div className="space-y-4">
      <h3 className="text-lg font-medium">NGO Details</h3>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="founded">Year Founded</Label>
          <Input
            id="founded"
            name="founded"
            type="number"
            min="1900"
            max={new Date().getFullYear()}
            value={values.founded}
            onChange={onChange}
            placeholder="2020"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="registrationDate">Registration Date</Label>
          <Input
            id="registrationDate"
            name="registrationDate"
            type="date"
            value={values.registrationDate}
            onChange={onChange}
          />
          <p className="text-xs text-muted-foreground">Use the date on your registration certificate.</p>
          <FieldError message={errors.registrationDate} />
        </div>

        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="ngoVolunteerCapacity">Exact NGO size</Label>
          <div className="flex gap-2">
            <Input
              id="ngoVolunteerCapacity"
              name="ngoVolunteerCapacity"
              value={values.ngoVolunteerCapacity}
              onChange={onChange}
              placeholder="Enter total staff/active volunteers (e.g. 42)"
              inputMode="numeric"
            />
            <span className="text-sm text-gray-600 self-center">people</span>
          </div>
          <FieldError message={errors.ngoVolunteerCapacity} />
        </div>
      </div>
    </div>
  )
}
