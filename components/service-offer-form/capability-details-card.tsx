import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { StyledSelect } from '@/components/ui/styled-select'
import { Textarea } from '@/components/ui/textarea'
import { OFFER_TYPE_OPTIONS, type OfferType, type TransactionType } from '@/lib/service-offers'

import { ImagesField } from './images-field'
import { RentalRateFields } from './pricing-fields'
import type { ServiceOfferForm } from './use-service-offer-form'

export function CapabilityDetailsCard({ form }: { form: ServiceOfferForm }) {
  const {
    formData,
    handleTextInput,
    handleOfferTypeChange,
    handleTransactionTypeChange,
    transactionOptionsForOfferType,
  } = form

  return (
    <Card>
      <CardHeader>
        <CardTitle>Capability Details</CardTitle>
        <CardDescription>Common fields for all capability offers.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <Label htmlFor="title">Offer Title *</Label>
          <Input id="title" name="title" value={formData.title} onChange={handleTextInput} required />
        </div>
        <RentalRateFields form={form} />

        <div>
          <Label htmlFor="description">Description *</Label>
          <Textarea id="description" name="description" value={formData.description} onChange={handleTextInput} rows={4} required />
        </div>

        <ImagesField form={form} />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label>Offer Type *</Label>
            <StyledSelect
              value={formData.offer_type}
              options={OFFER_TYPE_OPTIONS}
              placeholder="Select offer type"
              onValueChange={(value) => handleOfferTypeChange(value as OfferType)}
            />
          </div>
          <div>
            <Label>Transaction Type *</Label>
            <StyledSelect
              value={formData.transaction_type}
              options={transactionOptionsForOfferType}
              placeholder="Select transaction type"
              onValueChange={(value) => handleTransactionTypeChange(value as TransactionType)}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="city">City</Label>
            <Input id="city" name="city" value={formData.city} onChange={handleTextInput} />
          </div>
          <div>
            <Label htmlFor="state_province">State</Label>
            <Input id="state_province" name="state_province" value={formData.state_province} onChange={handleTextInput} />
          </div>
          <div>
            <Label htmlFor="pincode">Pincode</Label>
            <Input id="pincode" name="pincode" value={formData.pincode} onChange={handleTextInput} />
          </div>
          <div>
            <Label htmlFor="coverage_area">Coverage Area</Label>
            <Input id="coverage_area" name="coverage_area" value={formData.coverage_area} onChange={handleTextInput} placeholder="e.g., North India, Pan India" />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
