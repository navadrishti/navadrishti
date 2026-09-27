import { useEffect, useState } from "react"
import { fetchRankedProjectSuggestions } from "./api"
import type { CSRAgentSession, ProjectIntakeData, ProjectSuggestion } from "./session"

type ProjectSuggestionsOptions = {
  projectData: ProjectIntakeData
  hasLockedLeadNgo: boolean
  setProjectData: (update: (current: ProjectIntakeData) => ProjectIntakeData) => void
  setSelectedProjectSuggestionId: (projectId: string | null) => void
  appendAssistantMessage: (content: string) => void
  persistSnapshot: (overrides: Partial<CSRAgentSession>) => void
}

export function useProjectSuggestions({
  projectData,
  hasLockedLeadNgo,
  setProjectData,
  setSelectedProjectSuggestionId,
  appendAssistantMessage,
  persistSnapshot,
}: ProjectSuggestionsOptions) {
  const [projectSuggestions, setProjectSuggestions] = useState<ProjectSuggestion[]>([])
  const [isFetchingProjectSuggestions, setIsFetchingProjectSuggestions] = useState(false)

  useEffect(() => {
    if (hasLockedLeadNgo) return

    const title = String(projectData.campaignName || '').trim()
    const category = String(projectData.category || '').trim()

    if (!title || !category) {
      setProjectSuggestions([])
      setSelectedProjectSuggestionId(null)
      return
    }

    let cancelled = false

    const loadProjectSuggestions = async () => {
      setIsFetchingProjectSuggestions(true)
      try {
        const ranked = await fetchRankedProjectSuggestions({
          campaignName: title,
          category,
          city: projectData.city,
          state: projectData.state,
        })

        if (!cancelled) {
          setProjectSuggestions(ranked.slice(0, 4))
        }
      } catch {
        if (!cancelled) setProjectSuggestions([])
      } finally {
        if (!cancelled) setIsFetchingProjectSuggestions(false)
      }
    }

    void loadProjectSuggestions()
    return () => {
      cancelled = true
    }
  }, [projectData.campaignName, projectData.category, projectData.city, projectData.state, hasLockedLeadNgo])

  const handleSelectProjectSuggestion = (project: ProjectSuggestion) => {
    setSelectedProjectSuggestionId(project.id)
    setProjectData((prev) => ({
      ...prev,
      campaignName: project.title,
      requirementDetails: project.description || prev.requirementDetails,
      city: project.location || prev.city,
      startDate: prev.startDate || '',
      endDate: prev.endDate || '',
    }))
    appendAssistantMessage(`Selected existing project suggestion: ${project.title}. You can still edit the campaign details manually before inviting NGOs or offers.`)
    setTimeout(() => persistSnapshot({ selectedProjectSuggestionId: project.id }), 0)
  }

  return {
    projectSuggestions,
    setProjectSuggestions,
    isFetchingProjectSuggestions,
    handleSelectProjectSuggestion,
  }
}
