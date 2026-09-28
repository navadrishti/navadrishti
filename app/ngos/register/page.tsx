'use client'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { MultiSelectDropdown } from '@/components/ui/multi-select-dropdown'
import { CSR_SCHEDULE_VII_CATEGORIES } from '@/lib/categories'
import { ContactSection } from '@/components/registration/contact-section'
import { FieldError } from '@/components/registration/field-error'
import { RegistrationCard } from '@/components/registration/registration-card'
import { ExecutionCapacityField } from './execution-capacity-field'
import { GeographicCoverageField } from './geographic-coverage-field'
import { NgoDetailsSection } from './ngo-details-section'
import { NgoLocationSection } from './ngo-location-section'
import { PastProjectsField } from './past-projects-field'
import { useNgoRegistration } from './use-ngo-registration'

export default function NGORegister() {
  const {
    formData,
    formErrors,
    handleChange,
    setField,
    handleCountryChange,
    setPincode,
    emailOtp,
    error,
    isSubmitting,
    handleSubmit,
    pastProjects,
    geographicAreas,
    updateExecutionCapacity,
  } = useNgoRegistration()

  return (
    <RegistrationCard
      title="Register as NGO"
      description="Create your NGO account to connect with volunteers and companies"
      error={error}
      onSubmit={handleSubmit}
      submitDisabled={isSubmitting || !emailOtp.verified}
      isSubmitting={isSubmitting}
      submitLabel="Create NGO Account"
      submittingLabel="Creating account..."
    >
      <div className="space-y-4">
        <h3 className="text-lg font-medium">NGO Information</h3>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="ngoName">NGO Name</Label>
            <Input
              id="ngoName"
              name="ngoName"
              value={formData.ngoName}
              onChange={handleChange}
              placeholder="Your NGO Name"
            />
            <FieldError message={formErrors.ngoName} />
          </div>
        </div>
      </div>

      <ContactSection
        values={formData}
        errors={formErrors}
        onChange={handleChange}
        emailOtp={emailOtp}
        emailPlaceholder="ngo@example.com"
        passwordPlaceholder="At least 8 characters"
        confirmPasswordPlaceholder="Re-enter your password"
      />

      <NgoDetailsSection values={formData} errors={formErrors} onChange={handleChange} />

      <div className="space-y-4">
        <h3 className="text-lg font-medium">Program Details</h3>
        <p className="text-sm text-muted-foreground">
          Schedule VII sectors are required. Other program details can be added now or updated later from your profile.
        </p>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="sectorsScheduleVii">Sectors Worked (Schedule VII)</Label>
            <MultiSelectDropdown
              value={formData.sectorsScheduleVii}
              options={CSR_SCHEDULE_VII_CATEGORIES}
              placeholder="Select Schedule VII sectors"
              onValueChange={(value) => setField('sectorsScheduleVii', value)}
            />
            <p className="text-xs text-muted-foreground">Choose all Schedule VII areas your NGO works in.</p>
            <FieldError message={formErrors.sectorsScheduleVii} />
          </div>

          <PastProjectsField
            projects={formData.pastProjects}
            onUpdate={pastProjects.update}
            onAdd={pastProjects.add}
            onRemove={pastProjects.remove}
          />

          <GeographicCoverageField
            areas={formData.geographicCoverageAreas}
            onUpdate={geographicAreas.update}
            onAdd={geographicAreas.add}
            onRemove={geographicAreas.remove}
          />

          <ExecutionCapacityField capacity={formData.executionCapacity} onUpdate={updateExecutionCapacity} />
        </div>
      </div>

      <NgoLocationSection
        values={formData}
        errors={formErrors}
        onChange={handleChange}
        onCountryChange={handleCountryChange}
        onStateSelect={(value) => setField('state', value)}
        onPincodeChange={setPincode}
      />
    </RegistrationCard>
  )
}
