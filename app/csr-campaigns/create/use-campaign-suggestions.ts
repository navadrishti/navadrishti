import { readApiError } from '@/lib/user-facing-error'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { isPendingLeadInvite, leadInvitesFromRemote, type RemoteInviteState } from '@/app/companies/csr-agent/helpers'
import {
  getAcceptedLeadNgo,
  type LeadNgoInvite,
  type NgoDirectoryItem,
  type ProjectSuggestion,
  type ServiceSuggestion,
} from '@/app/companies/csr-agent/session'
import { splitLocation } from '@/lib/catalog-filters'
import { clientAuthFetchInit } from '@/lib/client-session'
import { authHeaders, toProjectIntake, type ManualCampaignForm } from './helpers'

type UseCampaignSuggestionsOptions = {
  form: ManualCampaignForm
  token: string | null
  userId: number | undefined
  draftCampaignId: string | null
  setDraftCampaignId: (id: string) => void
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
}

function readString(value: unknown) {
  return value == null ? '' : String(value)
}

function mapProjectRow(row: unknown): ProjectSuggestion | null {
  const data = asRecord(row)
  const id = readString(data.id).trim()
  if (!id) return null
  const location = readString(data.location_summary || data.location || data.ngo_location)
  const parts = splitLocation(location)
  const budget = Number(data.budget_inr)
  return {
    id,
    title: readString(data.title).trim() || 'Untitled project',
    description: readString(data.description),
    location,
    timeline: data.timeline ? readString(data.timeline) : undefined,
    expected_beneficiaries:
      data.expected_beneficiaries == null || data.expected_beneficiaries === ''
        ? null
        : Number(data.expected_beneficiaries),
    valid_until: data.valid_until ? readString(data.valid_until) : null,
    category: data.category ? readString(data.category) : null,
    ngo_name: data.ngo_name ? readString(data.ngo_name) : null,
    city: parts.city,
    state: parts.state,
    budget_inr: Number.isFinite(budget) && budget > 0 ? budget : null,
  }
}

function mapOfferRow(row: unknown): ServiceSuggestion | null {
  const data = asRecord(row)
  const id = Number(data.id)
  if (!Number.isFinite(id) || id <= 0) return null
  const impactArea = Array.isArray(data.impact_area) ? data.impact_area.map((item) => String(item)) : []
  return {
    capability_id: id,
    capability_name: readString(data.title).trim() || 'Capability offer',
    similarity: 0,
    service_offer_id: id,
    offer_type: readString(data.offer_type),
    transaction_type: readString(data.transaction_type),
    impact_area: impactArea,
    city: readString(data.city || data.location || data.coverage_area || data.location_scope),
    state_province: readString(data.state_province),
    price_amount: Number(data.price_amount ?? data.amount ?? 0) || 0,
    price_type: readString(data.price_type),
    score: 0,
  }
}

function mapNgoRow(row: unknown): NgoDirectoryItem | null {
  const data = asRecord(row)
  const id = Number(data.id)
  if (!Number.isFinite(id) || id <= 0) return null
  const status = readString(data.verification_status)
  return {
    id,
    name: readString(data.name).trim() || 'NGO',
    email: readString(data.email),
    score: 0,
    verification_status: status || null,
    verified: status.toLowerCase() === 'verified',
    city: readString(data.city),
    state: readString(data.state),
    focus_areas: readString(data.focus_areas),
  }
}

export function useCampaignSuggestions({
  form,
  token,
  userId,
  draftCampaignId,
  setDraftCampaignId,
}: UseCampaignSuggestionsOptions) {
  const [projectSuggestions, setProjectSuggestions] = useState<ProjectSuggestion[]>([])
  const [loadingProjects, setLoadingProjects] = useState(true)
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null)

  const [serviceSuggestions, setServiceSuggestions] = useState<ServiceSuggestion[]>([])
  const [loadingServices, setLoadingServices] = useState(true)
  const [serviceError, setServiceError] = useState<string | null>(null)

  const [ngoDirectory, setNgoDirectory] = useState<NgoDirectoryItem[]>([])
  const [loadingNgos, setLoadingNgos] = useState(true)
  const [leadNgoInvites, setLeadNgoInvites] = useState<LeadNgoInvite[]>([])
  const [inviteError, setInviteError] = useState('')

  const intake = useMemo(() => toProjectIntake(form), [form])
  const acceptedLead = useMemo(() => getAcceptedLeadNgo(leadNgoInvites), [leadNgoInvites])
  const hasLockedLeadNgo = Boolean(acceptedLead)

  const applyRemoteInviteState = (data: RemoteInviteState) => {
    if (data.draftCampaignId) setDraftCampaignId(String(data.draftCampaignId))
    const nextInvites = leadInvitesFromRemote(data)
    setLeadNgoInvites((prev) =>
      JSON.stringify(prev) === JSON.stringify(nextInvites) ? prev : nextInvites
    )
  }

  useEffect(() => {
    let cancelled = false
    setLoadingProjects(true)
    void fetch('/api/service-request-projects?includeEmpty=true', clientAuthFetchInit())
      .then(async (response) => {
        const payload = await response.json().catch(() => null)
        if (!response.ok || !payload?.success) {
          throw new Error(readApiError(payload, 'Failed to load NGO projects'))
        }
        return Array.isArray(payload.data) ? (payload.data as unknown[]) : []
      })
      .then((rows) => {
        if (!cancelled) setProjectSuggestions(rows.map(mapProjectRow).filter((row): row is ProjectSuggestion => Boolean(row)))
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
  }, [])

  useEffect(() => {
    let cancelled = false
    setLoadingServices(true)
    setServiceError(null)
    void fetch('/api/service-offers?view=all', clientAuthFetchInit())
      .then(async (response) => {
        const payload = await response.json().catch(() => null)
        if (!response.ok || !payload?.success) {
          throw new Error(readApiError(payload, 'Failed to load capability offers'))
        }
        return Array.isArray(payload.data) ? (payload.data as unknown[]) : []
      })
      .then((rows) => {
        if (!cancelled) setServiceSuggestions(rows.map(mapOfferRow).filter((row): row is ServiceSuggestion => Boolean(row)))
      })
      .catch((error) => {
        if (!cancelled) {
          setServiceError(readApiError(error, 'Failed to load capability offers'))
          setServiceSuggestions([])
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingServices(false)
      })

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!token || !userId) {
      setLoadingNgos(false)
      setNgoDirectory([])
      return
    }

    let cancelled = false
    setLoadingNgos(true)
    void fetch(
      '/api/ngos/list?limit=250',
      clientAuthFetchInit({ headers: authHeaders(token) }),
    )
      .then(async (response) => {
        const payload = await response.json().catch(() => null)
        if (!response.ok || !payload?.success) {
          throw new Error(readApiError(payload, 'Failed to load NGOs'))
        }
        return Array.isArray(payload.data) ? (payload.data as unknown[]) : []
      })
      .then((rows) => {
        if (!cancelled) setNgoDirectory(rows.map(mapNgoRow).filter((row): row is NgoDirectoryItem => Boolean(row)))
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
  }, [token, userId])

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
