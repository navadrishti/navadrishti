import { useEffect, useMemo, useRef, useState } from "react"
import { fetchScoredNgoDirectory } from "./api"
import { type RemoteInviteState, acceptedLeadNgoFromRemote, mergeRemoteLeadInvites } from "./helpers"
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

  useEffect(() => {
    if (!mounted || !userId || !token) return
    if (hasLockedLeadNgo) return
    if (!projectData.campaignName?.trim() || !projectData.category?.trim() || !projectData.endDate?.trim()) {
      setNgoDirectory([])
      lastNgoSuggestionKeyRef.current = null
      return
    }

    if (lastNgoSuggestionKeyRef.current === ngoSuggestionKey && ngoDirectory.length > 0) return

    let cancelled = false
    const loadNgoDirectory = async () => {
      setIsFetchingNgoDirectory(true)
      try {
        const mapped = await fetchScoredNgoDirectory(token, projectData)
        if (!cancelled) {
          setNgoDirectory(mapped)
          lastNgoSuggestionKeyRef.current = ngoSuggestionKey
        }
      } catch (e) {
        console.error('Failed to load scored NGO directory', e)
        if (!cancelled) setNgoDirectory([])
      } finally {
        if (!cancelled) setIsFetchingNgoDirectory(false)
      }
    }

    void loadNgoDirectory()
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
    setLeadNgoInvites((current) => mergeRemoteLeadInvites(current, data))
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
      setTimeout(() => {
        persistSnapshot({
          leadNgoInvites: normalizeLeadNgoInvites(
            (Array.isArray(payload.data?.invites) ? payload.data.invites : []).map((row: { ngo_id: number; name: string; email: string; status: string }) => ({
              ngoId: row.ngo_id,
              name: row.name,
              email: row.email,
              status: row.status,
            })),
          ),
        })
      }, 0)
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

    const alreadyInvited = leadNgoInvites.some((item) => item.ngoId === ngo.id)

    try {
      const response = await fetch('/api/csr-agent/lead-ngo-invites', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          sessionId: activeSessionId,
          draftCampaignId,
          action: alreadyInvited ? 'revoke' : 'invite',
          ngoId: ngo.id,
          ngoName: ngo.name,
          ngoEmail: ngo.email,
          projectData,
          volunteerRequirement: projectData.volunteerRequirement || '',
        }),
      })

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

  useEffect(() => {
    if (!mounted || !userId || !token) return
    if (hasLockedLeadNgo) return
    if (!draftCampaignId && leadNgoInvites.length === 0) return

    void syncLeadInviteStatuses()
    const interval = setInterval(() => {
      void syncLeadInviteStatuses()
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
  }
}
