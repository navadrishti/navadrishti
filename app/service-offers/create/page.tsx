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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'

type OfferType = 'financial' | 'material' | 'service' | 'infrastructure'
type TransactionType = 'sell' | 'rent' | 'volunteer'

type FormData = {
  title: string
  description: string
  offer_type: OfferType
  transaction_type: TransactionType
  sell_amount: number | ''
  rent_per_day: number | ''
  amount: number | ''
  location_scope: string
  conditions: string
  item: string
  quantity: number | ''
  delivery_scope: string
  skill: string
  capacity: string
  duration: string
  scope: string
  budget_range: string
}

const OFFER_TYPES: { value: OfferType; label: string }[] = [
  { value: 'financial', label: 'Financial' },
  { value: 'material', label: 'Material' },
  { value: 'service', label: 'Service/Skill' },
  { value: 'infrastructure', label: 'Infrastructure' }
]

const TRANSACTION_TYPES: { value: TransactionType; label: string }[] = [
  { value: 'sell', label: 'Sell' },
  { value: 'rent', label: 'Rent' },
  { value: 'volunteer', label: 'Volunteer' }
]

export default function CreateServiceOfferPage() {
  const router = useRouter()
  const { user, token } = useAuth()
  const { toast } = useToast()

  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState<FormData>({
    title: '',
    description: '',
    offer_type: 'financial',
    transaction_type: 'sell',
    sell_amount: '',
    rent_per_day: '',
    amount: '',
    location_scope: '',
    conditions: '',
    item: '',
    quantity: '',
    delivery_scope: '',
    skill: '',
    capacity: '',
    duration: '',
    scope: '',
    budget_range: ''
  })

  const handleInput = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target
    const numericFields = new Set(['amount', 'quantity', 'sell_amount', 'rent_per_day'])

    setFormData((prev) => ({
      ...prev,
      [name]: numericFields.has(name) ? (value === '' ? '' : Number(value)) : value
    }))
  }

  const handleSelect = <K extends keyof FormData>(name: K, value: FormData[K]) => {
    setFormData((prev) => ({ ...prev, [name]: value }))
  }

  const buildOfferDetailsPayload = () => {
    const resolvedAmount = formData.transaction_type === 'volunteer'
      ? 0
      : formData.transaction_type === 'rent'
        ? (formData.rent_per_day === '' ? null : Number(formData.rent_per_day))
        : (formData.sell_amount === '' ? null : Number(formData.sell_amount))

    switch (formData.offer_type) {
      case 'financial':
        return {
          amount: resolvedAmount,
          location_scope: formData.location_scope,
          conditions: formData.conditions
        }
      case 'material':
        return {
          item: formData.item,
          quantity: formData.quantity,
          delivery_scope: formData.delivery_scope
        }
      case 'service':
        return {
          skill: formData.skill,
          capacity: formData.capacity,
          duration: formData.duration
        }
      case 'infrastructure':
        return {
          scope: formData.scope,
          capacity: formData.capacity,
          budget_range: formData.budget_range
        }
      default:
        return {}
    }
  }

  const buildTransactionPayload = () => {
    if (formData.transaction_type === 'volunteer') {
      return {
        transaction_type: 'volunteer' as TransactionType,
        sell_amount: 0,
        rent_per_day: 0
      }
    }

    if (formData.transaction_type === 'rent') {
      return {
        transaction_type: 'rent' as TransactionType,
        sell_amount: null,
        rent_per_day: formData.rent_per_day
      }
    }

    return {
      transaction_type: 'sell' as TransactionType,
      sell_amount: formData.sell_amount,
      rent_per_day: 0
    }
  }

  const hasOfferSpecificFields = () => {
    switch (formData.offer_type) {
      case 'financial':
        return !!formData.location_scope.trim()
      case 'material':
        return !!formData.item.trim() && formData.quantity !== '' && !!formData.delivery_scope.trim()
      case 'service':
        return !!formData.skill.trim() && formData.capacity !== '' && !!formData.duration.trim()
      case 'infrastructure':
        return !!formData.scope.trim() && formData.capacity !== '' && !!formData.budget_range.trim()
      default:
        return false
    }
  }

  const hasTransactionSpecificFields = () => {
    switch (formData.transaction_type) {
      case 'volunteer':
        return true
      case 'rent':
        return formData.rent_per_day !== '' && Number(formData.rent_per_day) > 0
      case 'sell':
      default:
        return formData.sell_amount !== '' && Number(formData.sell_amount) > 0
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!token) {
      toast({ title: 'Authentication Error', description: 'Please log in to continue.', variant: 'destructive' })
      return
    }

    if (!formData.title.trim() || !formData.description.trim()) {
      toast({ title: 'Validation Error', description: 'Please complete all required fields.', variant: 'destructive' })
      return
    }

    if (!hasOfferSpecificFields()) {
      toast({ title: 'Validation Error', description: 'Please complete all required offer details.', variant: 'destructive' })
      return
    }

    if (!hasTransactionSpecificFields()) {
      toast({ title: 'Validation Error', description: 'Please complete all required pricing details.', variant: 'destructive' })
      return
    }

    setLoading(true)

    try {
      const response = await fetch('/api/service-offers', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          title: formData.title,
          description: formData.description,
          offer_type: formData.offer_type,
          ...buildTransactionPayload(),
          ...buildOfferDetailsPayload()
        })
      })

      const data = await response.json()

      if (response.ok) {
        toast({ title: 'Capability Offer Created', description: data.data?.message || 'Offer submitted successfully.' })
        router.push('/service-offers?view=my-offers')
        return
      }

      toast({ title: 'Error', description: data.error || 'Failed to create service offer', variant: 'destructive' })
    } catch (error) {
      toast({ title: 'Error', description: 'Unexpected error while creating offer', variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }

  if (!user) return null

  return (
    <ProtectedRoute
      requireVerification={true}
      permission="canCreateServiceOffers"
    >
      <div className="min-h-screen bg-gray-50">
        <Header />

        <div className="max-w-3xl mx-auto p-6">
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
                <CardDescription>Define your execution capacity in a structured, match-ready way.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="title">Offer Title *</Label>
                  <Input
                    id="title"
                    name="title"
                    value={formData.title}
                    onChange={handleInput}
                    placeholder="e.g., Funding support for school infrastructure"
                    required
                  />
                </div>

                <div>
                  <Label htmlFor="description">Description *</Label>
                  <Textarea
                    id="description"
                    name="description"
                    value={formData.description}
                    onChange={handleInput}
                    placeholder="Explain your capability, limits, and engagement model."
                    rows={4}
                    required
                  />
                </div>

                <div className="grid grid-cols-1 gap-4">
                  <div>
                    <Label htmlFor="offer_type">Offer Type *</Label>
                    <Select
                      value={formData.offer_type}
                      onValueChange={(value) => handleSelect('offer_type', value as OfferType)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select offer type" />
                      </SelectTrigger>
                      <SelectContent>
                        {OFFER_TYPES.map((type) => (
                          <SelectItem key={type.value} value={type.value}>
                            {type.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label htmlFor="transaction_type">Offer Mode *</Label>
                    <Select
                      value={formData.transaction_type}
                      onValueChange={(value) => handleSelect('transaction_type', value as TransactionType)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select offer mode" />
                      </SelectTrigger>
                      <SelectContent>
                        {TRANSACTION_TYPES.map((type) => (
                          <SelectItem key={type.value} value={type.value}>
                            {type.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Offer Details</CardTitle>
                <CardDescription>Provide details specific to the selected offer type.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {formData.transaction_type === 'sell' && (
                    <div>
                      <Label htmlFor="sell_amount">Amount (₹) *</Label>
                      <Input
                        id="sell_amount"
                        name="sell_amount"
                        type="number"
                        min="0"
                        value={formData.sell_amount}
                        onChange={handleInput}
                        placeholder="e.g., 25000"
                        required
                      />
                    </div>
                  )}

                  {formData.transaction_type === 'rent' && (
                    <div>
                      <Label htmlFor="rent_per_day">Per Day Charge (₹) *</Label>
                      <Input
                        id="rent_per_day"
                        name="rent_per_day"
                        type="number"
                        min="0"
                        value={formData.rent_per_day}
                        onChange={handleInput}
                        placeholder="e.g., 1500"
                        required
                      />
                    </div>
                  )}

                </div>

                {formData.offer_type === 'financial' && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="md:col-span-2">
                      <Label htmlFor="location_scope">Location Scope *</Label>
                      <Input
                        id="location_scope"
                        name="location_scope"
                        value={formData.location_scope}
                        onChange={handleInput}
                        placeholder="e.g., India, North India, NCR"
                        required
                      />
                    </div>
                    <div className="md:col-span-2">
                      <Label htmlFor="conditions">Conditions</Label>
                      <Textarea
                        id="conditions"
                        name="conditions"
                        value={formData.conditions}
                        onChange={handleInput}
                        placeholder="Mention any disbursal conditions or eligibility constraints"
                        rows={3}
                      />
                    </div>
                  </div>
                )}

                {formData.offer_type === 'material' && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="item">Item Name *</Label>
                      <Input
                        id="item"
                        name="item"
                        value={formData.item}
                        onChange={handleInput}
                        placeholder="e.g., Blankets, School Kits, Medical Supplies"
                        required
                      />
                    </div>
                    <div>
                      <Label htmlFor="quantity">Quantity *</Label>
                      <Input
                        id="quantity"
                        name="quantity"
                        type="number"
                        min="0"
                        value={formData.quantity}
                        onChange={handleInput}
                        placeholder="e.g., 1000"
                        required
                      />
                    </div>
                    <div className="md:col-span-2">
                      <Label htmlFor="delivery_scope">Delivery Scope *</Label>
                      <Input
                        id="delivery_scope"
                        name="delivery_scope"
                        value={formData.delivery_scope}
                        onChange={handleInput}
                        placeholder="e.g., North India, NCR, Pan India"
                        required
                      />
                    </div>
                  </div>
                )}

                {formData.offer_type === 'service' && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="skill">Skill Offered *</Label>
                      <Input
                        id="skill"
                        name="skill"
                        value={formData.skill}
                        onChange={handleInput}
                        placeholder="e.g., Legal Advisory, Content Design, Medical Assistance"
                        required
                      />
                    </div>
                    <div>
                      <Label htmlFor="capacity">Capacity *</Label>
                      <Input
                        id="capacity"
                        name="capacity"
                        value={formData.capacity}
                        onChange={handleInput}
                        placeholder="e.g., 10 volunteers"
                        required
                      />
                    </div>
                    <div className="md:col-span-2">
                      <Label htmlFor="duration">Duration *</Label>
                      <Input
                        id="duration"
                        name="duration"
                        value={formData.duration}
                        onChange={handleInput}
                        placeholder="e.g., 3 months"
                        required
                      />
                    </div>
                  </div>
                )}

                {formData.offer_type === 'infrastructure' && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="scope">Infrastructure Scope *</Label>
                      <Input
                        id="scope"
                        name="scope"
                        value={formData.scope}
                        onChange={handleInput}
                        placeholder="e.g., Construction"
                        required
                      />
                    </div>
                    <div>
                      <Label htmlFor="capacity">Capacity *</Label>
                      <Input
                        id="capacity"
                        name="capacity"
                        value={formData.capacity}
                        onChange={handleInput}
                        placeholder="e.g., 2 schools"
                        required
                      />
                    </div>
                    <div className="md:col-span-2">
                      <Label htmlFor="budget_range">Budget Range *</Label>
                      <Input
                        id="budget_range"
                        name="budget_range"
                        value={formData.budget_range}
                        onChange={handleInput}
                        placeholder="e.g., Rs 10L to Rs 20L"
                        required
                      />
                    </div>
                  </div>
                )}
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
