"use client"

import React, { use, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Loader2 } from 'lucide-react'
import { Header } from '@/components/header'
import { useAuth } from '@/lib/auth-context'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { StyledSelect } from '@/components/ui/styled-select'
import { SERVICE_REQUEST_CATEGORIES } from '@/lib/categories'
import { INDIAN_STATES_AND_UTS, ngoIsCsrEligible, ngoIsCsrEligibleForProject } from '@/lib/auth'
import {
  EMPTY_PROJECT_ADDRESS,
  formatProjectExactAddress,
  parseProjectExactAddress,
  toProjectAddressDateInput,
  type ProjectExactAddress,
} from '@/lib/project-address'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton, SkeletonHeader, SkeletonForm, SkeletonButton } from '@/components/ui/skeleton'
import { useToast } from '@/hooks/use-toast'

type NeedDraft = {
  title: string
  description: string
  request_type: string
  impact_description?: string
  budget?: string
}

const createEmptyNeed = (): NeedDraft => ({ title: '', description: '', request_type: '', impact_description: '', budget: '' })
const budgetRanges = [
  'Under INR 25,000',
  'INR 25,000 - INR 1,00,000',
  'INR 1,00,000 - INR 5,00,000',
  'INR 5,00,000+',
  'Negotiable'
]

export default function EditProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const { user } = useAuth()
  const csrEligible = ngoIsCsrEligible(user?.verification_status, user?.profile_data || user?.profile)
  const { toast } = useToast()

  const [loading, setLoading] = useState(true)
  const [savingProject, setSavingProject] = useState(false)
  const [project, setProject] = useState<any | null>(null)

  const canOfferForCsr = ngoIsCsrEligibleForProject(
    user?.verification_status,
    user?.profile_data || user?.profile,
    {
      valid_until: project?.valid_until,
      timeline: project?.timeline,
    }
  )
  const [projectAddress, setProjectAddress] = useState<ProjectExactAddress>({ ...EMPTY_PROJECT_ADDRESS })
  const [needs, setNeeds] = useState<any[]>([])
  const [newNeeds, setNewNeeds] = useState<NeedDraft[]>([createEmptyNeed()])

  useEffect(() => {
    if (!user) return
    if (user.user_type !== 'ngo') {
      toast({ title: 'Access Denied', description: 'Only NGO owners can edit projects', variant: 'destructive' })
      router.push('/service-requests')
      return
    }

    const load = async () => {
      setLoading(true)
      try {
        const token = localStorage.getItem('token')
        const resp = await fetch(`/api/service-request-projects?ngoId=${user.id}`, { headers: { Authorization: `Bearer ${token}` } })
        const data = await resp.json()
        if (resp.ok && data.success) {
          const found = (data.data || []).find((p: any) => String(p.id) === String(id))
          if (!found) {
            toast({ title: 'Not found', description: 'Project not found or you are not the owner', variant: 'destructive' })
            router.push('/service-requests')
            return
          }
          setProject({
            ...found,
            valid_until: toProjectAddressDateInput(found.valid_until),
            csr_project_available_for_csr: found.csr_project_available_for_csr !== false,
          })
          setProjectAddress(parseProjectExactAddress(found.exact_address || found.location))

          const needsResp = await fetch(`/api/service-requests?projectId=${found.id}`, { headers: { Authorization: `Bearer ${token}` } })
          const needsData = await needsResp.json()
          if (needsResp.ok && needsData.success) setNeeds(needsData.data || [])
        } else {
          toast({ title: 'Error', description: 'Failed to load project', variant: 'destructive' })
        }
      } catch (err) {
        toast({ title: 'Error', description: 'Failed to load project', variant: 'destructive' })
      } finally {
        setLoading(false)
      }
    }

    void load()
  }, [id, router, toast, user])

  const handleProjectSave = async () => {
    if (!project) return
    setSavingProject(true)
    try {
      const token = localStorage.getItem('token')
      const resp = await fetch(`/api/service-request-projects/${project.id}`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: project.title,
          description: project.description,
          address: projectAddress,
          timeline: project.timeline,
          expected_beneficiaries: project.expected_beneficiaries,
          valid_until: project.valid_until,
          csr_project_available_for_csr: canOfferForCsr && project.csr_project_available_for_csr !== false,
        })
      })
      const data = await resp.json()
      if (resp.ok && data.success) {
        setProject({
          ...data.data,
          valid_until: toProjectAddressDateInput(data.data.valid_until),
          csr_project_available_for_csr: data.data.csr_project_available_for_csr !== false,
        })
        setProjectAddress(parseProjectExactAddress(data.data.exact_address || data.data.location))
        toast({ title: 'Saved', description: 'Project updated' })
      } else {
        toast({ title: 'Error', description: data.error || 'Failed to update project', variant: 'destructive' })
      }
    } catch {
      toast({ title: 'Error', description: 'Failed to update project', variant: 'destructive' })
    } finally {
      setSavingProject(false)
    }
  }

  const addNewNeedRow = () => setNewNeeds((prev) => [...prev, createEmptyNeed()])
  const updateNewNeed = (idx: number, field: keyof NeedDraft, value: string) => setNewNeeds((prev) => prev.map((n, i) => i === idx ? { ...n, [field]: value } : n))

  const createNewNeeds = async () => {
    if (!project) return
    const token = localStorage.getItem('token')
    try {
      for (const n of newNeeds) {
        await fetch('/api/service-requests', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            projectId: project.id,
            title: n.title,
            description: n.description,
            request_type: n.request_type,
            impact_description: (n as any).impact_description || '',
            budget: (n as any).budget || ''
          })
        })
      }
      toast({ title: 'Success', description: `${newNeeds.length} need(s) created` })
      // reload needs
      const needsResp = await fetch(`/api/service-requests?projectId=${project.id}`, { headers: { Authorization: `Bearer ${token}` } })
      const needsData = await needsResp.json()
      if (needsResp.ok && needsData.success) setNeeds(needsData.data || [])
      setNewNeeds([createEmptyNeed()])
    } catch (err) {
      toast({ title: 'Error', description: 'Failed to create needs', variant: 'destructive' })
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="container mx-auto px-4 py-6 sm:py-8">
          <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <Button variant="ghost" className="w-full justify-start px-0 text-udaan-blue hover:text-gram-ink hover:bg-transparent active:bg-transparent focus-visible:bg-transparent focus-visible:ring-0 sm:w-auto" onClick={() => router.back()}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Button>
            <div className="hidden sm:block">
              <SkeletonButton />
            </div>
          </div>

          <div className="mx-auto w-full max-w-4xl">
            <Card>
              <CardHeader>
                <CardTitle className="text-2xl">Edit Project</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <SkeletonHeader />
                  <SkeletonForm />
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <div className="container mx-auto px-4 py-6 sm:py-8">
        <div className="mb-6">
          <Button variant="ghost" onClick={() => router.back()} className="w-full justify-start px-0 text-udaan-blue hover:text-gram-ink hover:bg-transparent active:bg-transparent focus-visible:bg-transparent focus-visible:ring-0 sm:w-auto">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
        </div>

        <div className="mx-auto w-full max-w-4xl">
          <Card>
            <CardHeader>
              <CardTitle className="text-2xl">Edit Project</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <Label>Title</Label>
                  <Input value={project?.title || ''} onChange={(e) => setProject((p: any) => ({ ...p, title: e.target.value }))} />
                </div>
                <div>
                  <Label>Expected beneficiaries</Label>
                  <Input type="number" value={String(project?.expected_beneficiaries || '')} onChange={(e) => setProject((p: any) => ({ ...p, expected_beneficiaries: Number(e.target.value) }))} />
                </div>
                <div className="md:col-span-2">
                  <Label>Description</Label>
                  <Textarea value={project?.description || ''} onChange={(e) => setProject((p: any) => ({ ...p, description: e.target.value }))} rows={3} />
                </div>

                <div className="md:col-span-2 space-y-4 rounded-md border border-slate-200 p-4">
                  <div>
                    <h4 className="text-sm font-medium">Project Exact Address</h4>
                    <p className="text-xs text-muted-foreground">Provide the complete on-ground project location.</p>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="md:col-span-2">
                      <Label>Street / Building / Landmark</Label>
                      <Input
                        value={projectAddress.address_line}
                        onChange={(e) => setProjectAddress((prev) => ({ ...prev, address_line: e.target.value }))}
                        placeholder="House no., street, landmark"
                      />
                    </div>
                    <div>
                      <Label>Region</Label>
                      <Input
                        value={projectAddress.region}
                        onChange={(e) => setProjectAddress((prev) => ({ ...prev, region: e.target.value }))}
                        placeholder="e.g. NCR"
                      />
                    </div>
                    <div>
                      <Label>District</Label>
                      <Input
                        value={projectAddress.district}
                        onChange={(e) => setProjectAddress((prev) => ({ ...prev, district: e.target.value }))}
                        placeholder="e.g. Gautam Buddha Nagar"
                      />
                    </div>
                    <div>
                      <Label>City / Town *</Label>
                      <Input
                        value={projectAddress.city}
                        onChange={(e) => setProjectAddress((prev) => ({ ...prev, city: e.target.value }))}
                        placeholder="e.g. Greater Noida"
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
                        onChange={(e) => setProjectAddress((prev) => ({ ...prev, pincode: e.target.value.replace(/\D/g, '').slice(0, 6) }))}
                        placeholder="6-digit pincode"
                      />
                    </div>
                    <div>
                      <Label>Country</Label>
                      <Input
                        value={projectAddress.country}
                        onChange={(e) => setProjectAddress((prev) => ({ ...prev, country: e.target.value }))}
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <Label>Valid Until</Label>
                  <Input type="date" value={project?.valid_until || ''} onChange={(e) => setProject((p: any) => ({ ...p, valid_until: e.target.value }))} />
                </div>
                <div>
                  <Label>Timeline</Label>
                  <Input placeholder="e.g. Oct-Dec 2026" value={project?.timeline || ''} onChange={(e) => setProject((p: any) => ({ ...p, timeline: e.target.value }))} />
                </div>
                {canOfferForCsr ? (
                <div className="md:col-span-2 flex items-start gap-3 rounded-md border bg-white p-3">
                  <input
                    id="project_available_for_csr"
                    type="checkbox"
                    checked={project?.csr_project_available_for_csr !== false}
                    onChange={(e) => setProject((p: any) => ({ ...p, csr_project_available_for_csr: e.target.checked }))}
                    className="mt-1 h-4 w-4 rounded border-slate-300"
                  />
                  <div>
                    <Label htmlFor="project_available_for_csr" className="text-sm font-medium">Available for CSR takeover</Label>
                    <p className="text-xs text-muted-foreground">Disable this if the project should stay NGO-managed and never enter the CSR marketplace.</p>
                  </div>
                </div>
                ) : (
                <div className="md:col-span-2 rounded-md border border-slate-200 bg-slate-50 p-3">
                  <p className="text-sm font-medium text-slate-900">CSR takeover unavailable</p>
                  <p className="text-xs text-muted-foreground">
                    {csrEligible
                      ? 'Your CSR-1 must remain valid through the full project window (Valid Until and Timeline) before companies can take over this project.'
                      : 'A live CA-allotted CSR-1 tag is required before companies can take over this project.'}
                  </p>
                </div>
                )}
              </div>

              <div className="flex flex-col gap-3 pt-4 sm:flex-row">
                <Button onClick={handleProjectSave} disabled={savingProject} className="w-full sm:w-auto">{savingProject ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : 'Save Project'}</Button>
                <Button variant="outline" onClick={() => router.push(`/service-requests/projects/${project?.id}`)} className="w-full sm:w-auto">Back</Button>
              </div>

              <div className="mt-6">
                <h3 className="text-lg font-medium">Existing Needs ({needs.length})</h3>
                <div className="mt-2 space-y-3">
                  {needs.map((n) => {
                    const needImage = Array.isArray(n.images) && n.images.length > 0 ? n.images[0] : n.image_url || ''
                    return (
                      <div key={n.id} className="rounded-md border border-slate-200 bg-white p-3 flex items-start gap-3">
                        <div className="h-20 w-28 flex-shrink-0 overflow-hidden rounded-md border bg-slate-100">
                          {needImage ? (
                            <img src={needImage} alt={n.title} className="h-full w-full object-cover" />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center text-[10px] font-medium text-slate-500">No Image</div>
                          )}
                        </div>

                        <div className="flex-1">
                          <h4 className="font-semibold">{n.title}</h4>
                          <p className="text-sm text-muted-foreground mt-1 line-clamp-3">{n.description}</p>
                          <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-slate-600">
                            <span>Type: <strong className="ml-1">{n.request_type || n.category || 'Not specified'}</strong></span>
                            <span>Location: <strong className="ml-1">{n.location || 'Not specified'}</strong></span>
                            <span>Validity: <strong className="ml-1">{n.timeline || 'Not specified'}</strong></span>
                          </div>
                        </div>

                        <div className="flex-shrink-0">
                          <Link href={`/service-requests/edit/${n.id}`}>
                            <Button variant="outline">Edit Need</Button>
                          </Link>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              <div className="mt-6">
                <h3 className="text-lg font-medium">Add New Needs</h3>
                <div className="space-y-4 mt-3">
                  {newNeeds.map((n, idx) => (
                    <div key={idx} className="space-y-2 rounded-md border border-slate-200 p-3 bg-white">
                      <div className="grid gap-2 md:grid-cols-2">
                        <Input placeholder="Title" value={n.title} onChange={(e) => updateNewNeed(idx, 'title', e.target.value)} />
                        <StyledSelect value={n.request_type} options={SERVICE_REQUEST_CATEGORIES} placeholder="Need type" onValueChange={(v) => updateNewNeed(idx, 'request_type', v)} />
                      </div>

                      <div>
                        <Textarea placeholder="Short description" className="w-full" value={n.description} onChange={(e) => updateNewNeed(idx, 'description', e.target.value)} />
                      </div>

                      <div className="grid gap-2 md:grid-cols-2">
                        <div>
                          <Label>Impact Description</Label>
                          <Textarea value={n.impact_description || ''} onChange={(e) => updateNewNeed(idx, 'impact_description', e.target.value)} placeholder="Who benefits? What measurable change?" />
                        </div>
                        <div>
                          <Label>Budget Range</Label>
                          <Select value={n.budget || ''} onValueChange={(value) => updateNewNeed(idx, 'budget', value)}>
                            <SelectTrigger>
                              <SelectValue placeholder="Select budget range" />
                            </SelectTrigger>
                            <SelectContent>
                              {budgetRanges.map((range) => (
                                <SelectItem key={range} value={range}>{range}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-3 flex gap-2">
                  <Button onClick={addNewNeedRow}>Add another need</Button>
                  <Button variant="outline" onClick={createNewNeeds}>Confirm</Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
