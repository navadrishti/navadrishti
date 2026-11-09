import { useEffect, useState } from 'react'
import type { ServiceOfferLite } from './types'

const INACTIVE_OFFER_STATUSES = ['inactive', 'closed', 'completed', 'cancelled', 'archived', 'rejected', 'expired']

export function useNeedRecommendations() {
  const [serviceOffers, setServiceOffers] = useState<ServiceOfferLite[]>([])
  const [offersLoading, setOffersLoading] = useState(true)

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

    void loadOffers()
  }, [])

  return { serviceOffers, offersLoading }
}
