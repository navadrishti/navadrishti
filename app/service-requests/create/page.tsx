'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

import { Header } from '@/components/header'
import ProtectedRoute from '@/components/protected-route'
import { useAuth } from '@/lib/auth-context'
import { SERVICE_REQUEST_CATEGORIES } from '@/lib/categories'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'

const urgencyLevels = ['Low', 'Medium', 'High', 'Critical']

const budgetRanges = [
  'Under INR 25,000',
  'INR 25,000 - INR 1,00,000',
  'INR 1,00,000 - INR 5,00,000',
  'INR 5,00,000+',
  'Negotiable'
]

export default function CreateServiceRequestPage() {
  const router = useRouter()
  const { user } = useAuth()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    request_type: '',
    category: '',
    location: '',
    urgency: 'Medium',
    timeline: '',
    budget: 'Under INR 25,000',
    estimated_budget: '',
    beneficiary_count: '',
    impact_description: '',
    contactInfo: ''
  })

  const handleInput = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }))
  }

  const handleSelect = (name: string, value: string) => {
    setFormData((prev) => ({ ...prev, [name]: value }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!user) {
      setError('You must be logged in to create a service request')
      return
    }

    if (!formData.impact_description.trim()) {
      setError('Impact description is required (what changes after this request is fulfilled).')
      return
    }

    if (!formData.beneficiary_count || Number(formData.beneficiary_count) <= 0) {
      setError('Beneficiary count is required and must be greater than 0.')
      return
    }

    setLoading(true)
    setError('')

    try {
      const token = localStorage.getItem('token')
      const response = await fetch('/api/service-requests', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(formData)
      })

      const data = await response.json()
      if (response.ok && data.success) {
        router.push('/service-requests')
        return
      }

      setError(data.error || data.message || 'Failed to create service request')
    } catch (err) {
      setError('Error creating service request')
    } finally {
      setLoading(false)
    }
  }

  return (
    <ProtectedRoute userTypes={['ngo']} requireVerification={true} permission="canCreateServiceRequests">
      <div className="flex min-h-screen flex-col">
        <Header />

        <main className="flex-1 px-6 py-8 md:px-10">
          <div className="mb-8">
            <Button variant="ghost" onClick={() => router.back()} className="mb-4 px-0 text-sm text-muted-foreground hover:text-foreground hover:bg-transparent active:bg-transparent focus-visible:bg-transparent focus-visible:ring-0">
              <ArrowLeft size={16} className="mr-2" />
              Back
            </Button>

            <h1 className="text-3xl font-bold tracking-tight">Create NGO Request</h1>
            <p className="text-muted-foreground">Define a measurable need with clear beneficiary and impact outcomes.</p>
          </div>

          <div className="max-w-3xl mx-auto">
            <Card>
              <CardHeader>
                <CardTitle>Request Details</CardTitle>
                <CardDescription>Every request must define who benefits, how many, and what measurable change will happen.</CardDescription>
              </CardHeader>

              <CardContent>
                {error && (
                  <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-md">
                    <p className="text-red-700 text-sm">{error}</p>
                  </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-6">
                  <div className="grid gap-4">
                    <div>
                      <Label htmlFor="title">Request Title *</Label>
                      <Input id="title" name="title" value={formData.title} onChange={handleInput} placeholder="e.g., School kit support for 300 students" required />
                    </div>

                    <div>
                      <Label htmlFor="description">Need Description *</Label>
                      <Textarea id="description" name="description" value={formData.description} onChange={handleInput} placeholder="Describe the exact need and context." rows={4} required />
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                      <div>
                        <Label htmlFor="request_type">Request Type *</Label>
                        <Select
                          value={formData.request_type}
                          onValueChange={(value) => {
                            handleSelect('request_type', value)
                            handleSelect('category', value)
                          }}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select request type" />
                          </SelectTrigger>
                          <SelectContent>
                            {SERVICE_REQUEST_CATEGORIES.map((category) => (
                              <SelectItem key={category} value={category}>
                                {category}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div>
                        <Label htmlFor="location">Location</Label>
                        <Input id="location" name="location" value={formData.location} onChange={handleInput} placeholder="City, State or Remote" />
                      </div>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                      <div>
                        <Label htmlFor="urgency">Urgency Level</Label>
                        <Select value={formData.urgency} onValueChange={(value) => handleSelect('urgency', value)}>
                          <SelectTrigger>
                            <SelectValue placeholder="Select urgency" />
                          </SelectTrigger>
                          <SelectContent>
                            {urgencyLevels.map((level) => (
                              <SelectItem key={level} value={level}>
                                {level}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div>
                        <Label htmlFor="beneficiary_count">Beneficiary Count *</Label>
                        <Input
                          id="beneficiary_count"
                          name="beneficiary_count"
                          type="number"
                          min="1"
                          value={formData.beneficiary_count}
                          onChange={handleInput}
                          placeholder="e.g., 300"
                          required
                        />
                      </div>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                      <div>
                        <Label htmlFor="budget">Budget Range</Label>
                        <Select value={formData.budget} onValueChange={(value) => handleSelect('budget', value)}>
                          <SelectTrigger>
                            <SelectValue placeholder="Select budget range" />
                          </SelectTrigger>
                          <SelectContent>
                            {budgetRanges.map((range) => (
                              <SelectItem key={range} value={range}>
                                {range}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div>
                        <Label htmlFor="estimated_budget">Estimated Budget (Optional exact value)</Label>
                        <Input
                          id="estimated_budget"
                          name="estimated_budget"
                          value={formData.estimated_budget}
                          onChange={handleInput}
                          placeholder="e.g., INR 50,000"
                        />
                      </div>
                    </div>

                    <div>
                      <Label htmlFor="impact_description">Impact Description *</Label>
                      <Textarea
                        id="impact_description"
                        name="impact_description"
                        value={formData.impact_description}
                        onChange={handleInput}
                        placeholder="Who benefits? How many? What measurable change occurs after execution?"
                        rows={3}
                        required
                      />
                    </div>

                    <div>
                      <Label htmlFor="timeline">Timeline / Deadline</Label>
                      <div className="mt-2 flex gap-2">
                        <Input
                          id="timeline"
                          name="timeline"
                          value={formData.timeline}
                          onChange={handleInput}
                          placeholder="e.g., 4 weeks"
                        />
                        <Button type="button" variant="outline" onClick={() => handleSelect('timeline', 'Anytime')}>
                          Anytime
                        </Button>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">Selecting Anytime means this request has no expiry.</p>
                    </div>

                    <div>
                      <Label htmlFor="contactInfo">Contact Information</Label>
                      <Textarea
                        id="contactInfo"
                        name="contactInfo"
                        value={formData.contactInfo}
                        onChange={handleInput}
                        placeholder="Primary contact and escalation details"
                        rows={3}
                      />
                    </div>
                  </div>

                  <div className="flex gap-4 pt-6">
                    <Button type="submit" disabled={loading} className="flex-1">
                      {loading ? 'Creating...' : 'Create Execution Request'}
                    </Button>
                    <Button type="button" variant="outline" asChild>
                      <Link href="/service-requests">Cancel</Link>
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          </div>
        </main>
      </div>
    </ProtectedRoute>
  )
}
