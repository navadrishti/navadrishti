import { useEffect, useMemo, useRef, useState } from "react"
import { toUserFacingError } from "@/lib/user-facing-error"
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

    const start = Date.parse(String(payload.startDate || ''))
    const end = Date.parse(String(payload.endDate || ''))
    if (Number.isFinite(start) && Number.isFinite(end) && end < start) {
      setRecommendationError('The campaign end date needs to be after the start date.')
      return []
    }

    setIsFetchingRecommendations(true)
    setRecommendationError(null)

    try {
      const result = await requestServiceRecommendations(payload, numericBudget)
      if ('error' in result) {
        setRecommendationError(toUserFacingError(result.error))
        return []
      }

      setServiceSuggestions(result.suggestions)
      return result.suggestions
    } catch (error) {
      setRecommendationError(toUserFacingError(error instanceof Error ? error.message : "Could not find matching offers right now."))
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
