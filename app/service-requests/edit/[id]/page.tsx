'use client'

import { useState, useEffect, use } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Loader2, Plus, Trash2 } from 'lucide-react'

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

type RequestProject = {
  id: string
  title: string
  description?: string | null
  location: string
  exact_address?: string | null
  timeline?: string | null
}

type NeedDraft = {
  title: string
  description: string
  request_type: string
  category: string
  location: string
  urgency: string
  timeline: string
  budget: string
  estimated_budget: string
  beneficiary_count: string
  impact_description: string
  contactInfo: string
  target_amount: string
  target_quantity: string
  current_amount: string
  current_quantity: string
  material_items: string
  skill_role: string
  skill_duration: string
  infrastructure_scope: string
}

const createEmptyNeed = (): NeedDraft => ({
  title: '',
  description: '',
  request_type: '',
  category: '',
  location: '',
  urgency: 'medium',
  timeline: '',
  budget: 'Not specified',
  estimated_budget: '',
  beneficiary_count: '',
  impact_description: '',
  contactInfo: 'email',
  target_amount: '',
  target_quantity: '',
  current_amount: '',
  current_quantity: '',
  material_items: '',
  skill_role: '',
  skill_duration: '',
  infrastructure_scope: ''
})

const urgencyLevels = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'critical', label: 'Critical' }
]

const moneyPattern = /^(?:₹|INR)?\s*\d[\d,]*(?:\.\d{1,2})?$/i
const timelinePattern = /^(?:anytime|\d+\s*(?:day|days|week|weeks|month|months|year|years)|\d{4}-\d{2}-\d{2})$/i

const isValidMoneyValue = (value: string) => moneyPattern.test(value.trim())
const isValidTimelineValue = (value: string) => timelinePattern.test(value.trim())
const isValidPositiveInteger = (value: string) => /^\d+$/.test(value.trim()) && Number(value) > 0

export default function EditServiceRequestPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params)
  const router = useRouter()
  const { user } = useAuth()
  const { toast } = useToast()

  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [loadingProjects, setLoadingProjects] = useState(false)
  const [projectMode, setProjectMode] = useState<'new' | 'existing'>('existing')
  const [projects, setProjects] = useState<RequestProject[]>([])
  const [additionalNeeds, setAdditionalNeeds] = useState<NeedDraft[]>([])
  const [formData, setFormData] = useState({
    projectId: '',
    project_title: '',
    project_description: '',
    project_location: '',
    project_timeline: '',
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
    contactInfo: 'email',
    target_amount: '',
    target_quantity: '',
    current_amount: '',
    current_quantity: '',
    material_items: '',
    skill_role: '',
    skill_duration: '',
    infrastructure_scope: ''
  })

  useEffect(() => {
    const loadProjects = async () => {
      if (!user?.id) return

      setLoadingProjects(true)
      try {
        const token = localStorage.getItem('token')
        const response = await fetch(`/api/service-request-projects?ngoId=${user.id}`, {
          headers: { Authorization: `Bearer ${token}` }
        })
        const data = await response.json()
        if (response.ok && data.success) {
          setProjects(Array.isArray(data.data) ? data.data : [])
        }
      } catch {
        setProjects([])
      } finally {
        setLoadingProjects(false)
      }
    }

    loadProjects()

    const refreshInterval = setInterval(loadProjects, 30000)
    const onFocus = () => loadProjects()
    window.addEventListener('focus', onFocus)

    return () => {
      clearInterval(refreshInterval)
      window.removeEventListener('focus', onFocus)
    }
  }, [user?.id])

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

        const requestProject = req.project || requirements?.project?.project || null

        if (requestProject?.id) {
          setProjectMode('existing')
        } else {
          setProjectMode('new')
        }

        setFormData({
          projectId: requestProject?.id || '',
          project_title: requestProject?.title || '',
          project_description: requestProject?.description || '',
          project_location: requestProject?.exact_address || requestProject?.location || req.location || '',
          project_timeline: requestProject?.timeline || requirements.timeline || req.timeline || '',
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
          contactInfo: requirements.contactInfo || 'email',
          target_amount: req.target_amount != null ? String(req.target_amount) : '',
          target_quantity: req.target_quantity != null ? String(req.target_quantity) : '',
          current_amount: req.current_amount != null ? String(req.current_amount) : '',
          current_quantity: req.current_quantity != null ? String(req.current_quantity) : '',
          material_items: requirements?.category_details?.material_items || '',
          skill_role: requirements?.category_details?.skill_role || '',
          skill_duration: requirements?.category_details?.skill_duration || '',
          infrastructure_scope: requirements?.category_details?.infrastructure_scope || ''
        })

        if (requestProject?.id) {
          try {
            const projectToken = localStorage.getItem('token')
            const relatedResponse = await fetch(`/api/service-requests?projectId=${requestProject.id}`, {
              headers: { Authorization: `Bearer ${projectToken}` }
            })
            const relatedData = await relatedResponse.json()
            if (relatedResponse.ok && relatedData.success && Array.isArray(relatedData.data)) {
              const additional = relatedData.data
                .filter((item: any) => String(item.id) !== String(resolvedParams.id))
                .map((item: any) => {
                  let relatedRequirements: any = {}
                  try {
                    relatedRequirements = typeof item.requirements === 'string' ? JSON.parse(item.requirements) : item.requirements || {}
                  } catch {
                    relatedRequirements = {}
                  }

                  return {
                    title: item.title || '',
                    description: item.description || '',
                    request_type: relatedRequirements.request_type || item.category || '',
                    category: item.category || '',
                    location: item.location || requestProject.exact_address || requestProject.location || '',
                    urgency: item.urgency_level || 'medium',
                    timeline: relatedRequirements.timeline || item.timeline || '',
                    budget: relatedRequirements.budget || 'Not specified',
                    estimated_budget: relatedRequirements.estimated_budget || '',
                    beneficiary_count: String(relatedRequirements.beneficiary_count || 1),
                    impact_description: relatedRequirements.impact_description || '',
                    contactInfo: relatedRequirements.contactInfo || 'email',
                    target_amount: item.target_amount != null ? String(item.target_amount) : '',
                    target_quantity: item.target_quantity != null ? String(item.target_quantity) : '',
                    current_amount: item.current_amount != null ? String(item.current_amount) : '',
                    current_quantity: item.current_quantity != null ? String(item.current_quantity) : '',
                    material_items: relatedRequirements?.category_details?.material_items || '',
                    skill_role: relatedRequirements?.category_details?.skill_role || '',
                    skill_duration: relatedRequirements?.category_details?.skill_duration || '',
                    infrastructure_scope: relatedRequirements?.category_details?.infrastructure_scope || ''
                  }
                })

              setAdditionalNeeds(additional)
            }
          } catch {
            setAdditionalNeeds([])
          }
        }
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

  const handleProjectSelect = (projectId: string) => {
    const selectedProject = projects.find((project) => project.id === projectId)
    setFormData((prev) => ({
      ...prev,
      projectId,
      project_title: selectedProject?.title || prev.project_title,
      project_description: selectedProject?.description || prev.project_description,
      project_location: selectedProject?.exact_address || selectedProject?.location || prev.project_location,
      project_timeline: selectedProject?.timeline || prev.project_timeline,
      location: selectedProject?.exact_address || selectedProject?.location || prev.location,
      timeline: selectedProject?.timeline || prev.timeline
    }))
  }

  const activeProjectLocation = projectMode === 'existing'
    ? projects.find((project) => project.id === formData.projectId)?.exact_address || projects.find((project) => project.id === formData.projectId)?.location || formData.project_location
    : formData.project_location

  const activeProjectSummary = projectMode === 'existing'
    ? projects.find((project) => project.id === formData.projectId)
    : {
        id: formData.projectId || 'new-project',
        title: formData.project_title,
        description: formData.project_description,
        location: formData.project_location,
        timeline: formData.project_timeline
      }

  const totalNeeds = 1 + additionalNeeds.length

  const updateAdditionalNeed = (index: number, field: keyof NeedDraft, value: string) => {
    setAdditionalNeeds((prev) => prev.map((need, needIndex) => (needIndex === index ? { ...need, [field]: value } : need)))
  }

  const addAdditionalNeed = () => {
    setAdditionalNeeds((prev) => [...prev, createEmptyNeed()])
  }

  const removeAdditionalNeed = (index: number) => {
    setAdditionalNeeds((prev) => prev.filter((_, needIndex) => needIndex !== index))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    const isBlank = (value: unknown) => !String(value ?? '').trim()

    const validateNeed = (need: NeedDraft, label: string): string | null => {
      if (isBlank(need.title)) return `${label}: request title is required.`
      if (String(need.title).trim().length < 3) return `${label}: request title must be at least 3 characters.`

      if (isBlank(need.description)) return `${label}: need description is required.`
      if (String(need.description).trim().length < 20) return `${label}: need description must be at least 20 characters.`

      if (isBlank(need.request_type)) return `${label}: request type is required.`
      if (!SERVICE_REQUEST_CATEGORIES.includes(need.request_type)) return `${label}: select a valid request type.`

      if (isBlank(need.timeline)) return `${label}: timeline / deadline is required.`
      if (!isValidTimelineValue(need.timeline)) return `${label}: timeline must be Anytime, a duration like 4 weeks, or a date like 2026-05-15.`

      if (isBlank(need.budget)) return `${label}: budget range is required.`
      if (!['Under INR 25,000', 'INR 25,000 - INR 1,00,000', 'INR 1,00,000 - INR 5,00,000', 'INR 5,00,000+', 'Not specified'].includes(need.budget)) {
        return `${label}: select a valid budget range.`
      }

      if (isBlank(need.estimated_budget)) return `${label}: estimated budget is required.`
      if (!isValidMoneyValue(need.estimated_budget)) return `${label}: estimated budget must be a valid amount like INR 50,000.`

      if (isBlank(need.beneficiary_count)) return `${label}: beneficiary count is required.`
      if (!isValidPositiveInteger(need.beneficiary_count)) return `${label}: beneficiary count must be a positive whole number.`

      if (isBlank(need.impact_description)) return `${label}: impact description is required.`
      if (String(need.impact_description).trim().length < 20) return `${label}: impact description must be at least 20 characters.`

      if (isBlank(need.contactInfo)) return `${label}: contact information is required.`
      if (String(need.contactInfo).trim().length < 10) return `${label}: contact information must include enough detail to reach you.`

      if (need.request_type === 'Material Need') {
        if (isBlank(need.material_items)) return `${label}: material items are required.`
        if (String(need.material_items).trim().length < 3) return `${label}: material items must be more specific.`
      }

      if (need.request_type === 'Skill / Service Need') {
        if (isBlank(need.skill_role)) return `${label}: role needed is required.`
        if (String(need.skill_role).trim().length < 3) return `${label}: role needed must be more specific.`
        if (isBlank(need.skill_duration)) return `${label}: duration is required.`
        if (String(need.skill_duration).trim().length < 2) return `${label}: duration must be more specific.`
        if (isBlank(need.target_quantity)) return `${label}: people count is required.`
        if (!isValidPositiveInteger(need.target_quantity)) return `${label}: people count must be a positive whole number.`
      }

      if (need.request_type === 'Infrastructure Project') {
        if (isBlank(need.infrastructure_scope)) return `${label}: infrastructure scope is required.`
        if (String(need.infrastructure_scope).trim().length < 10) return `${label}: infrastructure scope must be more specific.`
      }

      return null
    }

    if ([formData.title, formData.description, formData.request_type, formData.timeline, formData.budget, formData.estimated_budget, formData.beneficiary_count, formData.impact_description, formData.contactInfo].some(isBlank)) {
      toast({ title: 'Validation Error', description: 'Every main request field must be filled.', variant: 'destructive' })
      return
    }

    if (String(formData.title).trim().length < 3) {
      toast({ title: 'Validation Error', description: 'Request title must be at least 3 characters.', variant: 'destructive' })
      return
    }

    if (String(formData.description).trim().length < 20) {
      toast({ title: 'Validation Error', description: 'Description must be at least 20 characters.', variant: 'destructive' })
      return
    }

    if (!isValidTimelineValue(formData.timeline)) {
      toast({ title: 'Validation Error', description: 'Timeline must be Anytime, a duration like 4 weeks, or a date like 2026-05-15.', variant: 'destructive' })
      return
    }

    if (!isValidMoneyValue(formData.estimated_budget)) {
      toast({ title: 'Validation Error', description: 'Estimated budget must be a valid amount like INR 50,000.', variant: 'destructive' })
      return
    }

    if (!isValidPositiveInteger(formData.beneficiary_count)) {
      toast({ title: 'Validation Error', description: 'Beneficiary count must be a positive whole number.', variant: 'destructive' })
      return
    }

    if (!SERVICE_REQUEST_CATEGORIES.includes(formData.request_type)) {
      toast({ title: 'Validation Error', description: 'Select a valid request type.', variant: 'destructive' })
      return
    }

    if (projectMode === 'new' && [formData.project_title, formData.project_description, formData.project_location, formData.project_timeline].some(isBlank)) {
      toast({ title: 'Validation Error', description: 'Project title, description, exact address, and timeline are required.', variant: 'destructive' })
      return
    }

    if (projectMode === 'new') {
      if (String(formData.project_title).trim().length < 3) {
        toast({ title: 'Validation Error', description: 'Project title must be at least 3 characters.', variant: 'destructive' })
        return
      }

      if (String(formData.project_description).trim().length < 20) {
        toast({ title: 'Validation Error', description: 'Project description must be at least 20 characters.', variant: 'destructive' })
        return
      }

      if (String(formData.project_location).trim().length < 10) {
        toast({ title: 'Validation Error', description: 'Project exact address must be detailed enough to locate the project.', variant: 'destructive' })
        return
      }

      if (!isValidTimelineValue(formData.project_timeline)) {
        toast({ title: 'Validation Error', description: 'Project timeline must be Anytime, a duration like 4 weeks, or a date like 2026-05-15.', variant: 'destructive' })
        return
      }
    }

    if (projectMode === 'existing' && !formData.projectId) {
      toast({ title: 'Validation Error', description: 'Select an existing project or switch to creating a new one.', variant: 'destructive' })
      return
    }

    for (const [index, need] of additionalNeeds.entries()) {
      const validationError = validateNeed(need, `Additional need ${index + 1}`)
      if (validationError) {
        toast({ title: 'Validation Error', description: validationError, variant: 'destructive' })
        return
      }
    }

    setSubmitting(true)

    const details = {
      material_items: formData.material_items,
      skill_role: formData.skill_role,
      skill_duration: formData.skill_duration,
      infrastructure_scope: formData.infrastructure_scope
    }

    const projectPayload = projectMode === 'new'
      ? {
          title: formData.project_title,
          description: formData.project_description,
          location: formData.project_location,
          exact_address: formData.project_location,
          timeline: formData.project_timeline
        }
      : null

    try {
      const token = localStorage.getItem('token')

      let activeProjectId = formData.projectId
      if (projectMode === 'new') {
        const projectResponse = await fetch('/api/service-request-projects', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify(projectPayload)
        })

        const projectData = await projectResponse.json()
        if (!projectResponse.ok || !projectData.success || !projectData.data?.id) {
          toast({ title: 'Error', description: projectData.error || 'Failed to create project context', variant: 'destructive' })
          setSubmitting(false)
          return
        }

        activeProjectId = projectData.data.id
      }

      const response = await fetch(`/api/service-requests/${resolvedParams.id}`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          ...formData,
          category: formData.request_type,
          projectId: activeProjectId || undefined,
          project: projectPayload,
          details
        })
      })

      const data = await response.json()
      if (data.success) {
        for (const need of additionalNeeds) {
          const createResponse = await fetch('/api/service-requests', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              projectId: activeProjectId || undefined,
              title: need.title,
              description: need.description,
              request_type: need.request_type,
              category: need.category,
              location: activeProjectLocation,
              urgency: need.urgency,
              timeline: need.timeline,
              budget: need.budget,
              estimated_budget: need.estimated_budget,
              beneficiary_count: need.beneficiary_count,
              impact_description: need.impact_description,
              contactInfo: need.contactInfo,
              target_amount: need.target_amount,
              target_quantity: need.target_quantity,
              current_amount: need.current_amount,
              current_quantity: need.current_quantity,
              project_context: {
                project_title: formData.project_title,
                project_location: formData.project_location,
                project_description: formData.project_description,
                project_timeline: formData.project_timeline
              },
              details: {
                material_items: need.material_items,
                skill_role: need.skill_role,
                skill_duration: need.skill_duration,
                infrastructure_scope: need.infrastructure_scope
              }
            })
          })

          const createData = await createResponse.json()
          if (!createResponse.ok || !createData.success) {
            toast({ title: 'Partial Update', description: createData.error || 'Main request saved, but one additional need failed to create.', variant: 'destructive' })
            break
          }
        }

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

      <div className="container mx-auto px-4 py-6 sm:py-8">
        <div className="mb-6">
          <Button variant="ghost" onClick={() => router.back()} className="w-full justify-start px-0 text-blue-600 hover:text-blue-800 hover:bg-transparent active:bg-transparent focus-visible:bg-transparent focus-visible:ring-0 sm:w-auto">
            <ArrowLeft size={20} className="mr-2" />
            Back
          </Button>
        </div>

        <div className="mx-auto w-full max-w-4xl">
          <Card>
            <CardHeader>
              <CardTitle className="text-2xl">Edit Execution Request</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="space-y-4 rounded-lg border p-4 bg-muted/30">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <h3 className="font-semibold">Project Context</h3>
                      <p className="text-sm text-muted-foreground">Keep the request attached to the correct initiative.</p>
                    </div>
                    <div className="flex w-full flex-wrap rounded-md border bg-background p-1 text-sm sm:w-auto">
                      <button type="button" onClick={() => setProjectMode('new')} className={`flex-1 rounded px-3 py-1.5 sm:flex-none ${projectMode === 'new' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}>
                        New Project
                      </button>
                      <button type="button" onClick={() => setProjectMode('existing')} className={`flex-1 rounded px-3 py-1.5 sm:flex-none ${projectMode === 'existing' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}>
                        Existing Project
                      </button>
                    </div>
                  </div>

                  {projectMode === 'existing' ? (
                    <div className="space-y-3">
                      <Label htmlFor="projectId">Select Project</Label>
                      <Select value={formData.projectId} onValueChange={handleProjectSelect}>
                        <SelectTrigger>
                          <SelectValue placeholder={loadingProjects ? 'Loading projects...' : 'Choose a project'} />
                        </SelectTrigger>
                        <SelectContent>
                          {projects.length === 0 ? (
                            <SelectItem value="__no_projects__" disabled>
                              No projects available
                            </SelectItem>
                          ) : (
                            projects.map((project) => (
                              <SelectItem key={project.id} value={project.id}>
                                {project.title} - {project.exact_address || project.location}
                              </SelectItem>
                            ))
                          )}
                        </SelectContent>
                      </Select>
                      {projects.length === 0 && !loadingProjects && (
                        <p className="text-xs text-muted-foreground">No projects found yet. Switch to New Project to create one.</p>
                      )}
                    </div>
                  ) : (
                    <div className="grid gap-4 md:grid-cols-2">
                      <div>
                        <Label htmlFor="project_title">Project Title *</Label>
                        <Input id="project_title" value={formData.project_title} onChange={(e) => handleInput('project_title', e.target.value)} placeholder="e.g., Rural Classroom Setup" required />
                      </div>
                      <div>
                        <Label htmlFor="project_location">Project Exact Address *</Label>
                        <Input id="project_location" value={formData.project_location} onChange={(e) => handleInput('project_location', e.target.value)} placeholder="Street, area, city, state, pincode" required />
                      </div>
                      <div className="md:col-span-2">
                        <Label htmlFor="project_description">Project Description *</Label>
                        <Textarea id="project_description" value={formData.project_description} onChange={(e) => handleInput('project_description', e.target.value)} rows={3} placeholder="Describe the broader initiative and objective." required />
                      </div>
                      <div className="md:col-span-2">
                        <Label htmlFor="project_timeline">Project Timeline *</Label>
                        <Input id="project_timeline" value={formData.project_timeline} onChange={(e) => handleInput('project_timeline', e.target.value)} placeholder="Anytime, 4 weeks, 2026-05-15" required />
                      </div>
                    </div>
                  )}
                </div>

                <div className="rounded-lg border bg-background p-4 shadow-sm">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Project Summary</p>
                      <h3 className="text-lg font-semibold">{activeProjectSummary?.title || 'Project not set yet'}</h3>
                      <p className="text-sm text-muted-foreground">
                        {activeProjectSummary?.location || 'Add an exact address to keep the request group consistent.'}
                      </p>
                    </div>
                    <div className="grid gap-2 text-sm sm:text-right">
                      <div>
                        <span className="font-medium">Total needs:</span> {totalNeeds}
                      </div>
                      <div>
                        <span className="font-medium">Additional needs:</span> {additionalNeeds.length}
                      </div>
                      <div>
                        <span className="font-medium">Timeline:</span> {activeProjectSummary?.timeline || 'Not set'}
                      </div>
                    </div>
                  </div>
                  {activeProjectSummary?.description && (
                    <p className="mt-3 text-sm text-muted-foreground">{activeProjectSummary.description}</p>
                  )}
                </div>

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
                      step="1"
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
                    <Label htmlFor="urgency">Urgency *</Label>
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
                    <Label htmlFor="estimated_budget">Estimated Budget *</Label>
                    <Input id="estimated_budget" value={formData.estimated_budget} onChange={(e) => handleInput('estimated_budget', e.target.value)} placeholder="e.g., INR 50,000" required />
                  </div>
                </div>

                <div>
                  <Label htmlFor="timeline">Timeline / Deadline *</Label>
                  <div className="mt-2 flex gap-2">
                    <Input
                      id="timeline"
                      value={formData.timeline}
                      onChange={(e) => handleInput('timeline', e.target.value)}
                      placeholder="Anytime, 4 weeks, 2026-05-15"
                      required
                    />
                    <Button type="button" variant="outline" onClick={() => handleInput('timeline', 'Anytime')}>
                      Anytime
                    </Button>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">Use Anytime, a duration like 4 weeks, or a date like 2026-05-15.</p>
                </div>

                {formData.request_type === 'Material Need' && (
                  <div className="rounded-lg border p-4 space-y-4">
                    <div>
                      <h3 className="font-semibold">Material Details</h3>
                      <p className="text-sm text-muted-foreground">Describe the exact items and delivery quantity.</p>
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                      <div>
                        <Label htmlFor="material_items">Items Needed *</Label>
                        <Input id="material_items" value={formData.material_items} onChange={(e) => handleInput('material_items', e.target.value)} placeholder="e.g., books, notebooks, uniforms" required />
                      </div>
                    </div>
                  </div>
                )}

                {formData.request_type === 'Skill / Service Need' && (
                  <div className="rounded-lg border p-4 space-y-4">
                    <div>
                      <h3 className="font-semibold">Skill / Service Details</h3>
                      <p className="text-sm text-muted-foreground">Define the role, headcount, and duration clearly.</p>
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                      <div>
                        <Label htmlFor="skill_role">Role Needed *</Label>
                        <Input id="skill_role" value={formData.skill_role} onChange={(e) => handleInput('skill_role', e.target.value)} placeholder="e.g., Mathematics teacher" required />
                      </div>
                      <div className="md:col-span-2">
                        <Label htmlFor="skill_duration">Duration *</Label>
                        <Input id="skill_duration" value={formData.skill_duration} onChange={(e) => handleInput('skill_duration', e.target.value)} placeholder="e.g., 1 month" required />
                      </div>
                    </div>
                  </div>
                )}

                {formData.request_type === 'Infrastructure Project' && (
                  <div className="rounded-lg border p-4 space-y-4">
                    <div>
                      <h3 className="font-semibold">Infrastructure Scope</h3>
                      <p className="text-sm text-muted-foreground">Summarize the execution scope and budget target.</p>
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="md:col-span-2">
                        <Label htmlFor="infrastructure_scope">Scope *</Label>
                        <Textarea id="infrastructure_scope" value={formData.infrastructure_scope} onChange={(e) => handleInput('infrastructure_scope', e.target.value)} placeholder="e.g., Build two classrooms and one washroom block." rows={3} required />
                      </div>
                    </div>
                  </div>
                )}

                <div className="space-y-4 rounded-lg border p-4 bg-muted/30">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <h3 className="font-semibold">Additional Needs</h3>
                      <p className="text-sm text-muted-foreground">Add other needs under the same project.</p>
                    </div>
                    <Button type="button" variant="outline" onClick={addAdditionalNeed} className="w-full sm:w-auto">
                      <Plus size={16} className="mr-2" />
                      Add Need
                    </Button>
                  </div>

                  <div className="space-y-4">
                    {additionalNeeds.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No additional needs added yet.</p>
                    ) : (
                      additionalNeeds.map((need, index) => (
                        <div key={index} className="rounded-lg border bg-background p-4 space-y-4">
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <h4 className="font-semibold">Extra Need {index + 1}</h4>
                              <p className="text-sm text-muted-foreground">This will be created as a separate request.</p>
                            </div>
                            <Button type="button" variant="ghost" onClick={() => removeAdditionalNeed(index)} className="text-red-600 hover:text-red-700 hover:bg-red-50">
                              <Trash2 size={16} className="mr-2" />
                              Remove
                            </Button>
                          </div>

                          <div className="grid gap-4">
                            <div>
                              <Label htmlFor={`extra_title-${index}`}>Request Title *</Label>
                              <Input id={`extra_title-${index}`} value={need.title} onChange={(e) => updateAdditionalNeed(index, 'title', e.target.value)} placeholder="e.g., Desk and chair support" required />
                            </div>

                            <div>
                              <Label htmlFor={`extra_description-${index}`}>Need Description *</Label>
                              <Textarea id={`extra_description-${index}`} value={need.description} onChange={(e) => updateAdditionalNeed(index, 'description', e.target.value)} rows={4} placeholder="Describe this need in detail." required />
                            </div>

                            <div className="grid gap-4 md:grid-cols-2">
                              <div>
                                <Label htmlFor={`extra_request_type-${index}`}>Request Type *</Label>
                                <Select value={need.request_type} onValueChange={(value) => {
                                  updateAdditionalNeed(index, 'request_type', value)
                                  updateAdditionalNeed(index, 'category', value)
                                }}>
                                  <SelectTrigger>
                                    <SelectValue placeholder="Select request type" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {SERVICE_REQUEST_CATEGORIES.map((category) => (
                                      <SelectItem key={category} value={category}>{category}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>

                            </div>

                            <div className="grid gap-4 md:grid-cols-2">
                              <div>
                                <Label htmlFor={`extra_beneficiary_count-${index}`}>Beneficiary Count *</Label>
                                <Input id={`extra_beneficiary_count-${index}`} type="number" min="1" step="1" value={need.beneficiary_count} onChange={(e) => updateAdditionalNeed(index, 'beneficiary_count', e.target.value)} placeholder="e.g., 100" required />
                              </div>
                              <div>
                                <Label htmlFor={`extra_urgency-${index}`}>Urgency *</Label>
                                <Select value={need.urgency} onValueChange={(value) => updateAdditionalNeed(index, 'urgency', value)}>
                                  <SelectTrigger>
                                    <SelectValue placeholder="Select urgency" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {urgencyLevels.map((level) => (
                                      <SelectItem key={level.value} value={level.value}>{level.label}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                            </div>

                            <div className="grid gap-4 md:grid-cols-2">
                              <div>
                                <Label htmlFor={`extra_impact-${index}`}>Impact Description *</Label>
                                <Textarea id={`extra_impact-${index}`} value={need.impact_description} onChange={(e) => updateAdditionalNeed(index, 'impact_description', e.target.value)} rows={3} placeholder="What changes after this need is fulfilled?" required />
                              </div>
                              <div>
                                <Label htmlFor={`extra_timeline-${index}`}>Timeline / Deadline *</Label>
                                <Input id={`extra_timeline-${index}`} value={need.timeline} onChange={(e) => updateAdditionalNeed(index, 'timeline', e.target.value)} placeholder="Anytime, 4 weeks, 2026-05-15" required />
                              </div>
                            </div>

                            {need.request_type === 'Material Need' && (
                              <div className="rounded-lg border p-4 space-y-4">
                                <div>
                                  <h4 className="font-semibold">Material Details</h4>
                                </div>
                                <div className="grid gap-4 md:grid-cols-2">
                                  <div>
                                    <Label htmlFor={`extra_material_items-${index}`}>Items Needed *</Label>
                                    <Input id={`extra_material_items-${index}`} value={need.material_items} onChange={(e) => updateAdditionalNeed(index, 'material_items', e.target.value)} placeholder="e.g., books, notebooks" required />
                                  </div>
                                  <div>
                                    <Label htmlFor={`extra_material_quantity-${index}`}>Quantity *</Label>
                                    <Input id={`extra_material_quantity-${index}`} value={need.target_quantity} onChange={(e) => updateAdditionalNeed(index, 'target_quantity', e.target.value)} placeholder="e.g., 100" required />
                                  </div>
                                </div>
                              </div>
                            )}

                            {need.request_type === 'Skill / Service Need' && (
                              <div className="rounded-lg border p-4 space-y-4">
                                <div>
                                  <h4 className="font-semibold">Skill / Service Details</h4>
                                </div>
                                <div className="grid gap-4 md:grid-cols-2">
                                  <div>
                                    <Label htmlFor={`extra_skill_role-${index}`}>Role Needed *</Label>
                                    <Input id={`extra_skill_role-${index}`} value={need.skill_role} onChange={(e) => updateAdditionalNeed(index, 'skill_role', e.target.value)} placeholder="e.g., Mathematics teacher" required />
                                  </div>
                                  <div>
                                    <Label htmlFor={`extra_skill_people-${index}`}>People Needed *</Label>
                                    <Input id={`extra_skill_people-${index}`} value={need.target_quantity} onChange={(e) => updateAdditionalNeed(index, 'target_quantity', e.target.value)} placeholder="e.g., 3" required />
                                  </div>
                                  <div className="md:col-span-2">
                                    <Label htmlFor={`extra_skill_duration-${index}`}>Duration *</Label>
                                    <Input id={`extra_skill_duration-${index}`} value={need.skill_duration} onChange={(e) => updateAdditionalNeed(index, 'skill_duration', e.target.value)} placeholder="e.g., 1 month" required />
                                  </div>
                                </div>
                              </div>
                            )}

                            {need.request_type === 'Infrastructure Project' && (
                              <div className="rounded-lg border p-4 space-y-4">
                                <div>
                                  <h4 className="font-semibold">Infrastructure Scope</h4>
                                </div>
                                <div className="md:col-span-2">
                                  <Label htmlFor={`extra_infrastructure_scope-${index}`}>Scope *</Label>
                                  <Textarea id={`extra_infrastructure_scope-${index}`} value={need.infrastructure_scope} onChange={(e) => updateAdditionalNeed(index, 'infrastructure_scope', e.target.value)} rows={3} placeholder="e.g., Build two classrooms and one washroom block." required />
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <div className="flex flex-col gap-3 pt-4 sm:flex-row">
                  <Button type="submit" disabled={submitting} className="w-full flex-1">
                    {submitting ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Updating...
                      </>
                    ) : (
                      'Update Request'
                    )}
                  </Button>
                  <Button type="button" variant="outline" onClick={() => router.back()} className="w-full flex-1">
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
