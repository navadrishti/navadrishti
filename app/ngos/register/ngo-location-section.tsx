import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { CountryStateFields } from '@/components/registration/country-state-fields'
import { FieldError } from '@/components/registration/field-error'
import type { FormErrors, HeadquartersFields, InputChangeHandler } from '@/components/registration/types'

type NgoLocationSectionProps = {
  values: HeadquartersFields
  errors: FormErrors
  onChange: InputChangeHandler
  onCountryChange: (value: string) => void
  onStateSelect: (value: string) => void
  onPincodeChange: (value: string) => void
}

export function NgoLocationSection({
  values,
  errors,
  onChange,
  onCountryChange,
  onStateSelect,
  onPincodeChange,
}: NgoLocationSectionProps) {
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-medium">NGO Location</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Enter the registered office or primary headquarters of your NGO. We use this city, state, and pincode to match you with nearby CSR campaigns and company recommendations.
        </p>
      </div>

      <div className="space-y-4 rounded-lg border border-slate-200 bg-slate-50/60 p-4">
        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="addressLine">Registered office address</Label>
          <Textarea
            id="addressLine"
            name="addressLine"
            value={values.addressLine}
            onChange={onChange}
            placeholder="Building, street, locality"
            rows={2}
          />
          <p className="text-xs text-muted-foreground">
            Use the address where your NGO is registered or primarily operates from.
          </p>
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
              placeholder="e.g. Pune, Guwahati"
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
            <Label htmlFor="pincode">Pincode / Postal code</Label>
            <Input
              id="pincode"
              name="pincode"
              value={values.pincode}
              onChange={(e) => onPincodeChange(e.target.value)}
              inputMode="numeric"
              placeholder={values.country === 'India' ? '6-digit pincode' : 'Postal code'}
              maxLength={values.country === 'India' ? 6 : 12}
            />
            <FieldError message={errors.pincode} />
          </div>
        </div>
      </div>
    </div>
  )
}
