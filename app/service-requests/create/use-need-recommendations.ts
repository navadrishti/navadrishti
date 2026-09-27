import { useEffect, useState } from 'react'
import { mapServerToNeedRecommendation } from './recommendations'
import type { NeedDraft, NeedRecommendation, ServiceOfferLite } from './types'

const INACTIVE_OFFER_STATUSES = ['inactive', 'closed', 'completed', 'cancelled', 'archived', 'rejected', 'expired']

export function useNeedRecommendations(needs: NeedDraft[]) {
  const [serviceOffers, setServiceOffers] = useState<ServiceOfferLite[]>([])
  const [offersLoading, setOffersLoading] = useState(false)
  const [serverRecommendations, setServerRecommendations] = useState<Record<number, NeedRecommendation[]>>({})
  const [recPageByNeed, setRecPageByNeed] = useState<Record<number, number>>({})

  useEffect(() => {
    const loadOffers = async () => {
      setOffersLoading(true)
      try {
        const response = await fetch('/api/service-offers?view=all')
        const data = await response.json()
        if (response.ok && data.success) {
          const activeOffers = (Array.isArray(data.data) ? data.data : []).filter((offer: ServiceOfferLite) => {
            const status = String(offer.status || 'active').toLowerCase()
            return !INACTIVE_OFFER_STATUSES.includes(status)
          })
          setServiceOffers(activeOffers)
        } else {
          setServiceOffers([])
        }
      } catch {
        setServiceOffers([])
      } finally {
        setOffersLoading(false)
      }
    }

    loadOffers()
  }, [])

  const needsKey = needs
    .map((n) => `${n.request_type}|${n.title}|${n.description}|${n.material_items}|${n.skill_role}|${n.infrastructure_scope}|${n.target_amount}|${n.target_quantity}|${n.beneficiary_count}|${n.estimated_budget}|${n.budget}`)
    .join('||')
  const pagesKey = JSON.stringify(recPageByNeed)

  useEffect(() => {
    const fetchRecs = async (index: number, need: NeedDraft, page = 0) => {
      try {
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
            target_amount: need.target_amount,
            target_quantity: need.target_quantity,
            beneficiary_count: need.beneficiary_count,
            estimated_budget: need.estimated_budget,
            budget: need.budget,
            offset: page * 2,
            limit: 6
          })
        })

        if (!response.ok) return
        const result = await response.json()
        if (!result?.success || !result?.data) return

        const recs = Array.isArray(result.data.recommendations) ? result.data.recommendations.map(mapServerToNeedRecommendation) : []
        setServerRecommendations((prev) => ({ ...prev, [index]: recs }))
      } catch {
        // keep the client-side fallback recommendations
      }
    }

    needs.forEach((need, index) => {
      void fetchRecs(index, need, recPageByNeed[index] || 0)
    })
  }, [needsKey, pagesKey])

  const refreshNeedRecommendations = (index: number) => {
    setRecPageByNeed((prev) => ({ ...prev, [index]: (prev[index] || 0) + 1 }))
  }

  return { serviceOffers, offersLoading, serverRecommendations, refreshNeedRecommendations }
}
