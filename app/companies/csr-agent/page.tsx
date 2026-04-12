"use client"

import { FormEvent, useEffect, useMemo, useState } from "react"
import { useAuth } from "@/lib/auth-context"
import { Header } from "@/components/header"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { CSRAgentOutputCard } from "@/components/csr-agent-output-card"
import { Sparkles } from "lucide-react"

type ProjectStatus = "pending" | "accepted" | "rejected"

interface AgentFormData {
  campaignName: string
  category: string
  location: string
  budget: string
  startDate: string
  endDate: string
  requirementDetails: string
}

interface ServiceSuggestion {
  id: string
  serviceName: string
  organization: string
  matchReason: string
  estimatedCost: string
}

interface MilestoneInput {
  description: string
  budgetTarget: string
}

interface CSRProject {
  id: string
  status: ProjectStatus
  campaign: GeneratedCampaign
  savedCampaignId?: string
}

interface GeneratedCampaign {
  title: string
  description: string
  category: string
  location: string
  budget_inr: number
  budget_breakdown: {
    infrastructure: number
    training: number
    materials: number
    monitoring: number
    contingency: number
  }
  schedule_vii: string
  sdg_alignment: number[]
  start_date: string
  end_date: string
  impact_metrics: {
    beneficiaries: number
    duration: string
  }
  milestones: Array<{
    title: string
    description: string
    duration_weeks: number
    budget_allocated: number
    deliverables: string[]
  }>
}

export default function CSRAgentPage() {
  const { user } = useAuth()
  const [mounted, setMounted] = useState(false)
  const [formData, setFormData] = useState<AgentFormData>({
    campaignName: "",
    category: "",
    location: "",
    budget: "",
    startDate: "",
    endDate: "",
    requirementDetails: "",
  })
  const [isSubmitted, setIsSubmitted] = useState(false)
  const [serviceSuggestions, setServiceSuggestions] = useState<ServiceSuggestion[]>([])
  const [projects, setProjects] = useState<CSRProject[]>([])
  const [isGeneratingProjects, setIsGeneratingProjects] = useState(false)
  const [generateError, setGenerateError] = useState<string | null>(null)
  const [decisionError, setDecisionError] = useState<string | null>(null)
  const [savingProjectId, setSavingProjectId] = useState<string | null>(null)
  const [milestoneInputs, setMilestoneInputs] = useState<MilestoneInput[]>([])

  useEffect(() => {
    setMounted(true)
  }, [])

  const categoryOptions = [
    "Hunger, Poverty and Health",
    "Education and Skill Development",
    "Gender Equality and Women Empowerment",
    "Environment and Ecology",
    "National Heritage and Culture",
    "Armed Forces Veterans",
    "Rural and Sports Development",
    "Technology Incubators",
    "Rural Development",
    "Slum Development",
    "Disaster Management",
    "Other",
  ]

  const parsedBudget = Number(formData.budget)
  const isDateRangeValid =
    formData.startDate.trim().length > 0 &&
    formData.endDate.trim().length > 0 &&
    new Date(formData.startDate) < new Date(formData.endDate)

  const areMilestonesComplete = useMemo(() => {
    if (milestoneInputs.length === 0) return false

    return milestoneInputs.every((milestone) => {
      const milestoneBudget = Number(milestone.budgetTarget)
      return milestone.description.trim().length > 0 && Number.isFinite(milestoneBudget) && milestoneBudget > 0
    })
  }, [milestoneInputs])

  const canSubmit = useMemo(() => {
    return (
      formData.campaignName.trim() &&
      formData.category.trim() &&
      formData.location.trim() &&
      Number.isFinite(parsedBudget) &&
      parsedBudget > 0 &&
      isDateRangeValid &&
      areMilestonesComplete &&
      formData.requirementDetails.trim()
    )
  }, [formData, parsedBudget, isDateRangeValid, areMilestonesComplete])

  const handleAddMilestone = () => {
    setMilestoneInputs((previousRows) => [...previousRows, { description: "", budgetTarget: "" }])
  }

  const handleMilestoneInputChange = (
    rowIndex: number,
    field: keyof MilestoneInput,
    value: string
  ) => {
    setMilestoneInputs((previousRows) =>
      previousRows.map((row, currentIndex) =>
        currentIndex === rowIndex ? { ...row, [field]: value } : row
      )
    )
  }

  const handleFormSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!canSubmit) return

    const suggestions: ServiceSuggestion[] = [
      {
        id: "svc-1",
        serviceName: `${formData.category} Field Program Support`,
        organization: "Sunrise Social Foundation",
        matchReason: "Aligned with your project goals and on-ground implementation requirements",
        estimatedCost: `INR ${Math.round(parsedBudget * 0.45).toLocaleString("en-IN")}`,
      },
      {
        id: "svc-2",
        serviceName: `${formData.category} Impact Monitoring`,
        organization: "Impact Ledger Collective",
        matchReason: "Strong outcomes reporting and beneficiary tracking capacity",
        estimatedCost: `INR ${Math.round(parsedBudget * 0.22).toLocaleString("en-IN")}`,
      },
      {
        id: "svc-3",
        serviceName: `${formData.category} Community Engagement`,
        organization: "Seva Reach Network",
        matchReason: `Proven local partnerships in ${formData.location} with measurable participation models`,
        estimatedCost: `INR ${Math.round(parsedBudget * 0.31).toLocaleString("en-IN")}`,
      },
    ]

    setServiceSuggestions(suggestions)
    setProjects([])
    setIsSubmitted(true)
  }

  const handleGenerateProjects = async () => {
    if (!user?.id) {
      setGenerateError("Unable to identify company account. Please sign in again.")
      return
    }

    setGenerateError(null)
    setDecisionError(null)
    setIsGeneratingProjects(true)

    try {
      const payload = {
        company_id: String(user.id),
        budget: parsedBudget,
        milestones: milestoneInputs.length,
        category: formData.category,
        location: formData.location,
        start_date: formData.startDate,
        end_date: formData.endDate,
        milestone_info: milestoneInputs.map((milestone) => ({
          description: milestone.description,
          budget_allocated: Number(milestone.budgetTarget),
        })),
      }

      const response = await fetch("/api/csr-agent/generate-campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })

      const result = await response.json()

      if (!response.ok || !result?.success || !Array.isArray(result?.data)) {
        throw new Error(result?.error || "Failed to generate CSR projects")
      }

      const generated: CSRProject[] = result.data.map((campaign: GeneratedCampaign, index: number) => ({
        id: `prj-${index + 1}`,
        status: "pending",
        campaign,
      }))

      setProjects(generated)
    } catch (error) {
      console.error("Failed to generate CSR campaigns:", error)
      setProjects([])
      setGenerateError(error instanceof Error ? error.message : "Failed to generate CSR projects")
    } finally {
      setIsGeneratingProjects(false)
    }
  }

  const handleProjectDecision = async (projectId: string, status: Exclude<ProjectStatus, "pending">) => {
    if (!user?.id) {
      setDecisionError("Unable to identify company account. Please sign in again.")
      return
    }

    const selectedProject = projects.find((project) => project.id === projectId)
    if (!selectedProject) {
      setDecisionError("Selected project could not be found.")
      return
    }

    setDecisionError(null)
    setSavingProjectId(projectId)

    try {
      if (status === "rejected") {
        if (selectedProject.savedCampaignId) {
          const rejectResponse = await fetch("/api/csr-agent/update-campaign", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              campaign_id: selectedProject.savedCampaignId,
              company_id: user.id,
              campaign: selectedProject.campaign,
            }),
          })

          const rejectResult = await rejectResponse.json()

          if (!rejectResponse.ok) {
            throw new Error(rejectResult?.error || "Failed to update rejected campaign")
          }
        }

        setProjects((previousProjects) =>
          previousProjects.map((project) =>
            project.id === projectId ? { ...project, status: "rejected" } : project
          )
        )
        return
      }

      const response = await fetch("/api/csr-agent/save-campaign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          campaign: selectedProject.campaign,
          company_id: user.id,
        }),
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result?.error || "Failed to save campaign")
      }

      setProjects((previousProjects) =>
        previousProjects.map((project) =>
          project.id === projectId
            ? { ...project, status: "accepted", savedCampaignId: result?.id }
            : project
        )
      )
    } catch (error) {
      console.error("Failed to save accepted campaign:", error)
      setDecisionError(error instanceof Error ? error.message : "Failed to save campaign")
    } finally {
      setSavingProjectId(null)
    }
  }

  if (!mounted) {
    return (
      <>
        <Header />
        <div className="container mx-auto px-4 py-8">
          <Card>
            <CardHeader>
              <CardTitle>Loading AI CSR Agent</CardTitle>
              <CardDescription>Preparing your workspace...</CardDescription>
            </CardHeader>
          </Card>
        </div>
      </>
    )
  }

  if (user?.user_type !== 'company') {
    return (
      <>
        <Header />
        <div className="container mx-auto px-4 py-8">
          <Card>
            <CardHeader>
              <CardTitle>Access Denied</CardTitle>
              <CardDescription>This feature is only available for company accounts.</CardDescription>
            </CardHeader>
          </Card>
        </div>
      </>
    )
  }

  return (
    <>
      <Header />
      <div className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-udaan-navy mb-2">AI CSR Agent</h1>
          <p className="text-gray-600">Submit your CSR requirement and generate actionable project options</p>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-udaan-orange" />
                CSR Requirement Form
              </CardTitle>
              <CardDescription>Fill in your requirement details and submit to continue</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleFormSubmit} className="grid md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">Campaign Name</label>
                  <Input
                    value={formData.campaignName}
                    onChange={(event) =>
                      setFormData((previous) => ({ ...previous, campaignName: event.target.value }))
                    }
                    placeholder="Enter campaign name"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">CSR Category</label>
                  <select
                    value={formData.category}
                    onChange={(event) => setFormData((previous) => ({ ...previous, category: event.target.value }))}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none"
                  >
                    <option value="">Select CSR category</option>
                    {categoryOptions.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">Project Location</label>
                  <Input
                    value={formData.location}
                    onChange={(event) => setFormData((previous) => ({ ...previous, location: event.target.value }))}
                    placeholder="Ex: Nagpur, Maharashtra"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">Budget (INR)</label>
                  <Input
                    type="number"
                    min="1"
                    step="1"
                    value={formData.budget}
                    onChange={(event) => setFormData((previous) => ({ ...previous, budget: event.target.value }))}
                    placeholder="Ex: 1000000"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">Milestones</label>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleAddMilestone}
                    className="w-full"
                  >
                    + Add Milestone
                  </Button>
                </div>

                {milestoneInputs.length > 0 && (
                  <div className="space-y-3 md:col-span-2 rounded-md border border-gray-200 p-4">
                    <p className="text-sm font-semibold text-udaan-navy">Milestone Planning Inputs</p>
                    <div className="grid gap-3 text-xs font-medium text-gray-600 md:grid-cols-[80px_1fr_1fr]">
                      <span>Sno.</span>
                      <span>Description</span>
                      <span>Budget</span>
                    </div>
                    {milestoneInputs.map((milestone, index) => (
                      <div key={`milestone-${index}`} className="grid items-center gap-3 md:grid-cols-[80px_1fr_1fr]">
                        <div className="text-sm font-medium text-udaan-navy">{index + 1}</div>
                        <Input
                          value={milestone.description}
                          onChange={(event) =>
                            handleMilestoneInputChange(index, "description", event.target.value)
                          }
                          placeholder={`Milestone ${index + 1} description`}
                        />
                        <Input
                          type="number"
                          min="1"
                          step="1"
                          value={milestone.budgetTarget}
                          onChange={(event) =>
                            handleMilestoneInputChange(index, "budgetTarget", event.target.value)
                          }
                          placeholder="Budget (INR)"
                        />
                      </div>
                    ))}
                  </div>
                )}

                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">Start Date</label>
                  <Input
                    type="date"
                    value={formData.startDate}
                    onChange={(event) => setFormData((previous) => ({ ...previous, startDate: event.target.value }))}
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">End Date</label>
                  <Input
                    type="date"
                    value={formData.endDate}
                    onChange={(event) => setFormData((previous) => ({ ...previous, endDate: event.target.value }))}
                  />
                </div>

                <div className="space-y-2 md:col-span-2">
                  <label className="text-sm font-medium text-gray-700">Requirement Details</label>
                  <Textarea
                    value={formData.requirementDetails}
                    onChange={(event) =>
                      setFormData((previous) => ({ ...previous, requirementDetails: event.target.value }))
                    }
                    placeholder="Describe what support or services you are looking for"
                    className="min-h-28"
                  />
                </div>

                <div className="md:col-span-2 flex justify-end">
                  <Button
                    type="submit"
                    disabled={!canSubmit}
                    className="bg-udaan-orange hover:bg-udaan-orange/90"
                  >
                    Submit Requirement
                  </Button>
                </div>

                {!isDateRangeValid && formData.startDate && formData.endDate && (
                  <p className="md:col-span-2 text-sm text-red-600">End date must be later than start date.</p>
                )}

                {!areMilestonesComplete && (
                  <p className="md:col-span-2 text-sm text-red-600">
                    Add at least one milestone, then fill all milestone rows with description and valid budget.
                  </p>
                )}
              </form>
            </CardContent>
          </Card>

          {isSubmitted && (
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Section 1</CardTitle>
                  <CardDescription>Intentionally left blank for now</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="min-h-20 rounded-lg border border-dashed border-gray-200" />
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Section 2: Similar Services</CardTitle>
                  <CardDescription>Services aligned to your requirement</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {serviceSuggestions.map((service) => (
                    <div key={service.id} className="rounded-lg border p-4">
                      <h3 className="text-lg font-semibold text-udaan-navy">{service.serviceName}</h3>
                      <p className="text-sm text-gray-500 mt-1">{service.organization}</p>
                      <p className="text-sm text-gray-700 mt-3">{service.matchReason}</p>
                      <p className="text-sm font-medium text-udaan-orange mt-3">Estimated Cost: {service.estimatedCost}</p>
                    </div>
                  ))}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Section 3: Generate CSR Projects</CardTitle>
                  <CardDescription>
                    Click generate to create project suggestions. Each card supports Accept or Reject.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex justify-start">
                    <Button
                      type="button"
                      onClick={handleGenerateProjects}
                      disabled={isGeneratingProjects}
                      className="bg-udaan-navy hover:bg-udaan-navy/90"
                    >
                      {isGeneratingProjects ? "Generating..." : "Generate"}
                    </Button>
                  </div>

                  {generateError && (
                    <p className="text-sm text-red-600">{generateError}</p>
                  )}

                  {decisionError && (
                    <p className="text-sm text-red-600">{decisionError}</p>
                  )}

                  {projects.length > 0 && (
                    <div className="space-y-4">
                      {projects.map((project) => (
                        <CSRAgentOutputCard
                          key={project.id}
                          campaign={project.campaign}
                          status={project.status}
                          isSaving={savingProjectId === project.id}
                          onAccept={() => handleProjectDecision(project.id, "accepted")}
                          onReject={() => handleProjectDecision(project.id, "rejected")}
                        />
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
