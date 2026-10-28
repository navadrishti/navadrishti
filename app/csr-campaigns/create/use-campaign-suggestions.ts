import { readApiError } from '@/lib/user-facing-error'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  fetchRankedProjectSuggestions,
  fetchScoredNgoDirectory,
  requestServiceRecommendations,
} from '@/app/companies/csr-agent/api'
import { acceptedLeadNgoFromRemote, isPendingLeadInvite, leadInvitesFromRemote, type RemoteInviteState } from '@/app/companies/csr-agent/helpers'
import {
  getAcceptedLeadNgo,
  parseMoneyValue,
  type LeadNgoInvite,
  type NgoDirectoryItem,
  type ProjectSuggestion,
  type ServiceSuggestion,
} from '@/app/companies/csr-agent/session'
import { authHeaders, toProjectIntake, type ManualCampaignForm } from './helpers'

type UseCampaignSuggestionsOptions = {
  form: ManualCampaignForm
  token: string | null
  userId: number | undefined
  draftCampaignId: string | null
  setDraftCampaignId: (id: string) => void
}

export function useCampaignSuggestions({
  form,
  token,
  userId,
  draftCampaignId,
  setDraftCampaignId,
}: UseCampaignSuggestionsOptions) {
  const [projectSuggestions, setProjectSuggestions] = useState<ProjectSuggestion[]>([])
  const [loadingProjects, setLoadingProjects] = useState(false)
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null)

  const [serviceSuggestions, setServiceSuggestions] = useState<ServiceSuggestion[]>([])
  const [loadingServices, setLoadingServices] = useState(false)
  const [serviceError, setServiceError] = useState<string | null>(null)

  const [ngoDirectory, setNgoDirectory] = useState<NgoDirectoryItem[]>([])
  const [loadingNgos, setLoadingNgos] = useState(false)
  const [leadNgoInvites, setLeadNgoInvites] = useState<LeadNgoInvite[]>([])
  const [inviteError, setInviteError] = useState('')
  const lastServiceKeyRef = useRef<string | null>(null)

  const intake = useMemo(() => toProjectIntake(form), [form])
  const acceptedLead = useMemo(() => getAcceptedLeadNgo(leadNgoInvites), [leadNgoInvites])
  const hasLockedLeadNgo = Boolean(acceptedLead)

  const applyRemoteInviteState = (data: RemoteInviteState) => {
    if (data.draftCampaignId) setDraftCampaignId(String(data.draftCampaignId))
    setLeadNgoInvites(leadInvitesFromRemote(data))
    if (acceptedLeadNgoFromRemote(data)) {
      setLeadNgoInvites(leadInvitesFromRemote(data))
    }
  }

  useEffect(() => {
    const title = intake.campaignName
    const category = intake.category
    if (!title || !category) {
      setProjectSuggestions([])
      return
    }

    let cancelled = false
    setLoadingProjects(true)
    void fetchRankedProjectSuggestions({
      campaignName: title,
      category,
      city: intake.city,
      state: intake.state,
    })
      .then((ranked) => {
        if (!cancelled) setProjectSuggestions(ranked.slice(0, 4))
      })
      .catch(() => {
        if (!cancelled) setProjectSuggestions([])
      })
      .finally(() => {
        if (!cancelled) setLoadingProjects(false)
      })

    return () => {
      cancelled = true
    }
  }, [intake.campaignName, intake.category, intake.city, intake.state])

  const serviceKey = useMemo(
    () =>
      JSON.stringify({
        category: intake.category,
        city: intake.city,
        state: intake.state,
        budget: intake.budget,
        startDate: intake.startDate,
        endDate: intake.endDate,
        campaignName: intake.campaignName,
      }),
    [intake],
  )

  useEffect(() => {
    if (!userId) return
    if (!intake.category || !intake.city || !intake.state || !intake.budget || !intake.startDate || !intake.endDate) return
    if (!parseMoneyValue(intake.budget || '')) return
    if (lastServiceKeyRef.current === serviceKey) return

    let cancelled = false
    setLoadingServices(true)
    setServiceError(null)
    lastServiceKeyRef.current = serviceKey
    void requestServiceRecommendations(intake, parseMoneyValue(intake.budget || '') || 0)
      .then((result) => {
        if (cancelled) return
        if ('error' in result) {
          setServiceError(result.error)
          setServiceSuggestions([])
          return
        }
        setServiceSuggestions(result.suggestions)
      })
      .catch((error) => {
        if (!cancelled) {
          setServiceError(readApiError(error, 'Failed to fetch recommendations'))
          setServiceSuggestions([])
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingServices(false)
      })

    return () => {
      cancelled = true
    }
  }, [userId, serviceKey, intake])

  useEffect(() => {
    if (!token || !userId || hasLockedLeadNgo) return
    if (!intake.campaignName || !intake.category || !intake.endDate) {
      setNgoDirectory([])
      return
    }

    let cancelled = false
    setLoadingNgos(true)
    void fetchScoredNgoDirectory(token, intake)
      .then((rows) => {
        if (!cancelled) setNgoDirectory(rows)
      })
      .catch(() => {
        if (!cancelled) setNgoDirectory([])
      })
      .finally(() => {
        if (!cancelled) setLoadingNgos(false)
      })

    return () => {
      cancelled = true
    }
  }, [token, userId, hasLockedLeadNgo, intake.campaignName, intake.category, intake.city, intake.state, intake.volunteerRequirement, intake.endDate])

  const syncLeadInvites = useCallback(async (campaignId = draftCampaignId) => {
    if (!token || !campaignId) return null
    const response = await fetch(`/api/csr-agent/lead-ngo-invites?draftCampaignId=${encodeURIComponent(campaignId)}`, {
      headers: authHeaders(token),
    })
    const payload = await response.json().catch(() => null)
    if (!response.ok || !payload?.success) return null
    applyRemoteInviteState(payload.data || {})
    return payload.data
  }, [draftCampaignId, token, setDraftCampaignId])

  useEffect(() => {
    if (!token || !draftCampaignId || hasLockedLeadNgo) return
    void syncLeadInvites(draftCampaignId)
    const interval = window.setInterval(() => {
      void syncLeadInvites(draftCampaignId)
    }, 5000)
    return () => window.clearInterval(interval)
  }, [token, draftCampaignId, hasLockedLeadNgo, syncLeadInvites])

  const toggleLeadInvite = async (ngo: NgoDirectoryItem, campaignId: string | null) => {
    if (hasLockedLeadNgo) return { error: 'A lead NGO has already accepted for this campaign.' }
    if (!token) return { error: 'Please sign in again.' }
    if (!campaignId) return { error: 'Save the campaign draft before inviting a lead NGO.' }

    const alreadyInvited = leadNgoInvites.some((item) => item.ngoId === ngo.id && isPendingLeadInvite(item))
    setInviteError('')
    try {
      const response = await fetch('/api/csr-agent/lead-ngo-invites', {
        method: 'POST',
        headers: authHeaders(token),
        body: JSON.stringify({
          draftCampaignId: campaignId,
          action: alreadyInvited ? 'revoke' : 'invite',
          ngoId: ngo.id,
          ngoName: ngo.name,
          ngoEmail: ngo.email,
          projectData: intake,
          volunteerRequirement: intake.volunteerRequirement || '',
        }),
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok || !payload?.success) {
        const message = readApiError(payload, 'Failed to update lead NGO invite')
        setInviteError(message)
        return { error: message }
      }
      applyRemoteInviteState(payload.data || {})
      return { invited: !alreadyInvited }
    } catch {
      const message = 'Failed to update lead NGO invite'
      setInviteError(message)
      return { error: message }
    }
  }

  return {
    projectSuggestions,
    loadingProjects,
    selectedProjectId,
    setSelectedProjectId,
    serviceSuggestions,
    loadingServices,
    serviceError,
    ngoDirectory,
    loadingNgos,
    leadNgoInvites,
    acceptedLead,
    hasLockedLeadNgo,
    inviteError,
    toggleLeadInvite,
    syncLeadInvites,
  }
}
