import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { INDIAN_STATES_AND_UTS } from '@/lib/auth'
import { FieldError } from './field-error'
import type { InputChangeHandler } from './types'

type CountryStateFieldsProps = {
  country: string
  state: string
  stateError?: string
  onCountryChange: (value: string) => void
  onStateSelect: (value: string) => void
  onChange: InputChangeHandler
}

export function CountryStateFields({
  country,
  state,
  stateError,
  onCountryChange,
  onStateSelect,
  onChange,
}: CountryStateFieldsProps) {
  return (
    <>
      <div className="space-y-2">
        <Label htmlFor="country">Country</Label>
        <Select value={country} onValueChange={onCountryChange}>
          <SelectTrigger id="country">
            <SelectValue placeholder="Select country" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="India">India</SelectItem>
            <SelectItem value="Bangladesh">Bangladesh</SelectItem>
            <SelectItem value="Nepal">Nepal</SelectItem>
            <SelectItem value="Sri Lanka">Sri Lanka</SelectItem>
            <SelectItem value="Pakistan">Pakistan</SelectItem>
            <SelectItem value="Other">Other</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {country === 'India' ? (
        <div className="space-y-2">
          <Label htmlFor="state">State / UT</Label>
          <Select
            value={state || 'unset'}
            onValueChange={(value) => onStateSelect(value === 'unset' ? '' : value)}
          >
            <SelectTrigger id="state">
              <SelectValue placeholder="Select state or UT" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="unset">Select state / UT</SelectItem>
              {INDIAN_STATES_AND_UTS.map((stateName) => (
                <SelectItem key={stateName} value={stateName}>
                  {stateName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FieldError message={stateError} />
        </div>
      ) : (
        <div className="space-y-2">
          <Label htmlFor="state">State / Province</Label>
          <Input
            id="state"
            name="state"
            value={state}
            onChange={onChange}
            placeholder="State or province"
          />
          <FieldError message={stateError} />
        </div>
      )}
    </>
  )
}
