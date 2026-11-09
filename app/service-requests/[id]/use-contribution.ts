'use client'
import { toast } from 'sonner'

import { readApiError } from '@/lib/user-facing-error'
import { useState } from 'react'
import { useAuth } from '@/lib/auth-context'
import { isCaVerifiedAccount } from '@/lib/auth'
import { parseAmountToInr } from '@/lib/utils'
import { openRazorpayCheckout } from '@/lib/razorpay-checkout'
import type { ServiceRequest } from './types'

interface UseContributionOptions {
  request: ServiceRequest | null
  canPayForRequest: boolean
  fetchRequestDetails: () => Promise<void>
}

export function useContribution({ request, canPayForRequest, fetchRequestDetails }: UseContributionOptions) {
  const { user, token } = useAuth()  const [paymentAmount, setPaymentAmount] = useState('')
  const [paying, setPaying] = useState(false)

  const handleContribute = async () => {
    if (!request || !token) return
    if (!canPayForRequest || !isCaVerifiedAccount(user?.verification_status)) return

    const requestedInr = parseAmountToInr(paymentAmount)
    if (requestedInr <= 0) {
      toast.error('Invalid amount', { description: 'Enter a valid contribution amount in INR.' })
      return
    }

    setPaying(true)
    try {
      const orderRes = await fetch(`/api/service-requests/${request.id}/payments/create-order`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ amount: requestedInr })
      })

      const orderPayload = await orderRes.json()
      if (!orderRes.ok || !orderPayload?.success) {
        toast.error('Unable to start payment', { description: readApiError(orderPayload, 'Failed to create payment order') })
        return
      }

      const orderData = orderPayload.data
      await openRazorpayCheckout({
        keyId: orderData.keyId,
        orderId: orderData.orderId,
        amountInr: Number(orderData.totalCharge || orderData.amount),
        currency: orderData.currency,
        description: `Contribution for: ${orderData.requestTitle}`,
        prefill: {
          name: user?.name || '',
          email: user?.email || '',
          contact: user?.phone || undefined,
        },
        onSuccess: async (response) => {
          const verifyRes = await fetch(`/api/service-requests/${request.id}/payments/verify`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`
            },
            body: JSON.stringify(response)
          })

          const verifyPayload = await verifyRes.json()
          if (!verifyRes.ok || !verifyPayload?.success) {
            toast.error('Payment verification failed', { description: readApiError(verifyPayload, 'Please contact support with payment reference.') })
            return
          }

          toast.success('Payment successful', { description: verifyPayload?.data?.message || 'Contribution recorded successfully.' })

          fetchRequestDetails()
        },
        onFailure: (error) => {
          toast.error('Payment failed', { description: error.description || error.reason || 'The payment provider could not complete the payment.' })
        },
      })
    } catch (error) {
      console.error('Contribution error:', error)
      toast.error('Payment failed', { description: readApiError(error, 'Could not open online payment.') })
    } finally {
      setPaying(false)
    }
  }

  return { paymentAmount, setPaymentAmount, paying, handleContribute }
}

export type Contribution = ReturnType<typeof useContribution>
