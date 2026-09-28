import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth-context'
import { useToast } from '@/hooks/use-toast'
import { getCapabilityNeedRequestTypes, isCapabilityRentalTransaction } from '@/lib/service-offers'
import { isNeedOpenForListing } from '@/lib/service-request-allocation'
import { openRazorpayCheckout } from '@/lib/razorpay-checkout'
import { sumNeedAmounts, toNgoNeedOption } from './helpers'
import type { ClientApplication, NgoNeedOption, ServiceOffer, ServiceRequestListItem } from './types'

export function useServiceOffer(offerId: string) {
  const router = useRouter()
  const { user, token } = useAuth()
  const { toast } = useToast()
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
  const isOfferExpired = !!offer?.valid_until && new Date(String(offer.valid_until)).getTime() < Date.now()

  const fetchOfferDetails = async () => {
    try {
      const response = await fetch(`/api/service-offers/${offerId}`, { cache: 'no-store' })
      if (response.ok) {
        const data = await response.json()
        setOffer(data)
      } else {
        toast({
          title: "Error",
          description: "Failed to load service offer details",
          variant: "destructive"
        })
        router.push('/service-offers')
      }
    } catch (error) {
      console.error('Error fetching offer:', error)
      toast({
        title: "Error",
        description: "Failed to load service offer details",
        variant: "destructive"
      })
    } finally {
      setLoading(false)
    }
  }

  const checkExistingApplication = async () => {
    try {
      const response = await fetch(`/api/service-offers/${offerId}/clients?userId=${user?.id}`)
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

  useEffect(() => {
    if (offerId) {
      fetchOfferDetails()
      if (isAuthenticated && user) {
        checkExistingApplication()
      }
    }
  }, [offerId, isAuthenticated, user])

  useEffect(() => {
    if (isAuthenticated && user?.user_type === 'ngo' && offer) {
      fetchNgoNeeds()
    }
  }, [offer?.id, offer?.offer_type, isAuthenticated, user?.id, user?.user_type])

  const handleApply = async () => {
    if (!isAuthenticated || !user) {
      toast({
        title: "Authentication Required",
        description: "Please log in to apply for this service offer",
        variant: "destructive"
      })
      router.push('/login')
      return
    }

    if (offer && user.id === offer.creator_id) {
      toast({
        title: "Not Allowed",
        description: "You cannot apply to your own capability offer",
        variant: "destructive"
      })
      return
    }

    if (user.user_type !== 'ngo') {
      toast({
        title: 'NGO only',
        description: 'Only NGOs can apply from this offer details page.',
        variant: 'destructive'
      })
      return
    }

    if (isOfferExpired) {
      toast({
        title: 'Offer expired',
        description: 'This capability offer has already expired.',
        variant: 'destructive'
      })
      return
    }

    if (selectedNeedIds.length === 0) {
      toast({
        title: 'Select a need',
        description: 'Please select one active need before submitting.',
        variant: "destructive"
      })
      return
    }

    const isRentalOffer = isCapabilityRentalTransaction(offer?.transaction_type)
    const offerAmount = Number(offer?.price_amount || 0)
    if (!isRentalOffer && Number.isFinite(offerAmount) && selectedNeedTotal > offerAmount) {
      toast({
        title: 'Selection exceeds offer value',
        description: 'Please choose needs whose total value fits within the offer amount.',
        variant: 'destructive'
      })
      return
    }

    setApplying(true)

    try {
      const response = await fetch(`/api/service-offers/${offerId}/clients`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
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
        toast({
          title: "Application Submitted",
          description: "Your request has been submitted for the selected needs.",
        })
      } else {
        const error = await response.json()
        const errorMsg = error.error || 'Failed to submit application'

        if (error.requiresVerification || response.status === 403) {
          const verificationMessage = error.message || 'Please complete account verification before hiring services.'
          toast({
            title: "Verification Required",
            description: verificationMessage,
            variant: "destructive"
          })
          setTimeout(() => {
            router.push('/verification')
          }, 3000)
        } else {
          toast({
            title: "Application Failed",
            description: errorMsg,
            variant: "destructive"
          })
        }
      }
    } catch (error) {
      console.error('Error applying:', error)
      toast({
        title: "Error",
        description: "Failed to submit application",
        variant: "destructive"
      })
    } finally {
      setApplying(false)
    }
  }

  const handlePayForApplication = async () => {
    if (!offer || !user || !token || !userApplication) return

    const linkedRequestId = Number(userApplication.service_request_id || userApplication.response_meta?.service_request_id || 0)
    if (!Number.isFinite(linkedRequestId) || linkedRequestId <= 0) {
      toast({
        title: 'Payment unavailable',
        description: 'This application is not linked to a service request yet.',
        variant: 'destructive'
      })
      return
    }

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
      if (!orderResponse.ok || !orderPayload?.success || !orderPayload?.data?.paymentRequired) {
        toast({
          title: 'Unable to start payment',
          description: orderPayload?.error || 'This application does not require payment.',
          variant: 'destructive'
        })
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
            toast({
              title: 'Payment verification failed',
              description: verifyPayload?.error || 'Please contact support with the payment reference.',
              variant: 'destructive'
            })
            return
          }

          toast({
            title: 'Payment successful',
            description: verifyPayload?.data?.message || 'Your linked service request has been updated.'
          })

          checkExistingApplication()
          fetchOfferDetails()
        },
        onFailure: (error) => {
          toast({
            title: 'Payment failed',
            description: error.description || error.reason || 'Razorpay could not complete the payment.',
            variant: 'destructive'
          })
        },
      })
    } catch (error) {
      console.error('Error starting offer payment:', error)
      toast({
        title: 'Payment failed',
        description: error instanceof Error ? error.message : 'Could not open Razorpay checkout.',
        variant: 'destructive'
      })
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
    handlePayForApplication
  }
}
