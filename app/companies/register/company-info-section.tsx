import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { FieldError } from '@/components/registration/field-error'
import type { FormErrors, InputChangeHandler } from '@/components/registration/types'
import type { CompanyRegistrationFormData } from './types'

type CompanyInfoSectionProps = {
  values: Pick<CompanyRegistrationFormData, 'companyName' | 'industry' | 'companySize' | 'website'>
  errors: FormErrors
  onChange: InputChangeHandler
  onSelectChange: (name: 'industry' | 'companySize', value: string) => void
}

export function CompanyInfoSection({ values, errors, onChange, onSelectChange }: CompanyInfoSectionProps) {
  return (
    <div className="space-y-4">
      <h3 className="text-lg font-medium">Company Information</h3>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="companyName">Company Name</Label>
          <Input
            id="companyName"
            name="companyName"
            value={values.companyName}
            onChange={onChange}
            placeholder="Your Company Name"
          />
          <FieldError message={errors.companyName} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="industry">Industry</Label>
          <Select value={values.industry} onValueChange={(value) => onSelectChange('industry', value)}>
            <SelectTrigger>
              <SelectValue placeholder="Select industry" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="technology">Technology</SelectItem>
              <SelectItem value="healthcare">Healthcare</SelectItem>
              <SelectItem value="education">Education</SelectItem>
              <SelectItem value="manufacturing">Manufacturing</SelectItem>
              <SelectItem value="finance">Finance & Banking</SelectItem>
              <SelectItem value="retail">Retail</SelectItem>
              <SelectItem value="consulting">Consulting</SelectItem>
              <SelectItem value="media">Media & Entertainment</SelectItem>
              <SelectItem value="energy">Energy</SelectItem>
              <SelectItem value="ecommerce">E-commerce</SelectItem>
              <SelectItem value="other">Other</SelectItem>
            </SelectContent>
          </Select>
          <FieldError message={errors.industry} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="companySize">Company Size</Label>
          <Select value={values.companySize} onValueChange={(value) => onSelectChange('companySize', value)}>
            <SelectTrigger>
              <SelectValue placeholder="Select company size" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1-10">1-10 employees</SelectItem>
              <SelectItem value="11-50">11-50 employees</SelectItem>
              <SelectItem value="51-200">51-200 employees</SelectItem>
              <SelectItem value="201-500">201-500 employees</SelectItem>
              <SelectItem value="501-1000">501-1000 employees</SelectItem>
              <SelectItem value="1001+">1001+ employees</SelectItem>
            </SelectContent>
          </Select>
          <FieldError message={errors.companySize} />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="website">Website</Label>
        <Input
          id="website"
          name="website"
          type="url"
          value={values.website}
          onChange={onChange}
          placeholder="https://www.yourcompany.com"
        />
      </div>
    </div>
  )
}
