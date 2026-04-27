'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

import { Header } from '@/components/header'
import ProtectedRoute from '@/components/protected-route'
import { useAuth } from '@/lib/auth-context'
import { useToast } from '@/hooks/use-toast'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { StyledSelect } from '@/components/ui/styled-select'
import { Textarea } from '@/components/ui/textarea'
import {
  getDefaultTransactionType,
  IMPACT_AREA_OPTIONS,
  isTransactionAllowedForOfferType,
  OFFER_TYPE_OPTIONS,
  OFFER_TYPE_TRANSACTION_MATRIX,
  OfferType,
  parseCsvToStringArray,
  PriceType,
  toNullableNumber,
  toNullablePositiveNumber,
  TransactionType,
  TRANSACTION_TYPE_OPTIONS
} from '@/lib/service-offers'

type FormData = {
  title: string
  description: string
  offer_type: OfferType
  transaction_type: TransactionType
  impact_area: string[]
  tags: string
  requirements: string
  city: string
  state_province: string
  pincode: string
  coverage_area: string
  price_type: PriceType
  price_amount: number | ''

  funding_type: string
  budget_amount: number | ''
  disbursement_schedule: string
  funding_window_start: string
  funding_window_end: string
  eligibility_conditions: string

  skills_required: string
  experience_requirements: string
  employment_type: string
  remote_onsite: string
  wage_per_day: number | ''
  hours_per_day: number | ''
  duration: string

  condition: string
  stock_status: string
  material_quantity: number | ''
  material_unit: string
  material_available_from: string
  material_available_to: string

  infra_type: string
  infra_capacity: number | ''
  facilities: string
  infra_available_from: string
  infra_available_to: string
}

const initialFormData: FormData = {
  title: '',
  description: '',
  offer_type: 'financial',
  transaction_type: getDefaultTransactionType('financial'),
  impact_area: [],
  tags: '',
  requirements: '',
  city: '',
  state_province: '',
  pincode: '',
  coverage_area: '',
  price_type: 'free',
  price_amount: '',

  funding_type: '',
  budget_amount: '',
  disbursement_schedule: '',
  funding_window_start: '',
  funding_window_end: '',
  eligibility_conditions: '',

  skills_required: '',
  experience_requirements: '',
  employment_type: '',
  remote_onsite: '',
  wage_per_day: '',
  hours_per_day: '',
  duration: '',

  condition: '',
  stock_status: '',
  material_quantity: '',
  material_unit: '',
  material_available_from: '',
  material_available_to: '',

  infra_type: '',
  infra_capacity: '',
  facilities: '',
  infra_available_from: '',
  infra_available_to: '',

}

export default function CreateServiceOfferPage() {
  const router = useRouter()
  const { user, token } = useAuth()
  const { toast } = useToast()

  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState<FormData>(initialFormData)

  const transactionOptionsForOfferType = TRANSACTION_TYPE_OPTIONS.filter((option) =>
    OFFER_TYPE_TRANSACTION_MATRIX[formData.offer_type].includes(option.value)
  )

  const requiresPricing = formData.transaction_type === 'rent' || formData.transaction_type === 'sell'

  const setField = <K extends keyof FormData>(name: K, value: FormData[K]) => {
    setFormData((prev) => ({ ...prev, [name]: value }))
  }

  const handleTextInput = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target
    const numericFields = new Set([
      'price_amount',
      'budget_amount',
      'wage_per_day',
      'hours_per_day',
      'material_quantity',
      'infra_capacity'
    ])

    setFormData((prev) => ({
      ...prev,
      [name]: numericFields.has(name) ? (value === '' ? '' : Number(value)) : value
    }))
  }

  const handleOfferTypeChange = (offerType: OfferType) => {
    setFormData((prev) => {
      const transaction_type = isTransactionAllowedForOfferType(offerType, prev.transaction_type)
        ? prev.transaction_type
        : getDefaultTransactionType(offerType)

      return {
        ...prev,
        offer_type: offerType,
        transaction_type,
        price_type: offerType === 'financial' || transaction_type === 'donate' || transaction_type === 'volunteer' ? 'free' : prev.price_type,
        price_amount: offerType === 'financial' || transaction_type === 'donate' || transaction_type === 'volunteer' ? '' : prev.price_amount,
      }
    })
  }

  const handleTransactionTypeChange = (transactionType: TransactionType) => {
    if (!isTransactionAllowedForOfferType(formData.offer_type, transactionType)) return

    setFormData((prev) => ({
      ...prev,
      transaction_type: transactionType,
      price_type: transactionType === 'rent' || transactionType === 'sell' ? 'fixed' : 'free',
      price_amount: transactionType === 'rent' || transactionType === 'sell' ? prev.price_amount : ''
    }))
  }

  const toggleImpactArea = (impactArea: string) => {
    setFormData((prev) => ({
      ...prev,
      impact_area: prev.impact_area.includes(impactArea)
        ? prev.impact_area.filter((area) => area !== impactArea)
        : [...prev.impact_area, impactArea]
    }))
  }

  const buildOfferDetails = () => {
    if (formData.offer_type === 'financial') {
      return {
        funding_type: formData.funding_type || null,
        budget_amount: toNullablePositiveNumber(formData.budget_amount),
        disbursement_schedule: formData.disbursement_schedule || null,
        funding_window_start: formData.funding_window_start || null,
        funding_window_end: formData.funding_window_end || null,
        eligibility_conditions: formData.eligibility_conditions.trim() || null
      }
    }

    if (formData.offer_type === 'service') {
      return {
        skills_required: parseCsvToStringArray(formData.skills_required),
        experience_requirements: formData.experience_requirements.trim() || null,
        employment_type: formData.employment_type || null,
        remote_onsite: formData.remote_onsite || null,
        wage_info: toNullablePositiveNumber(formData.wage_per_day) ? { per_day: Number(formData.wage_per_day) } : null,
        hours_per_day: toNullablePositiveNumber(formData.hours_per_day),
        duration: formData.duration.trim() || null
      }
    }

    if (formData.offer_type === 'material') {
      return {
        condition: formData.condition || null,
        stock_status: formData.stock_status || null,
        quantity: toNullablePositiveNumber(formData.material_quantity),
        unit: formData.material_unit.trim() || null,
        available_from: formData.material_available_from || null,
        available_to: formData.transaction_type === 'sell' ? null : (formData.material_available_to || null)
      }
    }

    return {
      infra_type: formData.infra_type || null,
      capacity: toNullablePositiveNumber(formData.infra_capacity),
      facilities: parseCsvToStringArray(formData.facilities),
      available_from: formData.infra_available_from || null,
      available_to: formData.transaction_type === 'sell' ? null : (formData.infra_available_to || null)
    }
  }

  const validateBeforeSubmit = () => {
    if (!formData.title.trim() || !formData.description.trim()) {
      return 'Please complete all required capability details.'
    }

    if (!isTransactionAllowedForOfferType(formData.offer_type, formData.transaction_type)) {
      return 'Selected transaction type is not valid for this offer type.'
    }

    if (formData.impact_area.length === 0) {
      return 'Please select at least one impact area.'
    }

    if (requiresPricing) {
      if (!['fixed', 'negotiable'].includes(formData.price_type)) {
        return 'For rent/sell offers, choose fixed or negotiable pricing.'
      }

      if (toNullablePositiveNumber(formData.price_amount) === null) {
        return 'Please enter a valid price amount for rent/sell offers.'
      }
    }

    return null
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!token) {
      toast({ title: 'Authentication Error', description: 'Please log in to continue.', variant: 'destructive' })
      return
    }

    const validationError = validateBeforeSubmit()
    if (validationError) {
      toast({ title: 'Validation Error', description: validationError, variant: 'destructive' })
      return
    }

    const forcedFreePricing = formData.offer_type === 'financial' || formData.transaction_type === 'volunteer' || formData.transaction_type === 'donate'
    const priceType = forcedFreePricing ? 'free' : formData.price_type
    const priceAmount = forcedFreePricing ? 0 : Number(formData.price_amount)

    const payload = {
      title: formData.title.trim(),
      description: formData.description.trim(),
      offer_type: formData.offer_type,
      transaction_type: formData.transaction_type,
      impact_area: formData.impact_area,
      tags: parseCsvToStringArray(formData.tags),
      requirements: formData.requirements.trim() || null,
      city: formData.city.trim() || null,
      state_province: formData.state_province.trim() || null,
      pincode: formData.pincode.trim() || null,
      coverage_area: formData.coverage_area.trim() || null,
      price_type: priceType,
      price_amount: priceAmount,
      offer_details: buildOfferDetails()
    }

    setLoading(true)

    try {
      const response = await fetch('/api/service-offers', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      })

      const data = await response.json()

      if (response.ok) {
        toast({ title: 'Capability Offer Created', description: data.data?.message || 'Offer submitted successfully.' })
        router.push('/service-offers?view=my-offers')
        return
      }

      toast({ title: 'Error', description: data.error || 'Failed to create service offer', variant: 'destructive' })
    } catch {
      toast({ title: 'Error', description: 'Unexpected error while creating offer', variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }

  if (!user) return null

  return (
    <ProtectedRoute requireVerification={true} permission="canCreateServiceOffers">
      <div className="min-h-screen bg-gray-50">
        <Header />

        <div className="max-w-4xl mx-auto p-6">
          <div className="mb-8">
            <Button variant="ghost" onClick={() => router.back()} className="mb-4 px-0 text-blue-600 hover:text-blue-700 hover:bg-transparent active:bg-transparent focus-visible:bg-transparent focus-visible:ring-0">
              <ArrowLeft size={18} className="mr-2" />
              Back
            </Button>
            <h1 className="text-3xl font-bold text-gray-900">Create Capability Offer</h1>
            <p className="text-gray-600 mt-2">Publish what you can fund, supply, execute, or support.</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
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

                <div>
                  <Label htmlFor="description">Description *</Label>
                  <Textarea id="description" name="description" value={formData.description} onChange={handleTextInput} rows={4} required />
                </div>

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

            <Card>
              <CardHeader>
                <CardTitle>Impact Area</CardTitle>
                <CardDescription>Select one or more SDG-based impact areas.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {IMPACT_AREA_OPTIONS.map((option) => {
                    const selected = formData.impact_area.includes(option.value)
                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => toggleImpactArea(option.value)}
                        className={`rounded-full border px-3 py-1.5 text-sm transition ${selected ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-300 hover:border-blue-400'}`}
                      >
                        {option.label}
                      </button>
                    )
                  })}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Pricing</CardTitle>
                <CardDescription>Pricing is only used for rent/sell. Financial/donate/volunteer are free by design.</CardDescription>
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
                    <Label htmlFor="price_amount">Price Amount {requiresPricing ? '*' : ''}</Label>
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
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Offer Details (JSONB)</CardTitle>
                <CardDescription>Type-specific fields based on offer type.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {formData.offer_type === 'financial' && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label>Funding Type</Label>
                      <StyledSelect
                        value={formData.funding_type}
                        options={[
                          { value: '', label: 'Select funding type' },
                          { value: 'grant', label: 'Grant' },
                          { value: 'donation', label: 'Donation' },
                          { value: 'loan', label: 'Loan' },
                          { value: 'scholarship', label: 'Scholarship' }
                        ]}
                        onValueChange={(value) => setField('funding_type', value)}
                      />
                    </div>
                    <div>
                      <Label htmlFor="budget_amount">Budget Amount</Label>
                      <Input id="budget_amount" name="budget_amount" type="number" min="0" value={formData.budget_amount} onChange={handleTextInput} />
                    </div>
                    <div>
                      <Label>Disbursement Schedule</Label>
                      <StyledSelect
                        value={formData.disbursement_schedule}
                        options={[
                          { value: '', label: 'Select schedule' },
                          { value: 'one-time', label: 'One-time' },
                          { value: 'milestone', label: 'Milestone' },
                          { value: 'quarterly', label: 'Quarterly' }
                        ]}
                        onValueChange={(value) => setField('disbursement_schedule', value)}
                      />
                    </div>
                    <div>
                      <Label htmlFor="funding_window_start">Funding Window Start</Label>
                      <Input id="funding_window_start" name="funding_window_start" type="date" value={formData.funding_window_start} onChange={handleTextInput} />
                    </div>
                    <div>
                      <Label htmlFor="funding_window_end">Funding Window End</Label>
                      <Input id="funding_window_end" name="funding_window_end" type="date" value={formData.funding_window_end} onChange={handleTextInput} />
                    </div>
                    <div className="md:col-span-2">
                      <Label htmlFor="eligibility_conditions">Eligibility Conditions</Label>
                      <Textarea id="eligibility_conditions" name="eligibility_conditions" value={formData.eligibility_conditions} onChange={handleTextInput} rows={3} />
                    </div>
                  </div>
                )}

                {formData.offer_type === 'service' && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="md:col-span-2">
                      <Label htmlFor="skills_required">Skills Required (comma separated)</Label>
                      <Input id="skills_required" name="skills_required" value={formData.skills_required} onChange={handleTextInput} placeholder="teaching, legal, project management" />
                    </div>
                    <div className="md:col-span-2">
                      <Label htmlFor="experience_requirements">Experience Requirements</Label>
                      <Input id="experience_requirements" name="experience_requirements" value={formData.experience_requirements} onChange={handleTextInput} />
                    </div>
                    <div>
                      <Label>Employment Type</Label>
                      <StyledSelect
                        value={formData.employment_type}
                        options={[
                          { value: '', label: 'Select employment type' },
                          { value: 'full_time', label: 'Full Time' },
                          { value: 'part_time', label: 'Part Time' },
                          { value: 'contract', label: 'Contract' }
                        ]}
                        onValueChange={(value) => setField('employment_type', value)}
                      />
                    </div>
                    <div>
                      <Label>Remote / Onsite</Label>
                      <StyledSelect
                        value={formData.remote_onsite}
                        options={[
                          { value: '', label: 'Select mode' },
                          { value: 'remote', label: 'Remote' },
                          { value: 'onsite', label: 'Onsite' },
                          { value: 'hybrid', label: 'Hybrid' }
                        ]}
                        onValueChange={(value) => setField('remote_onsite', value)}
                      />
                    </div>
                    <div>
                      <Label htmlFor="wage_per_day">Wage Per Day</Label>
                      <Input id="wage_per_day" name="wage_per_day" type="number" min="0" value={formData.wage_per_day} onChange={handleTextInput} />
                    </div>
                    <div>
                      <Label htmlFor="hours_per_day">Hours Per Day</Label>
                      <Input id="hours_per_day" name="hours_per_day" type="number" min="0" value={formData.hours_per_day} onChange={handleTextInput} />
                    </div>
                    <div className="md:col-span-2">
                      <Label htmlFor="duration">Duration</Label>
                      <Input id="duration" name="duration" value={formData.duration} onChange={handleTextInput} placeholder="e.g., 3 months" />
                    </div>
                  </div>
                )}

                {formData.offer_type === 'material' && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label>Condition</Label>
                      <StyledSelect
                        value={formData.condition}
                        options={[
                          { value: '', label: 'Select condition' },
                          { value: 'new', label: 'New' },
                          { value: 'used', label: 'Used' },
                          { value: 'refurbished', label: 'Refurbished' }
                        ]}
                        onValueChange={(value) => setField('condition', value)}
                      />
                    </div>
                    <div>
                      <Label>Stock Status</Label>
                      <StyledSelect
                        value={formData.stock_status}
                        options={[
                          { value: '', label: 'Select stock status' },
                          { value: 'in_stock', label: 'In Stock' },
                          { value: 'out_of_stock', label: 'Out of Stock' },
                          { value: 'limited', label: 'Limited' }
                        ]}
                        onValueChange={(value) => setField('stock_status', value)}
                      />
                    </div>
                    <div>
                      <Label htmlFor="material_quantity">Quantity</Label>
                      <Input id="material_quantity" name="material_quantity" type="number" min="0" value={formData.material_quantity} onChange={handleTextInput} />
                    </div>
                    <div>
                      <Label htmlFor="material_unit">Unit</Label>
                      <Input id="material_unit" name="material_unit" value={formData.material_unit} onChange={handleTextInput} placeholder="kits, items, pieces" />
                    </div>
                    <div>
                      <Label htmlFor="material_available_from">Available From</Label>
                      <Input id="material_available_from" name="material_available_from" type="date" value={formData.material_available_from} onChange={handleTextInput} />
                    </div>
                    {formData.transaction_type !== 'sell' && (
                      <div>
                        <Label htmlFor="material_available_to">Available To</Label>
                        <Input id="material_available_to" name="material_available_to" type="date" value={formData.material_available_to} onChange={handleTextInput} />
                      </div>
                    )}
                  </div>
                )}

                {formData.offer_type === 'infrastructure' && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label>Infrastructure Type</Label>
                      <StyledSelect
                        value={formData.infra_type}
                        options={[
                          { value: '', label: 'Select infra type' },
                          { value: 'machine', label: 'Machine' },
                          { value: 'building', label: 'Building' },
                          { value: 'lab', label: 'Lab' },
                          { value: 'vehicle', label: 'Vehicle' },
                          { value: 'land', label: 'Land' }
                        ]}
                        onValueChange={(value) => setField('infra_type', value)}
                      />
                    </div>
                    <div>
                      <Label htmlFor="infra_capacity">Capacity</Label>
                      <Input id="infra_capacity" name="infra_capacity" type="number" min="0" value={formData.infra_capacity} onChange={handleTextInput} />
                    </div>
                    <div className="md:col-span-2">
                      <Label htmlFor="facilities">Facilities (comma separated)</Label>
                      <Input id="facilities" name="facilities" value={formData.facilities} onChange={handleTextInput} placeholder="AC, projector, parking" />
                    </div>
                    <div>
                      <Label htmlFor="infra_available_from">Available From</Label>
                      <Input id="infra_available_from" name="infra_available_from" type="date" value={formData.infra_available_from} onChange={handleTextInput} />
                    </div>
                    {formData.transaction_type !== 'sell' && (
                      <div>
                        <Label htmlFor="infra_available_to">Available To</Label>
                        <Input id="infra_available_to" name="infra_available_to" type="date" value={formData.infra_available_to} onChange={handleTextInput} />
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

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

            <div className="flex gap-4">
              <Button type="submit" disabled={loading} className="flex-1">
                {loading ? 'Creating...' : 'Create Capability Offer'}
              </Button>
              <Button type="button" variant="outline" asChild>
                <Link href="/service-offers">Cancel</Link>
              </Button>
            </div>
          </form>
        </div>
      </div>
    </ProtectedRoute>
  )
}
