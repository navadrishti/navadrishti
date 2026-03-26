'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

import { Header } from '@/components/header'
import ProtectedRoute from '@/components/protected-route'
import { useAuth } from '@/lib/auth-context'
import { useToast } from '@/hooks/use-toast'
import { SERVICE_OFFER_CATEGORIES } from '@/lib/categories'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'

const validityPeriods = ['30_days', '90_days', '180_days', '1_year', 'ongoing']

export default function CreateServiceOfferPage() {
  const router = useRouter()
  const { user, token } = useAuth()
  const { toast } = useToast()

  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    offer_type: '',
    category: '',
    capacity_limit: '',
    coverage_area: '',
    category_focus: '',
    validity_period: '90_days',
    location: '',
    city: '',
    state_province: '',
    tags: [] as string[]
  })

  useEffect(() => {
    if (!user) return

    if (!['ngo', 'company', 'individual'].includes(user.user_type)) {
      toast({
        title: 'Access Denied',
        description: 'Only verified participants can publish capability offers.',
        variant: 'destructive'
      })
      router.push('/service-offers')
    }
  }, [router, toast, user])

  const handleInput = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }))
  }

  const handleSelect = (name: string, value: string) => {
    setFormData((prev) => ({ ...prev, [name]: value }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!token) {
      toast({ title: 'Authentication Error', description: 'Please log in to continue.', variant: 'destructive' })
      return
    }

    if (!formData.title || !formData.description || !formData.offer_type) {
      toast({ title: 'Validation Error', description: 'Please complete all required fields.', variant: 'destructive' })
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
          ...formData,
          category: formData.offer_type,
          tags: formData.category_focus
            .split(',')
            .map((item) => item.trim())
            .filter(Boolean)
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
      userTypes={['ngo', 'company', 'individual']}
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

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="offer_type">Capability Type *</Label>
                    <Select
                      value={formData.offer_type}
                      onValueChange={(value) => {
                        handleSelect('offer_type', value)
                        handleSelect('category', value)
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select capability type" />
                      </SelectTrigger>
                      <SelectContent>
                        {SERVICE_OFFER_CATEGORIES.map((category) => (
                          <SelectItem key={category} value={category}>
                            {category}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label htmlFor="capacity_limit">Capacity Limit *</Label>
                    <Input
                      id="capacity_limit"
                      name="capacity_limit"
                      value={formData.capacity_limit}
                      onChange={handleInput}
                      placeholder="e.g., INR 5,00,000 per quarter"
                      required
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="coverage_area">Coverage Area *</Label>
                    <Input
                      id="coverage_area"
                      name="coverage_area"
                      value={formData.coverage_area}
                      onChange={handleInput}
                      placeholder="e.g., Karnataka, Telangana"
                      required
                    />
                  </div>

                  <div>
                    <Label htmlFor="validity_period">Validity Period</Label>
                    <Select value={formData.validity_period} onValueChange={(value) => handleSelect('validity_period', value)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select validity period" />
                      </SelectTrigger>
                      <SelectContent>
                        {validityPeriods.map((period) => (
                          <SelectItem key={period} value={period}>
                            {period.replaceAll('_', ' ')}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div>
                  <Label htmlFor="category_focus">Category Focus</Label>
                  <Input
                    id="category_focus"
                    name="category_focus"
                    value={formData.category_focus}
                    onChange={handleInput}
                    placeholder="Comma-separated focus areas, e.g., education, health, disaster relief"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <Label htmlFor="city">City</Label>
                    <Input id="city" name="city" value={formData.city} onChange={handleInput} placeholder="City" />
                  </div>
                  <div>
                    <Label htmlFor="state_province">State</Label>
                    <Input id="state_province" name="state_province" value={formData.state_province} onChange={handleInput} placeholder="State" />
                  </div>
                  <div>
                    <Label htmlFor="location">Location</Label>
                    <Input id="location" name="location" value={formData.location} onChange={handleInput} placeholder="On-site / Remote / Hybrid" />
                  </div>
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
