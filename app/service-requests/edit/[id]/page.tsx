'use client'

import { useState, useEffect, use } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Loader2 } from 'lucide-react'

import { Header } from '@/components/header'
import { useAuth } from '@/lib/auth-context'
import { useToast } from '@/hooks/use-toast'
import { SERVICE_REQUEST_CATEGORIES } from '@/lib/categories'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'

const urgencyLevels = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'critical', label: 'Critical' }
]

export default function EditServiceRequestPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params)
  const router = useRouter()
  const { user } = useAuth()
  const { toast } = useToast()

  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    request_type: '',
    category: '',
    location: '',
    urgency: 'medium',
    timeline: '',
    budget: 'Not specified',
    estimated_budget: '',
    beneficiary_count: '1',
    impact_description: '',
    contactInfo: 'email'
  })

  useEffect(() => {
    if (!user) {
      router.push('/login')
      return
    }
    if (user.user_type !== 'ngo') {
      toast({ title: 'Access Denied', description: 'Only NGOs can edit service requests', variant: 'destructive' })
      router.push('/service-requests')
    }
  }, [router, toast, user])

  useEffect(() => {
    if (!user || !resolvedParams.id) return

    const fetchRequest = async () => {
      try {
        const token = localStorage.getItem('token')
        const response = await fetch(`/api/service-requests/${resolvedParams.id}`, {
          headers: { Authorization: `Bearer ${token}` }
        })
        const data = await response.json()

        if (!data.success) {
          toast({ title: 'Error', description: data.error || 'Failed to fetch request details', variant: 'destructive' })
          router.push('/service-requests')
          return
        }

        const req = data.data
        let requirements: any = {}
        try {
          requirements = typeof req.requirements === 'string' ? JSON.parse(req.requirements) : req.requirements || {}
        } catch {
          requirements = {}
        }

        setFormData({
          title: req.title || '',
          description: req.description || '',
          request_type: requirements.request_type || req.category || '',
          category: req.category || '',
          location: req.location || '',
          urgency: req.urgency_level || 'medium',
          timeline: requirements.timeline || req.timeline || '',
          budget: requirements.budget || 'Not specified',
          estimated_budget: requirements.estimated_budget || '',
          beneficiary_count: String(requirements.beneficiary_count || 1),
          impact_description: requirements.impact_description || '',
          contactInfo: requirements.contactInfo || 'email'
        })
      } catch {
        toast({ title: 'Error', description: 'Failed to fetch request details', variant: 'destructive' })
        router.push('/service-requests')
      } finally {
        setLoading(false)
      }
    }

    fetchRequest()
  }, [resolvedParams.id, router, toast, user])

  const handleInput = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!formData.title || !formData.description || !formData.request_type) {
      toast({ title: 'Validation Error', description: 'Please fill required fields', variant: 'destructive' })
      return
    }

    if (!formData.impact_description.trim() || Number(formData.beneficiary_count) <= 0) {
      toast({ title: 'Validation Error', description: 'Impact description and beneficiary count are required.', variant: 'destructive' })
      return
    }

    setSubmitting(true)

    try {
      const token = localStorage.getItem('token')
      const response = await fetch(`/api/service-requests/${resolvedParams.id}`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          ...formData,
          category: formData.request_type
        })
      })

      const data = await response.json()
      if (data.success) {
        toast({ title: 'Success', description: 'Service request updated successfully' })
        router.push('/service-requests?view=my-requests')
      } else {
        toast({ title: 'Error', description: data.error || 'Failed to update service request', variant: 'destructive' })
      }
    } catch {
      toast({ title: 'Error', description: 'Failed to update service request', variant: 'destructive' })
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Header />
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />

      <div className="container mx-auto px-4 py-8">
        <div className="mb-6">
          <Button variant="ghost" onClick={() => router.back()} className="px-0 text-blue-600 hover:text-blue-800 hover:bg-transparent active:bg-transparent focus-visible:bg-transparent focus-visible:ring-0">
            <ArrowLeft size={20} className="mr-2" />
            Back
          </Button>
        </div>

        <div className="max-w-2xl mx-auto">
          <Card>
            <CardHeader>
              <CardTitle className="text-2xl">Edit Execution Request</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-6">
                <div>
                  <Label htmlFor="title">Request Title *</Label>
                  <Input id="title" value={formData.title} onChange={(e) => handleInput('title', e.target.value)} required />
                </div>

                <div>
                  <Label htmlFor="description">Description *</Label>
                  <Textarea id="description" value={formData.description} onChange={(e) => handleInput('description', e.target.value)} rows={4} required />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="request_type">Request Type *</Label>
                    <Select
                      value={formData.request_type}
                      onValueChange={(value) => {
                        handleInput('request_type', value)
                        handleInput('category', value)
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
                    <Label htmlFor="beneficiary_count">Beneficiary Count *</Label>
                    <Input
                      id="beneficiary_count"
                      type="number"
                      min="1"
                      value={formData.beneficiary_count}
                      onChange={(e) => handleInput('beneficiary_count', e.target.value)}
                      required
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor="impact_description">Impact Description *</Label>
                  <Textarea
                    id="impact_description"
                    value={formData.impact_description}
                    onChange={(e) => handleInput('impact_description', e.target.value)}
                    rows={3}
                    required
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="urgency">Urgency</Label>
                    <Select value={formData.urgency} onValueChange={(value) => handleInput('urgency', value)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {urgencyLevels.map((level) => (
                          <SelectItem key={level.value} value={level.value}>
                            {level.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label htmlFor="estimated_budget">Estimated Budget</Label>
                    <Input id="estimated_budget" value={formData.estimated_budget} onChange={(e) => handleInput('estimated_budget', e.target.value)} />
                  </div>
                </div>

                <div>
                  <Label htmlFor="timeline">Timeline / Deadline</Label>
                  <div className="mt-2 flex gap-2">
                    <Input
                      id="timeline"
                      value={formData.timeline}
                      onChange={(e) => handleInput('timeline', e.target.value)}
                      placeholder="e.g., 4 weeks"
                    />
                    <Button type="button" variant="outline" onClick={() => handleInput('timeline', 'Anytime')}>
                      Anytime
                    </Button>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">Selecting Anytime means this request has no expiry.</p>
                </div>

                <div className="flex gap-4 pt-4">
                  <Button type="submit" disabled={submitting} className="flex-1">
                    {submitting ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Updating...
                      </>
                    ) : (
                      'Update Request'
                    )}
                  </Button>
                  <Button type="button" variant="outline" onClick={() => router.back()} className="flex-1">
                    Cancel
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
