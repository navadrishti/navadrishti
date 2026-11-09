import { toast } from 'sonner'
import { readApiError } from '@/lib/user-facing-error'
import { useEffect, useEffectEvent, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { isCaVerifiedAccount } from '@/lib/auth'
import { useAuth } from '@/lib/auth-context'
import { useNow } from '@/hooks/use-now'
import { getCapabilityNeedRequestTypes, isCapabilityRentalTransaction } from '@/lib/service-offers'
import { isNeedOpenForListing } from '@/lib/service-request-allocation'
import { openRazorpayCheckout } from '@/lib/razorpay-checkout'
import { sumNeedAmounts, toNgoNeedOption } from './helpers'
import type { ClientApplication, NgoNeedOption, ServiceOffer, ServiceRequestListItem } from './types'

export function useServiceOffer(offerId: string) {
  const router = useRouter()
  const { user, token, loading: authLoading } = useAuth()
  const [offer, setOffer] = useState<ServiceOffer | null>(null)
  const [userApplication, setUserApplication] = useState<ClientApplication | null>(null)
  const [loading, setLoading] = useState(true)
  const [applying, setApplying] = useState(false)
  const [paying, setPaying] = useState(false)
  const [selectedNeedIds, setSelectedNeedIds] = useState<number[]>([])
  const [ngoNeeds, setNgoNeeds] = useState<NgoNeedOption[]>([])
  const [loadingNgoNeeds, setLoadingNgoNeeds] = useState(false)

  const isAuthenticated = !!(user && token)
  const selectedNeedSummaries = useMemo(
    () => ngoNeeds.filter((need) => selectedNeedIds.includes(need.id)),
    [ngoNeeds, selectedNeedIds]
  )
  const selectedNeedTotal = useMemo(() => sumNeedAmounts(selectedNeedSummaries), [selectedNeedSummaries])
  const nowMs = useNow()
  const isOfferExpired = !!offer?.valid_until && new Date(String(offer.valid_until)).getTime() < nowMs

  const fetchOfferDetails = async () => {
    try {
      const response = await fetch(`/api/service-offers/${offerId}`, {
        cache: 'no-store',
        headers: token ? { Authorization: `Bearer ${token}` } : undefined
      })
      if (response.ok) {
        const data = await response.json()
        setOffer(data)
      } else {
        toast.error("Error", { description: "Failed to load service offer details" })
        router.push('/service-offers')
      }
    } catch (error) {
      console.error('Error fetching offer:', error)
      toast.error("Error", { description: "Failed to load service offer details" })
    } finally {
      setLoading(false)
    }
  }

  const checkExistingApplication = async () => {
    try {
      const response = await fetch(`/api/service-offers/${offerId}/clients?userId=${user?.id}`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      if (response.ok) {
        const data = await response.json()
        setUserApplication(data || null)
      }
    } catch (error) {
      console.error('Error checking application:', error)
    }
  }

  const fetchNgoNeeds = async () => {
    if (!user || user.user_type !== 'ngo' || !offer) {
      setNgoNeeds([])
      return
    }

    const allowedRequestTypes = getCapabilityNeedRequestTypes(offer.offer_type)

    try {
      setLoadingNgoNeeds(true)
      const response = await fetch('/api/service-requests?view=my-requests&limit=100', {
        headers: {
          Authorization: `Bearer ${token}`
        }
      })

      if (!response.ok) {
        setNgoNeeds([])
        return
      }

      const data = await response.json()
      const requests: ServiceRequestListItem[] = Array.isArray(data?.data) ? data.data : []
      setNgoNeeds(
        requests
          .filter((request) => isNeedOpenForListing(request))
          .filter((request) => {
            if (allowedRequestTypes.length === 0) return true
            return allowedRequestTypes.includes(String(request.request_type || ''))
          })
          .map(toNgoNeedOption)
      )
    } catch (error) {
      console.error('Error fetching NGO needs:', error)
      setNgoNeeds([])
    } finally {
      setLoadingNgoNeeds(false)
    }
  }

  const loadOffer = useEffectEvent(() => {
    fetchOfferDetails()
    if (isAuthenticated && user) {
      checkExistingApplication()
    }
  })

  useEffect(() => {
    if (offerId && !authLoading) loadOffer()
  }, [offerId, authLoading, isAuthenticated, user?.id])

  const loadNgoNeeds = useEffectEvent(() => {
    if (isAuthenticated && user?.user_type === 'ngo' && offer) {
      fetchNgoNeeds()
    }
  })

  useEffect(() => {
    loadNgoNeeds()
  }, [offer?.id, offer?.offer_type, isAuthenticated, user?.id, user?.user_type])

  const handleApply = async () => {
    if (!isAuthenticated || !user) {
      toast.error("Authentication Required", { description: "Please log in to apply for this service offer" })
      router.push('/login')
      return
    }

    if (offer && Number(user.id) === Number(offer.creator_id)) {
      toast.error("Not Allowed", { description: "You cannot apply to your own capability offer" })
      return
    }

    if (user.user_type !== 'ngo') {
      toast.error('NGO only', { description: 'Only NGOs can apply from this offer details page.' })
      return
    }

    if (isOfferExpired) {
      toast.error('Offer expired', { description: 'This capability offer has already expired.' })
      return
    }

    if (selectedNeedIds.length === 0) {
      toast.error('Select a need', { description: 'Please select one active need before submitting.' })
      return
    }

    const isRentalOffer = isCapabilityRentalTransaction(offer?.transaction_type)
    const offerAmount = Number(offer?.price_amount || 0)
    if (!isRentalOffer && Number.isFinite(offerAmount) && offerAmount > 0 && selectedNeedTotal > offerAmount) {
      toast.error('Selection exceeds offer value', { description: 'Please choose needs whose total value fits within the offer amount.' })
      return
    }

    setApplying(true)

    try {
      const response = await fetch(`/api/service-offers/${offerId}/clients`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          client_id: user.id,
          client_type: user.user_type,
          selected_need_ids: selectedNeedIds,
          message: `Applying for: ${selectedNeedSummaries.map((need) => need.title).join(', ')}`
        })
      })

      if (response.ok) {
        const newApplication = await response.json()
        setUserApplication(newApplication)
        setSelectedNeedIds([])
        toast.success("Application Submitted", { description: "Your request has been submitted for the selected needs." })
      } else {
        const error = await response.json()
        const errorMsg = readApiError(error, 'Failed to submit application')

        if (error.requiresVerification || response.status === 403) {
          const verificationMessage = typeof error.message === 'string' && error.message.trim()
            ? error.message
            : 'Please complete account verification before hiring services.'
          toast.error("Verification Required", { description: verificationMessage })
          setTimeout(() => {
            router.push('/verification')
          }, 3000)
        } else {
          toast.error("Application Failed", { description: errorMsg })
        }
      }
    } catch (error) {
      console.error('Error applying:', error)
      toast.error("Error", { description: "Failed to submit application" })
    } finally {
      setApplying(false)
    }
  }

  const handlePayForApplication = async () => {
    if (!offer || !user || !token || !userApplication) return
    if (!isCaVerifiedAccount(user.verification_status)) return

    setPaying(true)
    try {
      const orderResponse = await fetch(`/api/service-offers/${offerId}/clients/${user.id}/payments/create-order`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        }
      })

      const orderPayload = await orderResponse.json()
      if (!orderResponse.ok || !orderPayload?.success) {
        toast.error('Unable to start payment', { description: readApiError(orderPayload, 'This application does not require payment.') })
        return
      }

      if (!orderPayload?.data?.paymentRequired) {
        toast.success('No payment due', { description: orderPayload?.data?.message || 'This application does not require payment.' })
        checkExistingApplication()
        fetchOfferDetails()
        return
      }

      const orderData = orderPayload.data
      await openRazorpayCheckout({
        keyId: orderData.keyId,
        orderId: orderData.orderId,
        amountInr: Number(orderData.totalCharge || orderData.amount),
        currency: orderData.currency,
        description: `Payment for ${offer.title}`,
        prefill: {
          name: user.name || '',
          email: user.email || '',
          contact: user.phone || undefined,
        },
        onSuccess: async (response) => {
          const verifyResponse = await fetch(`/api/service-offers/${offerId}/clients/${user.id}/payments/verify`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`
            },
            body: JSON.stringify(response)
          })

          const verifyPayload = await verifyResponse.json()
          if (!verifyResponse.ok || !verifyPayload?.success) {
            toast.error('Payment verification failed', { description: readApiError(verifyPayload, 'Please contact support with the payment reference.') })
            return
          }

          toast.success('Payment successful', { description: verifyPayload?.data?.message || 'Your linked service request has been updated.' })

          checkExistingApplication()
          fetchOfferDetails()
        },
        onFailure: (error) => {
          toast.error('Payment failed', { description: error.description || error.reason || 'The payment provider could not complete the payment.' })
        },
      })
    } catch (error) {
      console.error('Error starting offer payment:', error)
      toast.error('Payment failed', { description: readApiError(error, 'Could not open online payment.') })
    } finally {
      setPaying(false)
    }
  }

  return {
    user,
    isAuthenticated,
    offer,
    userApplication,
    loading,
    applying,
    paying,
    selectedNeedIds,
    setSelectedNeedIds,
    ngoNeeds,
    loadingNgoNeeds,
    selectedNeedSummaries,
    selectedNeedTotal,
    isOfferExpired,
    handleApply,
    handlePayForApplication,
    refreshApplication: checkExistingApplication
  }
}
