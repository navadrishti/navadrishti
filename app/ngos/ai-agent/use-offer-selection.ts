import { useEffect, useState, type Dispatch, type SetStateAction } from "react"
import { AGENT_NAMES } from "@/lib/ai-agent-sessions"
import {
  type Message,
  type OfferRecommendation,
  type RelatedOfferEntry,
  type ServiceRequestDraftPayload,
  getExpectedOfferType,
  toRelatedOfferEntries,
} from "./intake"

type SetMessages = Dispatch<SetStateAction<Message[]>>

/** Recommended offers per need index and which of them the NGO has chosen to invite. */
export function useOfferSelection(setMessages: SetMessages) {
  const [offersLoading, setOffersLoading] = useState(false)
  const [relatedOffersByNeed, setRelatedOffersByNeed] = useState<Record<number, RelatedOfferEntry[]>>({})
  const [selectedOfferIdsByNeed, setSelectedOfferIdsByNeed] = useState<Record<number, number[]>>({})
  const [lastCompletedNeedIndex, setLastCompletedNeedIndex] = useState<number | null>(null)

  // Fulfillment is recorded when the offer owner accepts the application, not on invite.
  const toggleInviteOfferForNeed = (needIndex: number, offerId: number) => {
    setSelectedOfferIdsByNeed((prev) => {
      const selected = prev[needIndex] || []
      const nextSel = selected.includes(offerId)
        ? selected.filter((id) => id !== offerId)
        : [...selected, offerId]

      return {
        ...prev,
        [needIndex]: nextSel
      }
    })
  }

  const applyOfferFromChat = async (offerId: number, needIndex: number) => {
    setSelectedOfferIdsByNeed((prev) => ({
      ...prev,
      [needIndex]: Array.from(new Set([...(prev[needIndex] || []), offerId]))
    }))

    setMessages((prev) => [...prev, { role: 'assistant', content: `Application queued for offer ${offerId} on Need ${needIndex + 1}. It will be sent when the draft is published.` }])
  }

  const inviteAllOffersForNeed = (needIndex: number) => {
    const allIds = (relatedOffersByNeed[needIndex] || []).map((entry) => entry.offer.id)
    setSelectedOfferIdsByNeed((prev) => ({
      ...prev,
      [needIndex]: allIds
    }))
  }

  const clearInvitesForNeed = (needIndex: number) => {
    setSelectedOfferIdsByNeed((prev) => ({
      ...prev,
      [needIndex]: []
    }))
  }

  return {
    offersLoading,
    setOffersLoading,
    relatedOffersByNeed,
    setRelatedOffersByNeed,
    selectedOfferIdsByNeed,
    setSelectedOfferIdsByNeed,
    lastCompletedNeedIndex,
    setLastCompletedNeedIndex,
    toggleInviteOfferForNeed,
    applyOfferFromChat,
    inviteAllOffersForNeed,
    clearInvitesForNeed,
  }
}

export type OfferSelection = ReturnType<typeof useOfferSelection>

/**
 * Refreshes recommendations whenever the draft changes. Must be called after the
 * session-restore effects so a restored selection is filtered rather than wiped.
 */
export function useRelatedOffersLoader(
  generatedDraft: ServiceRequestDraftPayload | null,
  { setOffersLoading, setRelatedOffersByNeed, setSelectedOfferIdsByNeed }: OfferSelection,
  setMessages: SetMessages
) {
  useEffect(() => {
    const loadRelatedOffers = async () => {
      if (!generatedDraft) {
        setRelatedOffersByNeed({})
        setSelectedOfferIdsByNeed({})
        return
      }

      setOffersLoading(true)
      try {
        const nextRelated: Record<number, RelatedOfferEntry[]> = {}

        await Promise.all(generatedDraft.needs.map(async (need, index) => {
          const response = await fetch('/api/service-requests/recommend', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              request_type: need.request_type,
              title: need.title,
              description: need.description,
              material_items: need.material_items,
              skill_role: need.skill_role,
              infrastructure_scope: need.infrastructure_scope,
              target_quantity: need.beneficiary_count,
              beneficiary_count: need.beneficiary_count,
              estimated_budget: need.estimated_budget,
              budget: need.budget,
              limit: 8
            })
          })

          const result = await response.json().catch(() => ({}))
          const recs: OfferRecommendation[] = response.ok && result?.success && Array.isArray(result?.data?.recommendations)
            ? result.data.recommendations
            : []

          nextRelated[index] = toRelatedOfferEntries(recs, getExpectedOfferType(need.request_type) || undefined)
        }))

        setRelatedOffersByNeed(nextRelated)

        setSelectedOfferIdsByNeed((prev) => {
          const next: Record<number, number[]> = {}
          Object.entries(nextRelated).forEach(([indexKey, related]) => {
            const index = Number(indexKey)
            const validIds = new Set(related.map((item) => item.offer.id))
            const existing = (prev[index] || []).filter((id) => validIds.has(id))
            next[index] = existing.length > 0 ? existing : (related[0] ? [related[0].offer.id] : [])
          })
          return next
        })

        setMessages((prev) => {
          const alreadyAnnounced = prev.some((m) => m.role === 'assistant' && m.content.includes('Step 4 complete'))
          if (alreadyAnnounced) return prev
          return [...prev, { role: 'assistant', content: `Step 4 complete: ${AGENT_NAMES.pulse} recommended the best available service offers for each need. You can review and adjust invited offers before publishing.` }]
        })
      } catch {
        setRelatedOffersByNeed({})
      } finally {
        setOffersLoading(false)
      }
    }

    void loadRelatedOffers()
  }, [generatedDraft, setOffersLoading, setRelatedOffersByNeed, setSelectedOfferIdsByNeed, setMessages])
}
