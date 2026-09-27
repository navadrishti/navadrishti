"use client"

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ContactSection } from '@/components/registration/contact-section'
import { RegistrationCard } from '@/components/registration/registration-card'
import { CompanyInfoSection } from './company-info-section'
import { CompanyLocationSection } from './company-location-section'
import { CsrProgramSection } from './csr-program-section'
import { useCompanyRegistration } from './use-company-registration'

export default function CompanyRegistration() {
  const {
    formData,
    formErrors,
    handleChange,
    setField,
    handleCountryChange,
    emailOtp,
    error,
    isSubmitting,
    handleSubmit,
  } = useCompanyRegistration()

  return (
    <RegistrationCard
      title="Register as Company"
      description="Create your company account to connect with NGOs and skilled individuals"
      error={error}
      onSubmit={handleSubmit}
      submitDisabled={isSubmitting || !emailOtp.verified}
      isSubmitting={isSubmitting}
      submitLabel="Create Company Account"
      submittingLabel="Creating Account..."
    >
      <CompanyInfoSection
        values={formData}
        errors={formErrors}
        onChange={handleChange}
        onSelectChange={setField}
      />

      <ContactSection
        values={formData}
        errors={formErrors}
        onChange={handleChange}
        emailOtp={emailOtp}
        emailPlaceholder="company@example.com"
      />

      <div className="space-y-4">
        <h3 className="text-lg font-medium">Company Details</h3>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="founded">Year Founded</Label>
            <Input
              id="founded"
              name="founded"
              type="number"
              min="1900"
              max={new Date().getFullYear()}
              value={formData.founded}
              onChange={handleChange}
              placeholder="2020"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="sector">Sector</Label>
            <Input
              id="sector"
              name="sector"
              value={formData.sector}
              onChange={handleChange}
              placeholder="IT, Finance, Manufacturing, etc."
            />
          </div>
        </div>
      </div>

      <CsrProgramSection
        values={formData}
        errors={formErrors}
        onChange={handleChange}
        onFocusAreasChange={(value) => setField('focusAreasScheduleVii', value)}
        onSelectChange={setField}
      />

      <CompanyLocationSection
        values={formData}
        errors={formErrors}
        onChange={handleChange}
        onCountryChange={handleCountryChange}
        onStateSelect={(value) => setField('state', value)}
      />
    </RegistrationCard>
  )
}
