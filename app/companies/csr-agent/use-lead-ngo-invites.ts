import { useEffect, useEffectEvent, useMemo, useRef, useState } from "react"
import { fetchScoredNgoDirectory } from "./api"
import { type RemoteInviteState, acceptedLeadNgoFromRemote, isPendingLeadInvite, leadInvitesFromRemote } from "./helpers"
import {
  type CSRAgentSession,
  type LeadNgoInvite,
  type NgoDirectoryItem,
  type ProjectIntakeData,
  getAcceptedLeadNgo,
  normalizeLeadNgoInvites,
} from "./session"

type LeadNgoInvitesOptions = {
  mounted: boolean
  userId: number | undefined
  token: string | null
  projectData: ProjectIntakeData
  activeSessionId: string
  draftCampaignId: string | null
  setDraftCampaignId: (draftCampaignId: string) => void
  actionsEnabled: boolean
  appendAssistantMessage: (content: string) => void
  persistSnapshot: (overrides: Partial<CSRAgentSession>) => void
  onLeadInvited: () => void
}

export function useLeadNgoInvites({
  mounted,
  userId,
  token,
  projectData,
  activeSessionId,
  draftCampaignId,
  setDraftCampaignId,
  actionsEnabled,
  appendAssistantMessage,
  persistSnapshot,
  onLeadInvited,
}: LeadNgoInvitesOptions) {
  const [ngoDirectory, setNgoDirectory] = useState<NgoDirectoryItem[]>([])
  const [isFetchingNgoDirectory, setIsFetchingNgoDirectory] = useState(false)
  const [leadNgoInvites, setLeadNgoInvites] = useState<LeadNgoInvite[]>([])
  const [confirmedLeadNgo, setConfirmedLeadNgo] = useState<LeadNgoInvite | null>(null)
  const lastNgoSuggestionKeyRef = useRef<string | null>(null)
  const ngoDirectoryRequestRef = useRef(0)

  const acceptedLeadNgo = useMemo(
    () => confirmedLeadNgo || getAcceptedLeadNgo(leadNgoInvites),
    [confirmedLeadNgo, leadNgoInvites],
  )
  const hasLockedLeadNgo = Boolean(acceptedLeadNgo)

  const ngoSuggestionKey = useMemo(
    () =>
      [
        projectData.campaignName,
        projectData.category,
        projectData.city,
        projectData.state,
        projectData.volunteerRequirement,
        projectData.endDate,
      ]
        .map((value) => String(value || "").trim())
        .join("|"),
    [
      projectData.campaignName,
      projectData.category,
      projectData.city,
      projectData.state,
      projectData.volunteerRequirement,
      projectData.endDate,
    ],
  )

  const refreshNgoDirectory = useEffectEvent(async (authToken: string, isCancelled: () => boolean) => {
    const requestId = ++ngoDirectoryRequestRef.current
    if (!projectData.campaignName?.trim() || !projectData.category?.trim() || !projectData.endDate?.trim()) {
      setNgoDirectory([])
      lastNgoSuggestionKeyRef.current = null
      setIsFetchingNgoDirectory(false)
      return
    }

    if (lastNgoSuggestionKeyRef.current === ngoSuggestionKey && ngoDirectory.length > 0) {
      setIsFetchingNgoDirectory(false)
      return
    }

    setIsFetchingNgoDirectory(true)
    try {
      const mapped = await fetchScoredNgoDirectory(authToken, projectData)
      if (!isCancelled()) {
        setNgoDirectory(mapped)
        lastNgoSuggestionKeyRef.current = ngoSuggestionKey
      }
    } catch (e) {
      console.error('Failed to load scored NGO directory', e)
      if (!isCancelled()) setNgoDirectory([])
    } finally {
      // A cancelled request still clears the spinner unless a newer request has taken over.
      if (requestId === ngoDirectoryRequestRef.current) setIsFetchingNgoDirectory(false)
    }
  })

  useEffect(() => {
    if (!mounted || !userId || !token) return
    if (hasLockedLeadNgo) return

    let cancelled = false
    void refreshNgoDirectory(token, () => cancelled)
    return () => {
      cancelled = true
    }
  }, [mounted, userId, token, ngoSuggestionKey, hasLockedLeadNgo])

  const restoreFromSession = (session: CSRAgentSession) => {
    setNgoDirectory(session.ngoDirectory || [])
    setLeadNgoInvites(normalizeLeadNgoInvites(session.leadNgoInvites))
    setConfirmedLeadNgo(getAcceptedLeadNgo(normalizeLeadNgoInvites(session.leadNgoInvites)))
  }

  const applyRemoteInviteState = (data: RemoteInviteState) => {
    if (data.draftCampaignId) {
      setDraftCampaignId(String(data.draftCampaignId))
    }

    const accepted = acceptedLeadNgoFromRemote(data)
    if (accepted) {
      setConfirmedLeadNgo(accepted)
    }
    setLeadNgoInvites(leadInvitesFromRemote(data))
  }

  const syncLeadInviteStatuses = async (overrides?: { draftCampaignId?: string | null; sessionId?: string | null }) => {
    if (!token) return null
    const resolvedDraftId = overrides?.draftCampaignId ?? draftCampaignId
    const resolvedSessionId = overrides?.sessionId ?? activeSessionId
    if (!resolvedDraftId && !resolvedSessionId) return null

    const params = new URLSearchParams()
    if (resolvedDraftId) params.set('draftCampaignId', resolvedDraftId)
    else if (resolvedSessionId) params.set('sessionId', resolvedSessionId)

    const response = await fetch(`/api/csr-agent/lead-ngo-invites?${params.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    const payload = await response.json().catch(() => null)
    if (!response.ok || !payload?.success) return null
    applyRemoteInviteState(payload.data || {})
    if (payload.data?.leadNgoAccepted) {
      setTimeout(() => persistSnapshot({ leadNgoInvites: leadInvitesFromRemote(payload.data) }), 0)
    }
    return payload.data
  }

  const handleInviteLeadNgoToggle = async (ngo: NgoDirectoryItem) => {
    if (hasLockedLeadNgo) {
      return
    }
    if (!actionsEnabled) {
      appendAssistantMessage('Please select an existing project or finish all campaign details before inviting lead NGOs.')
      return
    }
    if (!token || !activeSessionId) {
      appendAssistantMessage('Unable to send invites right now. Please sign in again.')
      return
    }

    const alreadyInvited = leadNgoInvites.some((item) => item.ngoId === ngo.id && isPendingLeadInvite(item))

    const postInviteAction = (targetDraftId: string | null) =>
      fetch('/api/csr-agent/lead-ngo-invites', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          sessionId: activeSessionId,
          draftCampaignId: targetDraftId,
          action: alreadyInvited ? 'revoke' : 'invite',
          ngoId: ngo.id,
          ngoName: ngo.name,
          ngoEmail: ngo.email,
          projectData,
          volunteerRequirement: projectData.volunteerRequirement || '',
        }),
      })

    try {
      let response = await postInviteAction(draftCampaignId)
      if (response.status === 404 && draftCampaignId) {
        response = await postInviteAction(null)
      }

      const payload = await response.json().catch(() => null)
      if (!response.ok || !payload?.success) {
        if (response.status === 409 || String(payload?.error || '').toLowerCase().includes('already accepted')) {
          await syncLeadInviteStatuses()
          return
        }
        throw new Error(payload?.error || 'Failed to update lead NGO invite')
      }

      applyRemoteInviteState(payload.data || {})
      if (payload.data?.draftCampaignId) {
        setTimeout(() => persistSnapshot({ draftCampaignId: String(payload.data.draftCampaignId) }), 0)
      }

      if (!alreadyInvited) {
        onLeadInvited()
      }

      appendAssistantMessage(
        alreadyInvited
          ? `Removed lead NGO invite for ${ngo.name}.`
          : `Invited ${ngo.name} as a lead NGO candidate. They can accept from their dashboard. You can publish once a lead NGO accepts and is assigned.`,
      )
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update lead NGO invite'
      appendAssistantMessage(message)
    }
  }

  const ensureDraftCampaign = async (): Promise<string | null> => {
    if (draftCampaignId) return draftCampaignId
    if (!token || !activeSessionId) return null

    const response = await fetch('/api/csr-agent/lead-ngo-invites', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        sessionId: activeSessionId,
        action: 'save_draft',
        projectData,
        volunteerRequirement: projectData.volunteerRequirement || '',
      }),
    })
    const payload = await response.json().catch(() => null)
    if (!response.ok || !payload?.success || !payload.data?.draftCampaignId) {
      throw new Error(payload?.error || 'Could not save the campaign draft')
    }

    applyRemoteInviteState(payload.data)
    const savedId = String(payload.data.draftCampaignId)
    setTimeout(() => persistSnapshot({ draftCampaignId: savedId }), 0)
    return savedId
  }

  const syncInviteStatuses = useEffectEvent(() => syncLeadInviteStatuses())

  useEffect(() => {
    if (!mounted || !userId || !token) return
    if (hasLockedLeadNgo) return
    if (!draftCampaignId && leadNgoInvites.length === 0) return

    void syncInviteStatuses()
    const interval = setInterval(() => {
      void syncInviteStatuses()
    }, 5000)

    return () => clearInterval(interval)
  }, [mounted, userId, token, draftCampaignId, leadNgoInvites.length, hasLockedLeadNgo])

  return {
    ngoDirectory,
    isFetchingNgoDirectory,
    leadNgoInvites,
    acceptedLeadNgo,
    hasLockedLeadNgo,
    restoreFromSession,
    syncLeadInviteStatuses,
    handleInviteLeadNgoToggle,
    ensureDraftCampaign,
  }
}
