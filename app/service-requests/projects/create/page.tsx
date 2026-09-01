'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Loader2 } from 'lucide-react'

import { Header } from '@/components/header'
import ProtectedRoute from '@/components/protected-route'
import { useAuth } from '@/lib/auth-context'
import {
  CSR_OWN_PROJECT_TIMELINE_MESSAGE,
  CSR_PROJECT_CREATE_REQUIRED_MESSAGE,
  INDIAN_STATES_AND_UTS,
  ngoIsCsrEligible,
  ngoIsCsrEligibleForProject,
} from '@/lib/auth'
import { CSR_SCHEDULE_VII_CATEGORIES } from '@/lib/categories'
import {
  EMPTY_PROJECT_ADDRESS,
  formatProjectExactAddress,
  validateProjectExactAddress,
  type ProjectExactAddress,
} from '@/lib/service-request-allocation'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { StyledSelect } from '@/components/ui/styled-select'
import { Textarea } from '@/components/ui/textarea'

const budgetRanges = [
  'Under INR 25,000',
  'INR 25,000 - INR 1,00,000',
  'INR 1,00,000 - INR 5,00,000',
  'INR 5,00,000+',
]

function parseBudgetToInr(budget: string): number | null {
  const text = String(budget || '').trim()
  if (!text) return null
  if (/under\s+inr\s+([\d,]+)/i.test(text)) {
    const match = text.match(/under\s+inr\s+([\d,]+)/i)
    return match ? Number(match[1].replace(/,/g, '')) : null
  }
  if (/inr\s+([\d,]+)\s*-\s*inr\s+([\d,]+)/i.test(text)) {
    const match = text.match(/inr\s+([\d,]+)\s*-\s*inr\s+([\d,]+)/i)
    return match ? Number(match[2].replace(/,/g, '')) : null
  }
  if (/inr\s+([\d,]+)\+/i.test(text)) {
    const match = text.match(/inr\s+([\d,]+)\+/i)
    return match ? Number(match[1].replace(/,/g, '')) : null
  }
  const direct = Number(text.replace(/[^\d.]/g, ''))
  return Number.isFinite(direct) && direct > 0 ? direct : null
}

export default function CreateServiceRequestProjectPage() {
  const router = useRouter()
  const { user } = useAuth()
  const csrEligible = ngoIsCsrEligible(user?.verification_status, user?.profile_data || user?.profile)

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [projectAddress, setProjectAddress] = useState<ProjectExactAddress>({ ...EMPTY_PROJECT_ADDRESS })
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    category: '',
    timeline: '',
    expected_beneficiaries: '',
    valid_until: '',
    volunteers_needed: '1',
    budget: 'Under INR 25,000',
    impact_description: '',
    contact_info: '',
  })

  const csrCoversProjectEnd = ngoIsCsrEligibleForProject(
    user?.verification_status,
    user?.profile_data || user?.profile,
    {
      valid_until: formData.valid_until,
      timeline: formData.timeline,
    }
  )
  const hasProjectWindow = Boolean(String(formData.valid_until || '').trim() || String(formData.timeline || '').trim())
  const canCreateProject = csrEligible && csrCoversProjectEnd

  const handleInput = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    const isBlank = (value: unknown) => !String(value ?? '').trim()

    if (!user) {
      setError('You must be logged in to create a project')
      return
    }

    if (!csrEligible) {
      setError(CSR_PROJECT_CREATE_REQUIRED_MESSAGE)
      return
    }

    if ([formData.title, formData.description, formData.category, formData.timeline, formData.expected_beneficiaries, formData.valid_until, formData.volunteers_needed, formData.impact_description, formData.contact_info].some(isBlank)) {
      setError('Fill in all required project fields.')
      return
    }

    if (!CSR_SCHEDULE_VII_CATEGORIES.includes(formData.category)) {
      setError('Select a valid Schedule VII category.')
      return
    }

    const addressError = validateProjectExactAddress(projectAddress)
    if (addressError) {
      setError(addressError)
      return
    }

    if (String(formData.title).trim().length < 3) {
      setError('Project title must be at least 3 characters.')
      return
    }
    if (String(formData.description).trim().length < 20) {
      setError('Project description must be at least 20 characters.')
      return
    }
    if (String(formData.timeline).trim().toLowerCase() === 'anytime') {
      setError('Timeline cannot be "Anytime"; provide a duration or date.')
      return
    }
    if (!/^[0-9]+$/.test(String(formData.expected_beneficiaries))) {
      setError('Expected beneficiaries must be a positive whole number.')
      return
    }
    if (!/^[0-9]+$/.test(String(formData.volunteers_needed)) || Number(formData.volunteers_needed) <= 0) {
      setError('Volunteers needed must be a positive whole number.')
      return
    }
    if (!formData.valid_until || Number.isNaN(new Date(formData.valid_until).getTime())) {
      setError('Valid until must be a valid date.')
      return
    }
    if (String(formData.impact_description).trim().length < 20) {
      setError('Impact description must be at least 20 characters.')
      return
    }
    if (String(formData.contact_info).trim().length < 10) {
      setError('Contact information must include enough detail to reach you.')
      return
    }
    if (!csrCoversProjectEnd) {
      setError(CSR_OWN_PROJECT_TIMELINE_MESSAGE)
      return
    }

    setLoading(true)
    try {
      const token = localStorage.getItem('token')
      const response = await fetch('/api/service-request-projects', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          title: formData.title,
          description: formData.description,
          address: projectAddress,
          timeline: formData.timeline,
          category: formData.category,
          expected_beneficiaries: Number(formData.expected_beneficiaries),
          valid_until: formData.valid_until,
          volunteers_needed: Number(formData.volunteers_needed),
          csr_project_available_for_csr: true,
          budget_inr: parseBudgetToInr(formData.budget),
          budget_label: formData.budget,
          impact_description: formData.impact_description,
          contact_info: formData.contact_info,
        }),
      })

      const data = await response.json().catch(() => null)
      if (!response.ok || !data?.success || !data?.data?.id) {
        setError(data?.error || 'Failed to create project')
        return
      }

      router.push(`/service-requests/projects/${data.data.id}`)
    } catch {
      setError('Network error while creating project')
    } finally {
      setLoading(false)
    }
  }

  return (
    <ProtectedRoute userTypes={['ngo']} requireVerification={true} permission="canCreateServiceRequests">
      <div className="min-h-screen bg-background">
        <Header />
        <div className="mx-auto max-w-4xl px-4 py-8">
          <div className="mb-6">
            <Button
              variant="ghost"
              onClick={() => router.back()}
              className="w-full justify-start px-0 text-udaan-blue hover:text-gram-ink hover:bg-transparent sm:w-auto"
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Button>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Post a Project for CSR</CardTitle>
              <CardDescription>
                Companies can take over this full project. For individual volunteers, post a Need instead.
              </CardDescription>
              <p className="text-sm text-muted-foreground">
                Looking for individual help?{' '}
                <Link href="/service-requests/create" className="font-medium text-udaan-blue hover:underline">
                  Post a Need
                </Link>
              </p>
            </CardHeader>
            <CardContent>
              {!csrEligible ? (
                <div className="space-y-4">
                  <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                    <p className="text-sm font-medium text-slate-900">Project creation unavailable</p>
                    <p className="text-xs text-muted-foreground">{CSR_PROJECT_CREATE_REQUIRED_MESSAGE}</p>
                  </div>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Button asChild variant="outline">
                      <Link href="/ngos/dashboard?tab=profile">Update compliance</Link>
                    </Button>
                    <Button asChild variant="ghost">
                      <Link href="/service-requests/create">Post a Need instead</Link>
                    </Button>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-6">
                  {error ? <p className="text-sm text-red-600">{error}</p> : null}

                  <div>
                    <Label htmlFor="title">Project Title *</Label>
                    <Input id="title" name="title" value={formData.title} onChange={handleInput} required />
                  </div>

                  <div>
                    <Label htmlFor="description">Description *</Label>
                    <Textarea id="description" name="description" value={formData.description} onChange={handleInput} rows={4} required />
                  </div>

                  <div>
                    <Label>Schedule VII Category *</Label>
                    <StyledSelect
                      value={formData.category}
                      options={[...CSR_SCHEDULE_VII_CATEGORIES]}
                      placeholder="Select category"
                      onValueChange={(value) => setFormData((prev) => ({ ...prev, category: value }))}
                    />
                  </div>

                  <div className="space-y-3 rounded-md border p-4">
                    <p className="text-sm font-medium">Exact project address *</p>
                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="md:col-span-2">
                        <Label>Address line *</Label>
                        <Input
                          value={projectAddress.address_line}
                          onChange={(e) => setProjectAddress((prev) => ({ ...prev, address_line: e.target.value }))}
                          required
                        />
                      </div>
                      <div>
                        <Label>City *</Label>
                        <Input
                          value={projectAddress.city}
                          onChange={(e) => setProjectAddress((prev) => ({ ...prev, city: e.target.value }))}
                          required
                        />
                      </div>
                      <div>
                        <Label>State / UT *</Label>
                        <StyledSelect
                          value={projectAddress.state}
                          options={[...INDIAN_STATES_AND_UTS]}
                          placeholder="Select state / UT"
                          onValueChange={(value) => setProjectAddress((prev) => ({ ...prev, state: value }))}
                        />
                      </div>
                      <div>
                        <Label>Pincode *</Label>
                        <Input
                          value={projectAddress.pincode}
                          onChange={(e) =>
                            setProjectAddress((prev) => ({
                              ...prev,
                              pincode: e.target.value.replace(/\D/g, '').slice(0, 6),
                            }))
                          }
                          required
                        />
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Preview: {formatProjectExactAddress(projectAddress) || 'Complete the address fields'}
                    </p>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <Label htmlFor="timeline">Timeline *</Label>
                      <Input id="timeline" name="timeline" value={formData.timeline} onChange={handleInput} placeholder="e.g., 3 months or Q3 2026" required />
                    </div>
                    <div>
                      <Label htmlFor="valid_until">Valid Until *</Label>
                      <Input id="valid_until" name="valid_until" type="date" value={formData.valid_until} onChange={handleInput} required />
                    </div>
                    <div>
                      <Label htmlFor="expected_beneficiaries">Expected Beneficiaries *</Label>
                      <Input id="expected_beneficiaries" name="expected_beneficiaries" type="number" min="1" value={formData.expected_beneficiaries} onChange={handleInput} required />
                    </div>
                    <div>
                      <Label htmlFor="volunteers_needed">Volunteers Needed *</Label>
                      <Input id="volunteers_needed" name="volunteers_needed" type="number" min="1" value={formData.volunteers_needed} onChange={handleInput} required />
                    </div>
                    <div>
                      <Label htmlFor="budget">Indicative Budget *</Label>
                      <StyledSelect
                        value={formData.budget}
                        options={budgetRanges}
                        placeholder="Select budget range"
                        onValueChange={(value) => setFormData((prev) => ({ ...prev, budget: value }))}
                      />
                    </div>
                  </div>

                  {hasProjectWindow && !canCreateProject ? (
                    <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                      <p className="text-sm font-medium text-slate-900">Project creation blocked</p>
                      <p className="text-xs text-muted-foreground">{CSR_OWN_PROJECT_TIMELINE_MESSAGE}</p>
                    </div>
                  ) : null}

                  <div>
                    <Label htmlFor="impact_description">Impact Description *</Label>
                    <Textarea id="impact_description" name="impact_description" value={formData.impact_description} onChange={handleInput} rows={3} required />
                  </div>

                  <div>
                    <Label htmlFor="contact_info">Contact Information *</Label>
                    <Textarea id="contact_info" name="contact_info" value={formData.contact_info} onChange={handleInput} rows={3} required />
                  </div>

                  <Button type="submit" disabled={loading || !canCreateProject} className="w-full">
                    {loading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Publishing project...
                      </>
                    ) : (
                      'Publish Project'
                    )}
                  </Button>
                </form>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </ProtectedRoute>
  )
}
