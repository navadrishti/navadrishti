import { useEffect, useEffectEvent, useState } from "react"
import type { User } from "@/lib/auth-context"
import { openRazorpayCheckout, type RazorpaySuccessResponse } from "@/lib/razorpay-checkout"
import { parseCsrCapabilityRentals, type CsrCapabilityRentalRecord } from "@/lib/service-engagement"
import { describeRentalReservation } from "./helpers"

const VERIFY_ATTEMPTS = 3
const VERIFY_RETRY_DELAY_MS = 2000

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

type CapabilityRentalRow = {
  campaign_id: string
  rental?: CsrCapabilityRentalRecord | null
}

type CapabilityRentalsOptions = {
  user: User | null
  token: string | null
  campaignId: string | null
  ensureCampaignId: () => Promise<string | null>
  actionsEnabled: boolean
  leadAccepted: boolean
  appendAssistantMessage: (content: string) => void
  onOfferInvited: (offerId: number) => void
  onPaymentVerified: (offerId: number) => void
}

export function useCapabilityRentals({
  user,
  token,
  campaignId,
  ensureCampaignId,
  actionsEnabled,
  leadAccepted,
  appendAssistantMessage,
  onOfferInvited,
  onPaymentVerified,
}: CapabilityRentalsOptions) {
  const [paidOfferIds, setPaidOfferIds] = useState<number[]>([])
  const [paidRentalsByOfferId, setPaidRentalsByOfferId] = useState<Record<number, CsrCapabilityRentalRecord>>({})
  const [payingOfferId, setPayingOfferId] = useState<number | null>(null)
  const [rentalsCampaignId, setRentalsCampaignId] = useState(campaignId)

  if (rentalsCampaignId !== campaignId) {
    setRentalsCampaignId(campaignId)
    setPaidOfferIds([])
    setPaidRentalsByOfferId({})
  }

  const markRentalsPaid = (rentals: CsrCapabilityRentalRecord[]) => {
    if (rentals.length === 0) return
    setPaidOfferIds((current) => [...new Set([...current, ...rentals.map((rental) => Number(rental.service_offer_id))])])
    setPaidRentalsByOfferId((current) => ({
      ...current,
      ...Object.fromEntries(rentals.map((rental) => [Number(rental.service_offer_id), rental])),
    }))
  }

  const loadPaidRentals = useEffectEvent(async (id: string, isCurrent: () => boolean) => {
    const res = await fetch(`/api/campaigns/${encodeURIComponent(id)}`, {
      headers: { Authorization: `Bearer ${token}` },
    }).catch(() => null)
    const payload = await res?.json().catch(() => null)
    if (!res?.ok || !payload?.success || !isCurrent()) return
    markRentalsPaid(parseCsrCapabilityRentals(payload.data?.impact_metrics).filter((rental) => rental.payment_status === 'paid'))
  })

  useEffect(() => {
    if (!campaignId || !token) return
    let current = true
    void loadPaidRentals(campaignId, () => current)
    return () => {
      current = false
    }
  }, [campaignId, token])

  const verifyRentalPayment = async (campaignIdForPayment: string, offerId: number, paymentResponse: RazorpaySuccessResponse) => {
    for (let attempt = 1; ; attempt += 1) {
      const verifyRes = await fetch('/api/csr-agent/update-campaign', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          action: 'capability_rental_verify',
          campaign_id: campaignIdForPayment,
          offer_id: offerId,
          razorpay_order_id: paymentResponse.razorpay_order_id,
          razorpay_payment_id: paymentResponse.razorpay_payment_id,
          razorpay_signature: paymentResponse.razorpay_signature,
        }),
      })
      const verifyPayload = await verifyRes.json().catch(() => null)
      if (verifyRes.ok && verifyPayload?.success) {
        return verifyPayload.data?.rental as CsrCapabilityRentalRecord | undefined
      }

      const error = String(verifyPayload?.error || 'Payment verification failed')
      // Razorpay can report the payment a moment before it is captured.
      if (verifyRes.status === 409 && /not captured/i.test(error) && attempt < VERIFY_ATTEMPTS) {
        await wait(VERIFY_RETRY_DELAY_MS)
        continue
      }
      if (/refunded|already paid/i.test(error)) throw new Error(error)
      throw new Error(`${error}. Your payment reference is ${paymentResponse.razorpay_payment_id}; contact support if the amount was deducted.`)
    }
  }

  const handlePayAndReserveOffer = async (offerId: number, offerType?: string) => {
    if (!actionsEnabled) {
      appendAssistantMessage('Please finish campaign details before paying for a capability rental.')
      return
    }
    if (!leadAccepted) {
      appendAssistantMessage('Capability offers can be reserved once a lead NGO accepts the campaign.')
      return
    }
    if (!user?.id || !token) {
      appendAssistantMessage('Please sign in again to continue.')
      return
    }
    if (user.verification_status === 'suspended') {
      appendAssistantMessage('Your company account is suspended due to unpaid CSR capability penalties.')
      return
    }

    setPayingOfferId(offerId)
    try {
      const publishCampaignId = await ensureCampaignId()
      if (!publishCampaignId) {
        appendAssistantMessage('Please sign in again to continue.')
        return
      }

      const orderRes = await fetch('/api/csr-agent/update-campaign', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          action: 'capability_rental_create_order',
          campaign_id: publishCampaignId,
          offer_id: offerId,
        }),
      })
      const orderPayload = await orderRes.json().catch(() => null)
      if (!orderRes.ok || !orderPayload?.success) {
        throw new Error(orderPayload?.error || 'Failed to start capability payment')
      }

      if (!orderPayload.data?.paymentRequired) {
        setPaidOfferIds((current) => [...new Set([...current, offerId])])
        if (orderPayload.data?.rental) markRentalsPaid([orderPayload.data.rental])
        onOfferInvited(offerId)
        appendAssistantMessage(`Capability offer #${offerId} is already reserved for this campaign.`)
        return
      }

      await openRazorpayCheckout({
        keyId: orderPayload.data.keyId,
        orderId: orderPayload.data.orderId,
        amountInr: Number(orderPayload.data.amount || orderPayload.data.pricing?.totalChargeInr || 0),
        currency: 'INR',
        description: `CSR ${offerType || 'capability'} rental reservation`,
        themeColor: '#059669',
        onSuccess: async (paymentResponse) => {
          const rental = await verifyRentalPayment(publishCampaignId, offerId, paymentResponse)
          setPaidOfferIds((current) => [...new Set([...current, offerId])])
          onOfferInvited(offerId)
          if (rental) markRentalsPaid([rental])
          onPaymentVerified(offerId)
          appendAssistantMessage(describeRentalReservation(offerId, rental))
        },
        onFailure: (error) => {
          appendAssistantMessage(error.description || error.reason || 'Payment could not be completed.')
        },
      })
    } catch (error) {
      appendAssistantMessage(error instanceof Error ? error.message : 'Payment failed')
    } finally {
      setPayingOfferId(null)
    }
  }

  const refreshPaidRental = async (offerId: number) => {
    if (!campaignId || !token) return
    const res = await fetch('/api/campaigns/lead-assignments?rentals=1', {
      headers: { Authorization: `Bearer ${token}` },
    })
    const payload = await res.json().catch(() => null)
    if (!res.ok || !payload?.success) return
    const rows: CapabilityRentalRow[] = payload.data || []
    const match = rows.find(
      (row) =>
        String(row.campaign_id) === String(campaignId) &&
        Number(row.rental?.service_offer_id) === offerId
    )
    if (match?.rental) {
      const rental = match.rental
      setPaidRentalsByOfferId((current) => ({
        ...current,
        [offerId]: rental,
      }))
    }
  }

  return {
    paidOfferIds,
    paidRentalsByOfferId,
    payingOfferId,
    handlePayAndReserveOffer,
    refreshPaidRental,
  }
}
