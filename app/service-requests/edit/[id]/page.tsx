'use client'

import React, { useState, useEffect, use } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Loader2 } from 'lucide-react'

import { Header } from '@/components/header'
import { useAuth } from '@/lib/auth-context'
import { useToast } from '@/hooks/use-toast'
import { CSR_SCHEDULE_VII_CATEGORIES, SERVICE_REQUEST_CATEGORIES } from '@/lib/categories'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { StyledSelect } from '@/components/ui/styled-select'
import { Textarea } from '@/components/ui/textarea'

type RequestProject = {
  id: string
  title: string
  description?: string | null
  location: string
  exact_address?: string | null
  timeline?: string | null
  category?: string | null
}

type NeedDraft = {
  title: string
  description: string
  images: string
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

type UploadProgressState = {
  active: boolean
  current: number
  total: number
}

const createEmptyNeed = (): NeedDraft => ({
  title: '',
  description: '',
  images: '',
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

const timelinePattern = /^(?:\d+\s*(?:day|days|week|weeks|month|months|year|years)|\d{4}-\d{2}-\d{2})$/i

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
  const [projectMode] = useState<'existing'>('existing')
  const [projectAvailableForCsr, setProjectAvailableForCsr] = useState(true)
  const [projects, setProjects] = useState<RequestProject[]>([])
  const [additionalNeeds, setAdditionalNeeds] = useState<NeedDraft[]>([])
  const [mainUploadProgress, setMainUploadProgress] = useState<UploadProgressState | null>(null)
  const [additionalUploadProgress, setAdditionalUploadProgress] = useState<Record<number, UploadProgressState>>({})
  const [formData, setFormData] = useState({
    projectId: '',
    project_title: '',
    project_description: '',
    project_location: '',
    project_expected_beneficiaries: '',
    project_valid_until: '',
    project_timeline: '',
    project_category: '',
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
      toast({ title: 'Access Denied', description: 'Only NGOs can edit needs', variant: 'destructive' })
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
          toast({ title: 'Error', description: data.error || 'Failed to fetch need details', variant: 'destructive' })
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
        const projectCategory = req.category || requirements?.project_category || requestProject?.category || ''

        if (requestProject?.id) {
          // keep projectMode as 'existing' — edit page does not allow creating a new project
          // projectMode remains fixed to 'existing'
        }

        setFormData({
          projectId: requestProject?.id || '',
          project_title: requestProject?.title || '',
          project_description: requestProject?.description || '',
          project_location: requestProject?.exact_address || requestProject?.location || req.location || '',
          project_timeline: requestProject?.timeline || requirements.timeline || req.timeline || '',
          project_expected_beneficiaries: String(requestProject?.expected_beneficiaries || requirements?.beneficiary_count || ''),
          project_valid_until: requestProject?.valid_until || requirements?.project_valid_until || '',
          project_category: projectCategory,
          title: req.title || '',
          description: req.description || '',
          images: Array.isArray(req.images) ? req.images.join('\n') : String(req.images || requirements?.images || req.image_url || ''),
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
                    images: Array.isArray(item.images) ? item.images.join('\n') : String(item.images || relatedRequirements?.images || item.image_url || ''),
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
        toast({ title: 'Error', description: 'Failed to fetch need details', variant: 'destructive' })
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

  // project selection is not editable on the edit-need page; keep existing project assignment only

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

  const parseImageUrls = (value: string) => {
    return value
      .split(/[\n,]/)
      .map((item) => item.trim())
      .filter(Boolean)
  }

  const appendImageUrls = (currentValue: string, urls: string[]) => {
    if (urls.length === 0) return currentValue
    return [...parseImageUrls(currentValue), ...urls].join('\n')
  }

  const removeImageUrl = (currentValue: string, urlToRemove: string) => {
    return parseImageUrls(currentValue).filter((url) => url !== urlToRemove).join('\n')
  }

  const handleUpload = async (
    files: FileList | null,
    onProgress?: (current: number, total: number) => void
  ) => {
    if (!files || files.length === 0) return { urls: [] as string[], failures: [] as string[] }

    const token = localStorage.getItem('token')
    const urls: string[] = []
    const failures: string[] = []
    const total = Array.from(files).length
    let completed = 0

    for (const file of Array.from(files)) {
      try {
        const uploadData = new FormData()
        uploadData.append('file', file)

        const response = await fetch('/api/upload', {
          method: 'POST',
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
          body: uploadData
        })

        const data = await response.json()
        if (!response.ok || !data.success || !data.data?.url) {
          throw new Error(data.error || 'Failed to upload image')
        }

        urls.push(data.data.url)
      } catch {
        failures.push(file.name)
      } finally {
        completed += 1
        onProgress?.(completed, total)
      }
    }

    return { urls, failures }
  }

  const handleMainNeedUpload = async (files: FileList | null) => {
    const total = files?.length || 0
    if (total > 0) {
      setMainUploadProgress({ active: true, current: 0, total })
    }

    const result = await handleUpload(files, (current, totalCount) => {
      setMainUploadProgress({ active: true, current, total: totalCount })
    })

    if (total > 0) {
      setMainUploadProgress({ active: false, current: total, total })
    }
    if (result.urls.length > 0) {
      setFormData((prev) => ({ ...prev, images: appendImageUrls(prev.images, result.urls) }))
    }
    if (result.failures.length > 0) {
      toast({ title: 'Partial Upload Failure', description: `${result.failures.length} image(s) could not be uploaded for the main need.`, variant: 'destructive' })
    }
  }

  const handleAdditionalNeedUpload = async (index: number, files: FileList | null) => {
    const total = files?.length || 0
    if (total > 0) {
      setAdditionalUploadProgress((prev) => ({
        ...prev,
        [index]: { active: true, current: 0, total }
      }))
    }

    const result = await handleUpload(files, (current, totalCount) => {
      setAdditionalUploadProgress((prev) => ({
        ...prev,
        [index]: { active: true, current, total: totalCount }
      }))
    })

    if (total > 0) {
      setAdditionalUploadProgress((prev) => ({
        ...prev,
        [index]: { active: false, current: total, total }
      }))
    }

    if (result.urls.length > 0) {
      setAdditionalNeeds((prev) => prev.map((need, needIndex) => needIndex === index ? { ...need, images: appendImageUrls(need.images, result.urls) } : need))
    }
    if (result.failures.length > 0) {
      toast({ title: 'Partial Upload Failure', description: `${result.failures.length} image(s) could not be uploaded for Additional need ${index + 1}.`, variant: 'destructive' })
    }
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
      if (isBlank(need.title)) return `${label}: need title is required.`
      if (String(need.title).trim().length < 3) return `${label}: need title must be at least 3 characters.`

      if (isBlank(need.description)) return `${label}: need description is required.`
      if (String(need.description).trim().length < 20) return `${label}: need description must be at least 20 characters.`

      if (isBlank(need.request_type)) return `${label}: need type is required.`
      if (!SERVICE_REQUEST_CATEGORIES.includes(need.request_type)) return `${label}: select a valid need type.`


      if (isBlank(need.budget)) return `${label}: budget range is required.`
      if (!['Under INR 25,000', 'INR 25,000 - INR 1,00,000', 'INR 1,00,000 - INR 5,00,000', 'INR 5,00,000+', 'Not specified'].includes(need.budget)) {
        return `${label}: select a valid budget range.`
      }

      // beneficiary_count and timeline inherited from project; do not validate here

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

    if ([formData.title, formData.description, formData.request_type, formData.budget, formData.impact_description, formData.contactInfo].some(isBlank)) {
      toast({ title: 'Validation Error', description: 'Every main need field must be filled.', variant: 'destructive' })
      return
    }

    if (String(formData.title).trim().length < 3) {
      toast({ title: 'Validation Error', description: 'Need title must be at least 3 characters.', variant: 'destructive' })
      return
    }

    if (String(formData.description).trim().length < 20) {
      toast({ title: 'Validation Error', description: 'Description must be at least 20 characters.', variant: 'destructive' })
      return
    }

    if (!isValidTimelineValue(formData.timeline)) {
      toast({ title: 'Validation Error', description: 'Timeline must be a duration like 4 weeks or a date like 2026-05-15.', variant: 'destructive' })
      return
    }

    if (!isValidPositiveInteger(formData.beneficiary_count)) {
      toast({ title: 'Validation Error', description: 'Beneficiary count must be a positive whole number.', variant: 'destructive' })
      return
    }

    if (!SERVICE_REQUEST_CATEGORIES.includes(formData.request_type)) {
      toast({ title: 'Validation Error', description: 'Select a valid need type.', variant: 'destructive' })
      return
    }

    // Project creation/validation is not allowed from the edit need page.
    // Edit page only validates need-level fields.

    // projectMode is fixed to 'existing' on edit page; assume formData.projectId is already set.

    // additionalNeeds are not created from the edit need page

    setSubmitting(true)

    const details = {
      material_items: formData.material_items,
      skill_role: formData.skill_role,
      skill_duration: formData.skill_duration,
      infrastructure_scope: formData.infrastructure_scope
    }

    // On edit page we don't create new projects; projectPayload is null
    const projectPayload = null

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
          images: parseImageUrls(formData.images),
          category: formData.project_category,
          project_category: formData.project_category,
          projectId: activeProjectId || undefined,
          project: projectPayload,
          estimated_budget: formData.budget,
          details
        })
      })

      const data = await response.json()
        if (data.success) {
          toast({ title: 'Success', description: 'Need updated successfully' })
          router.push('/service-requests?view=my-requests')
        } else {
          toast({ title: 'Error', description: data.error || 'Failed to update need', variant: 'destructive' })
        }
    } catch {
      toast({ title: 'Error', description: 'Failed to update need', variant: 'destructive' })
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
              <CardTitle className="text-2xl">Edit Execution Need</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-6">
                <div>
                  <Label htmlFor="title">Need Title *</Label>
                  <Input id="title" value={formData.title} onChange={(e) => handleInput('title', e.target.value)} required />
                </div>

                <div>
                  <Label htmlFor="description">Description *</Label>
                  <Textarea id="description" value={formData.description} onChange={(e) => handleInput('description', e.target.value)} rows={4} required />
                </div>

                <div>
                  <Label htmlFor="images">Images</Label>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
                    <label className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md cursor-pointer hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-400">
                      Choose files
                      <input id="main-need-images" type="file" accept="image/*" multiple className="sr-only" onChange={(event) => void handleMainNeedUpload(event.target.files)} />
                    </label>
                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                      <span className="text-sm text-gray-600">{parseImageUrls(formData.images).length > 0 ? `${parseImageUrls(formData.images).length} file(s) selected` : 'No files chosen'}</span>
                      {mainUploadProgress?.active && (
                        <div className="flex items-center gap-2">
                          <div className="h-2 w-full overflow-hidden rounded-full bg-gray-200 sm:w-40">
                            <div
                              className="h-full rounded-full bg-blue-600 transition-all"
                              style={{ width: `${Math.max(5, (mainUploadProgress.current / Math.max(1, mainUploadProgress.total)) * 100)}%` }}
                            />
                          </div>
                          <span className="shrink-0 text-xs text-gray-500">{mainUploadProgress.current}/{mainUploadProgress.total}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {parseImageUrls(formData.images).length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-3">
                      {parseImageUrls(formData.images).map((url) => (
                        <div key={url} className="relative h-20 w-20 overflow-hidden rounded-lg border border-gray-200 bg-gray-50">
                          <img src={url} alt="uploaded" className="h-full w-full object-cover" />
                          <button
                            type="button"
                            onClick={() => setFormData((prev) => ({ ...prev, images: removeImageUrl(prev.images, url) }))}
                            className="absolute right-1 top-1 inline-flex h-5 w-5 items-center justify-center rounded-full bg-black/70 text-white hover:bg-red-600"
                            aria-label="Remove image"
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  <p className="mt-1 text-xs text-muted-foreground">Leave blank to show the no-image placeholder on request cards.</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="request_type">Need Type *</Label>
                    <StyledSelect
                      value={formData.request_type}
                      options={SERVICE_REQUEST_CATEGORIES}
                      placeholder="Select need type"
                      onValueChange={(value) => {
                        handleInput('request_type', value)
                        handleInput('category', value)
                      }}
                    />
                  </div>

                  <div>
                    <Label>Beneficiary Count</Label>
                    <div className="mt-1 text-sm text-muted-foreground">Inherited from project: {formData.project_expected_beneficiaries || 'Not set'}</div>
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

                {/* Timeline is inherited from project; do not edit per new UX */}

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

                

                <div className="flex flex-col gap-3 pt-4 sm:flex-row">
                  <Button type="submit" disabled={submitting} className="w-full flex-1">
                    {submitting ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Updating...
                      </>
                    ) : (
                      'Update Need'
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
