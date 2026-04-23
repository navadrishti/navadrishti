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

type OfferType = 'financial' | 'material' | 'service' | 'infrastructure'
type TransactionType = 'sell' | 'rent' | 'volunteer'

type FormData = {
  title: string
  description: string
  offer_type: OfferType
  transaction_type: TransactionType
  amount: number | ''
  location_scope: string
  conditions: string
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
    amount: '',
    location_scope: '',
    conditions: ''
  })

  const handleInput = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target
    const numericFields = new Set(['amount'])

    setFormData((prev) => ({
      ...prev,
      [name]: numericFields.has(name) ? (value === '' ? '' : Number(value)) : value
    }))
  }

  const handleSelect = <K extends keyof FormData>(name: K, value: FormData[K]) => {
    setFormData((prev) => ({ ...prev, [name]: value }))
  }

  const buildResolvedAmount = () => {
    if (formData.transaction_type === 'volunteer') {
      return 0
    }
    return formData.amount === '' ? null : Number(formData.amount)
  }

  const hasTransactionSpecificFields = () => {
    switch (formData.transaction_type) {
      case 'volunteer':
        return true
      default:
        return formData.amount !== '' && Number(formData.amount) > 0
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

    if (!formData.location_scope.trim()) {
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
          transaction_type: formData.transaction_type,
          amount: buildResolvedAmount(),
          location_scope: formData.location_scope,
          conditions: formData.conditions
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
                    <StyledSelect
                      value={formData.offer_type}
                      options={OFFER_TYPES}
                      placeholder="Select offer type"
                      onValueChange={(value) => handleSelect('offer_type', value as OfferType)}
                    />
                  </div>

                  <div>
                    <Label htmlFor="transaction_type">Offer Mode *</Label>
                    <StyledSelect
                      value={formData.transaction_type}
                      options={TRANSACTION_TYPES}
                      placeholder="Select offer mode"
                      onValueChange={(value) => handleSelect('transaction_type', value as TransactionType)}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Offer Details</CardTitle>
                <CardDescription>Provide the core fields used for all capability offers.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="amount">Amount (₹){formData.transaction_type === 'volunteer' ? '' : ' *'}</Label>
                    <Input
                      id="amount"
                      name="amount"
                      type="number"
                      min="0"
                      value={formData.transaction_type === 'volunteer' ? 0 : formData.amount}
                      onChange={handleInput}
                      placeholder="e.g., 25000"
                      required={formData.transaction_type !== 'volunteer'}
                      disabled={formData.transaction_type === 'volunteer'}
                    />
                  </div>
                  <div>
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
                </div>
                <div>
                  <Label htmlFor="conditions">Conditions</Label>
                  <Textarea
                    id="conditions"
                    name="conditions"
                    value={formData.conditions}
                    onChange={handleInput}
                    placeholder="Mention any conditions or eligibility constraints"
                    rows={3}
                  />
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
