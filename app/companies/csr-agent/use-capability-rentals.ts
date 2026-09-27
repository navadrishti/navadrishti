import { useState } from "react"
import type { User } from "@/lib/auth-context"
import { openRazorpayCheckout } from "@/lib/razorpay-checkout"
import type { CsrCapabilityRentalRecord } from "@/lib/service-engagement"
import { describeRentalReservation } from "./helpers"

type CapabilityRentalRow = {
  campaign_id: string
  rental?: CsrCapabilityRentalRecord | null
}

type CapabilityRentalsOptions = {
  user: User | null
  token: string | null
  campaignId: string | null
  actionsEnabled: boolean
  appendAssistantMessage: (content: string) => void
  onOfferInvited: (offerId: number) => void
  onPaymentVerified: (offerId: number) => void
}

export function useCapabilityRentals({
  user,
  token,
  campaignId,
  actionsEnabled,
  appendAssistantMessage,
  onOfferInvited,
  onPaymentVerified,
}: CapabilityRentalsOptions) {
  const [paidOfferIds, setPaidOfferIds] = useState<number[]>([])
  const [paidRentalsByOfferId, setPaidRentalsByOfferId] = useState<Record<number, CsrCapabilityRentalRecord>>({})
  const [payingOfferId, setPayingOfferId] = useState<number | null>(null)

  const handlePayAndReserveOffer = async (offerId: number, offerType?: string) => {
    if (!actionsEnabled) {
      appendAssistantMessage('Please finish campaign details before paying for a capability rental.')
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

    const publishCampaignId = campaignId
    if (!publishCampaignId) {
      appendAssistantMessage('Save the campaign draft before paying to reserve a capability.')
      return
    }

    setPayingOfferId(offerId)
    try {
      const orderRes = await fetch('/api/csr-agent/update-campaign', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          action: 'capability_rental_create_order',
          campaign_id: publishCampaignId,
          company_id: user.id,
          offer_id: offerId,
        }),
      })
      const orderPayload = await orderRes.json().catch(() => null)
      if (!orderRes.ok || !orderPayload?.success) {
        throw new Error(orderPayload?.error || 'Failed to start capability payment')
      }

      if (!orderPayload.data?.paymentRequired) {
        setPaidOfferIds((current) => [...new Set([...current, offerId])])
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
          const verifyRes = await fetch('/api/csr-agent/update-campaign', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              action: 'capability_rental_verify',
              campaign_id: publishCampaignId,
              company_id: user.id,
              offer_id: offerId,
              razorpay_order_id: paymentResponse.razorpay_order_id,
              razorpay_payment_id: paymentResponse.razorpay_payment_id,
              razorpay_signature: paymentResponse.razorpay_signature,
            }),
          })
          const verifyPayload = await verifyRes.json().catch(() => null)
          if (!verifyRes.ok || !verifyPayload?.success) {
            throw new Error(verifyPayload?.error || 'Payment verification failed')
          }

          const rental: CsrCapabilityRentalRecord | undefined = verifyPayload?.data?.rental
          setPaidOfferIds((current) => [...new Set([...current, offerId])])
          onOfferInvited(offerId)
          if (rental) {
            setPaidRentalsByOfferId((current) => ({
              ...current,
              [offerId]: rental,
            }))
          }
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
