import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { CountryStateFields } from '@/components/registration/country-state-fields'
import { FieldError } from '@/components/registration/field-error'
import type { FormErrors, HeadquartersFields, InputChangeHandler } from '@/components/registration/types'

type CompanyLocationSectionProps = {
  values: HeadquartersFields
  errors: FormErrors
  onChange: InputChangeHandler
  onCountryChange: (value: string) => void
  onStateSelect: (value: string) => void
}

export function CompanyLocationSection({
  values,
  errors,
  onChange,
  onCountryChange,
  onStateSelect,
}: CompanyLocationSectionProps) {
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-medium">Company Location</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Enter your registered office or primary company headquarters. We use this for CSR matching and regional recommendations.
        </p>
      </div>

      <div className="space-y-4 rounded-lg border border-slate-200 bg-slate-50/60 p-4">
        <div className="space-y-2">
          <Label htmlFor="addressLine">Registered office address</Label>
          <Textarea
            id="addressLine"
            name="addressLine"
            value={values.addressLine}
            onChange={onChange}
            placeholder="Building, street, locality"
            rows={2}
          />
          <FieldError message={errors.addressLine} />
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="city">City / Town</Label>
            <Input
              id="city"
              name="city"
              value={values.city}
              onChange={onChange}
              placeholder="e.g. Pune, Mumbai"
            />
            <FieldError message={errors.city} />
          </div>

          <CountryStateFields
            country={values.country}
            state={values.state}
            stateError={errors.state}
            onCountryChange={onCountryChange}
            onStateSelect={onStateSelect}
            onChange={onChange}
          />

          <div className="space-y-2">
            <Label htmlFor="pincode">Pincode</Label>
            <Input
              id="pincode"
              name="pincode"
              value={values.pincode}
              onChange={onChange}
              placeholder={values.country === 'India' ? '6-digit pincode' : 'Postal code'}
              inputMode="numeric"
            />
            <FieldError message={errors.pincode} />
          </div>
        </div>
      </div>
    </div>
  )
}
