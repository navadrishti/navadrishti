import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { StyledSelect } from '@/components/ui/styled-select'
import type { PriceType } from '@/lib/service-offers'

import type { ServiceOfferForm } from './use-service-offer-form'

export function RentalRateFields({ form }: { form: ServiceOfferForm }) {
  const { formData, setField, handleTextInput } = form

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <div>
        <Label htmlFor="unit_rate">Daily Rental Rate (INR)</Label>
        <Input id="unit_rate" name="unit_rate" type="number" min="0" value={formData.unit_rate} onChange={handleTextInput} />
      </div>
      <div>
        <Label>Billing Cycle</Label>
        <StyledSelect
          value={formData.billing_cycle}
          options={[{ value: 'daily', label: 'Daily' }, { value: 'monthly', label: 'Monthly' }, { value: 'one_time', label: 'One-time' }]}
          onValueChange={(value) => setField('billing_cycle', value)}
        />
      </div>
      <div>
        <Label htmlFor="rate_currency">Currency</Label>
        <Input id="rate_currency" name="rate_currency" value={formData.rate_currency} onChange={handleTextInput} />
      </div>
    </div>
  )
}

export function PricingCard({ form }: { form: ServiceOfferForm }) {
  const { formData, setField, handleTextInput, requiresPricing } = form

  return (
    <Card>
      <CardHeader>
        <CardTitle>Pricing</CardTitle>
        <CardDescription>Pricing applies to daily rental offers only. Financial, donate, and volunteer capabilities are free.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label>Price Type</Label>
            <StyledSelect
              value={requiresPricing ? formData.price_type : 'free'}
              options={requiresPricing ? [{ value: 'fixed', label: 'Fixed' }, { value: 'negotiable', label: 'Negotiable' }] : [{ value: 'free', label: 'Free' }]}
              onValueChange={(value) => setField('price_type', value as PriceType)}
            />
          </div>
          <div>
            <Label htmlFor="price_amount">Daily Rate (synced) {requiresPricing ? '*' : ''}</Label>
            <Input
              id="price_amount"
              name="price_amount"
              type="number"
              min="0"
              value={requiresPricing ? formData.price_amount : 0}
              onChange={handleTextInput}
              disabled={!requiresPricing}
              required={requiresPricing}
            />
          </div>
        </div>
        <div>
          <Label htmlFor="valid_until">Validity End Date *</Label>
          <Input id="valid_until" name="valid_until" type="date" value={formData.valid_until} onChange={handleTextInput} required={true} />
          <p className="mt-1 text-xs text-gray-500">This offer will automatically expire at the end of the selected date.</p>
        </div>
      </CardContent>
    </Card>
  )
}
