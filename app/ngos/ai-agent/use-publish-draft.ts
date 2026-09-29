import { useRef } from "react"
import { useRouter } from "next/navigation"
import type { User } from "@/lib/auth-context"
import { getErrorMessage } from "@/lib/utils"
import type { NGOAIAgentSession, RelatedOfferEntry, ServiceRequestDraftPayload } from "./intake"
import { buildNeedPublishBody, buildProjectPublishBody } from "./drafts"
import type { IntakeState } from "./use-intake-state"

const REDIRECT_DELAY_MS = 1500

type PublishDraftOptions = {
  intake: IntakeState
  selectedOfferIdsByNeed: Record<number, number[]>
  relatedOffersByNeed: Record<number, RelatedOfferEntry[]>
  user: User | null
  token: string | null
  normalizeSessionFromState: () => NGOAIAgentSession | null
  sessions: NGOAIAgentSession[]
  persistSessions: (sessions: NGOAIAgentSession[], activeSessionId?: string) => void
}

/** Publishes the draft as a standalone need or a CSR project, then redirects to it. */
export function usePublishDraft({
  intake,
  selectedOfferIdsByNeed,
  relatedOffersByNeed,
  user,
  token,
  normalizeSessionFromState,
  sessions,
  persistSessions,
}: PublishDraftOptions) {
  const router = useRouter()
  const publishingRef = useRef(false)
  const { generatedDraft, publishingDraft, setPublishingDraft, setMessages, intakePath, projectData, setPublishedProjectId } = intake

  const appendAssistant = (content: string) => {
    setMessages(prev => [...prev, { role: 'assistant', content }])
  }

  const publishNeed = async (draft: ServiceRequestDraftPayload, token: string) => {
    if (draft.needs.length === 0) {
      throw new Error('No need data to publish')
    }

    const response = await fetch('/api/service-requests', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify(buildNeedPublishBody(draft.needs[0], draft.project.location))
    })

    const needData = await response.json()
    if (!response.ok || !needData?.success || !needData?.data?.id) {
      throw new Error(needData?.error || 'Failed to create standalone need.')
    }

    const needId = Number(needData.data.id)

    const offerTitle = (offerId: number) =>
      (relatedOffersByNeed[0] || []).find((entry) => entry.offer.id === offerId)?.offer.title || `Offer #${offerId}`

    // An application failing must not undo the published need, so failures are reported instead of thrown.
    const failures = await Promise.all((selectedOfferIdsByNeed[0] || []).map(async (offerId) => {
      try {
        const response = await fetch(`/api/service-offers/${offerId}/clients`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            client_type: user?.user_type,
            selected_need_ids: [needId],
            message: `Applying for need: ${draft.needs[0].title}`
          })
        })
        if (response.ok) return null
        const body = await response.json().catch(() => ({}))
        return `${offerTitle(offerId)}: ${body?.message || body?.error || 'the application was not accepted'}`
      } catch {
        return `${offerTitle(offerId)}: network error`
      }
    }))
    const appliedCount = failures.filter((failure) => failure === null).length
    const failed = failures.filter((failure): failure is string => failure !== null)

    const summary = [`Published successfully! Your standalone need is now live.`]
    if (appliedCount > 0) {
      summary.push(`Applied to ${appliedCount} offer${appliedCount === 1 ? '' : 's'}. The offer owners can accept from their applicants list.`)
    }
    if (failed.length > 0) {
      summary.push(`These applications could not be sent. You can apply again from the offer page:\n${failed.map((line) => `- ${line}`).join('\n')}`)
    }
    appendAssistant(summary.join('\n\n'))

    setTimeout(() => {
      router.push(`/service-requests/${needId}`)
    }, REDIRECT_DELAY_MS)
  }

  const publishProject = async (draft: ServiceRequestDraftPayload, token: string) => {
    const projectResponse = await fetch('/api/service-request-projects', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify(buildProjectPublishBody(draft, projectData, user?.email))
    })

    const projectResponseData = await projectResponse.json()
    if (!projectResponse.ok || !projectResponseData?.success || !projectResponseData?.data?.id) {
      throw new Error(projectResponseData?.error || 'Failed to create project.')
    }

    const projectId = String(projectResponseData.data.id)
    setPublishedProjectId(projectId)

    const currentSession = normalizeSessionFromState()
    if (currentSession) {
      const withPublished = { ...currentSession, publishedProjectId: projectId, updatedAt: new Date().toISOString() }
      const nextSessions = sessions.map((session) => (session.id === withPublished.id ? withPublished : session))
      persistSessions(nextSessions, withPublished.id)
    }

    appendAssistant(`Published successfully! Your CSR Project is now live.`)

    setTimeout(() => {
      router.push(`/service-requests/projects/${projectId}`)
    }, REDIRECT_DELAY_MS)
  }

  const publishDraft = async (draftToPublish?: ServiceRequestDraftPayload | null) => {
    const draft = draftToPublish || generatedDraft
    if (!draft || publishingDraft || publishingRef.current) return

    if (!token) {
      appendAssistant('Please log in again. I could not find your auth session token.')
      return
    }

    publishingRef.current = true
    setPublishingDraft(true)
    try {
      if (intakePath === 'need') {
        await publishNeed(draft, token)
      } else if (intakePath === 'project') {
        await publishProject(draft, token)
      } else {
        throw new Error('Unknown intake path')
      }
      // Stay locked until the redirect so a second click cannot publish a duplicate.
    } catch (error) {
      appendAssistant(`Publishing failed: ${getErrorMessage(error) || 'Unknown error'}`)
      publishingRef.current = false
      setPublishingDraft(false)
    }
  }

  return { publishDraft }
}
