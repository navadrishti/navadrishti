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
import { StyledSelect } from '@/components/ui/styled-select'
import { INDIAN_STATES_AND_UTS, CSR_OWN_PROJECT_TIMELINE_MESSAGE, CSR_PROJECT_CREATE_REQUIRED_MESSAGE, ngoIsCsrEligible, ngoIsCsrEligibleForProject } from '@/lib/auth'
import {
  EMPTY_PROJECT_ADDRESS,
  parseProjectExactAddress,
  toProjectAddressDateInput,
  type ProjectExactAddress,
} from '@/lib/service-request-allocation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton, SkeletonHeader, SkeletonForm, SkeletonButton } from '@/components/ui/skeleton'
import { useToast } from '@/hooks/use-toast'

export default function EditProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const { user } = useAuth()
  const { toast } = useToast()
  const csrEligible = ngoIsCsrEligible(user?.verification_status, user?.profile_data || user?.profile)

  const [loading, setLoading] = useState(true)
  const [savingProject, setSavingProject] = useState(false)
  const [project, setProject] = useState<any | null>(null)

  const canEditProject = ngoIsCsrEligibleForProject(
    user?.verification_status,
    user?.profile_data || user?.profile,
    {
      valid_until: project?.valid_until,
      timeline: project?.timeline,
    }
  )
  const [projectAddress, setProjectAddress] = useState<ProjectExactAddress>({ ...EMPTY_PROJECT_ADDRESS })

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
    if (!csrEligible) {
      toast({ title: 'Edit locked', description: CSR_PROJECT_CREATE_REQUIRED_MESSAGE, variant: 'destructive' })
      return
    }
    if (!canEditProject) {
      toast({ title: 'Edit locked', description: CSR_OWN_PROJECT_TIMELINE_MESSAGE, variant: 'destructive' })
      return
    }
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
              {!csrEligible ? (
                <div className="space-y-4">
                  <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                    <p className="text-sm font-medium text-slate-900">Project edit unavailable</p>
                    <p className="text-xs text-muted-foreground">{CSR_PROJECT_CREATE_REQUIRED_MESSAGE}</p>
                  </div>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Button asChild variant="outline">
                      <Link href="/ngos/dashboard?tab=profile">Update compliance</Link>
                    </Button>
                    <Button variant="ghost" onClick={() => router.push(`/service-requests/projects/${id}`)}>
                      View project
                    </Button>
                  </div>
                </div>
              ) : (
                <>
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
              </div>

              {!canEditProject ? (
                <div className="mt-4 rounded-md border border-slate-200 bg-slate-50 p-3">
                  <p className="text-sm font-medium text-slate-900">Project edit blocked</p>
                  <p className="text-xs text-muted-foreground">{CSR_OWN_PROJECT_TIMELINE_MESSAGE}</p>
                </div>
              ) : null}

              <div className="flex flex-col gap-3 pt-4 sm:flex-row">
                <Button onClick={handleProjectSave} disabled={savingProject || !canEditProject} className="w-full sm:w-auto">{savingProject ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : 'Save Project'}</Button>
                <Button variant="outline" onClick={() => router.push(`/service-requests/projects/${project?.id}`)} className="w-full sm:w-auto">Back</Button>
              </div>

              <p className="mt-6 text-sm text-muted-foreground">
                Projects are standalone CSR packages. Post individual needs separately from{' '}
                <Link href="/service-requests/create" className="underline underline-offset-4">Post a Need</Link>.
              </p>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
