import { useEffect, useMemo, useRef, useState } from "react"
import { requestServiceRecommendations } from "./api"
import { type ProjectIntakeData, type ServiceSuggestion, parseMoneyValue } from "./session"

type ServiceRecommendationsOptions = {
  mounted: boolean
  userId: number | undefined
  projectData: ProjectIntakeData
}

export function useServiceRecommendations({ mounted, userId, projectData }: ServiceRecommendationsOptions) {
  const [serviceSuggestions, setServiceSuggestions] = useState<ServiceSuggestion[]>([])
  const [recommendationError, setRecommendationError] = useState<string | null>(null)
  const [isFetchingRecommendations, setIsFetchingRecommendations] = useState(false)
  const lastRecommendationKeyRef = useRef<string | null>(null)

  const recommendationKey = useMemo(
    () =>
      JSON.stringify({
        category: projectData.category,
        city: projectData.city,
        state: projectData.state,
        budget: projectData.budget,
        startDate: projectData.startDate,
        endDate: projectData.endDate,
        campaignName: projectData.campaignName,
      }),
    [
      projectData.category,
      projectData.city,
      projectData.state,
      projectData.budget,
      projectData.startDate,
      projectData.endDate,
      projectData.campaignName,
    ],
  )

  const hasRequiredProjectFields = useMemo(() => {
    return Boolean(projectData.category && projectData.city && projectData.state && projectData.budget && projectData.startDate && projectData.endDate)
  }, [projectData])

  const loadRecommendations = async (payload: ProjectIntakeData): Promise<ServiceSuggestion[]> => {
    if (!payload.category || !payload.city || !payload.state || !payload.budget || !payload.startDate || !payload.endDate) {
      return []
    }

    const numericBudget = parseMoneyValue(payload.budget)
    if (!numericBudget) return []

    setIsFetchingRecommendations(true)
    setRecommendationError(null)

    try {
      const result = await requestServiceRecommendations(payload, numericBudget)
      if ('error' in result) {
        setRecommendationError(result.error)
        return []
      }

      setServiceSuggestions(result.suggestions)
      return result.suggestions
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to fetch recommendations"
      setRecommendationError(message)
      return []
    } finally {
      setIsFetchingRecommendations(false)
    }
  }

  useEffect(() => {
    if (!mounted || !userId) return
    if (!hasRequiredProjectFields) return
    if (isFetchingRecommendations) return
    if (lastRecommendationKeyRef.current === recommendationKey) return

    void loadRecommendations(projectData).finally(() => {
      lastRecommendationKeyRef.current = recommendationKey
    })
  }, [mounted, userId, hasRequiredProjectFields, isFetchingRecommendations, recommendationKey, projectData])

  return {
    serviceSuggestions,
    setServiceSuggestions,
    recommendationError,
    setRecommendationError,
    isFetchingRecommendations,
    loadRecommendations,
  }
}
