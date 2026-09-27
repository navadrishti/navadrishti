import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { MultiSelectDropdown } from '@/components/ui/multi-select-dropdown'
import { Textarea } from '@/components/ui/textarea'
import { IMPACT_AREA_OPTIONS } from '@/lib/service-offers'

import { CapabilityDetailsCard } from './capability-details-card'
import { OfferDetailsCard } from './offer-details-card'
import { PricingCard } from './pricing-fields'
import type { ServiceOfferForm } from './use-service-offer-form'

export function ServiceOfferFormFields({ form }: { form: ServiceOfferForm }) {
  const { formData, setField, handleTextInput } = form

  return (
    <>
      <CapabilityDetailsCard form={form} />

      <Card>
        <CardHeader>
          <CardTitle>Impact Area</CardTitle>
          <CardDescription>Select one or more Schedule VII impact categories.</CardDescription>
        </CardHeader>
        <CardContent>
          <MultiSelectDropdown
            value={formData.impact_area}
            options={IMPACT_AREA_OPTIONS}
            placeholder="Select impact areas"
            onValueChange={(impactArea) => setField('impact_area', impactArea)}
          />
        </CardContent>
      </Card>

      <PricingCard form={form} />

      <OfferDetailsCard form={form} />

      <Card>
        <CardHeader>
          <CardTitle>Offer Notes</CardTitle>
          <CardDescription>Optional tags and internal notes for backend processing.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="tags">Tags (comma separated)</Label>
            <Input id="tags" name="tags" value={formData.tags} onChange={handleTextInput} />
          </div>

          <div>
            <Label htmlFor="requirements">Requirements / Notes</Label>
            <Textarea id="requirements" name="requirements" value={formData.requirements} onChange={handleTextInput} rows={3} />
          </div>
        </CardContent>
      </Card>
    </>
  )
}
