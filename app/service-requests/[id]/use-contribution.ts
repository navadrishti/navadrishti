'use client'

import { useState } from 'react'
import { useAuth } from '@/lib/auth-context'
import { useToast } from '@/hooks/use-toast'
import { parseAmountToInr } from '@/lib/utils'
import { openRazorpayCheckout } from '@/lib/razorpay-checkout'
import type { ServiceRequest } from './types'

interface UseContributionOptions {
  request: ServiceRequest | null
  canPayForRequest: boolean
  fetchRequestDetails: () => Promise<void>
}

export function useContribution({ request, canPayForRequest, fetchRequestDetails }: UseContributionOptions) {
  const { user, token } = useAuth()
  const { toast } = useToast()
  const [paymentAmount, setPaymentAmount] = useState('')
  const [paying, setPaying] = useState(false)

  const handleContribute = async () => {
    if (!request || !token) return
    if (!canPayForRequest) return

    const requestedInr = parseAmountToInr(paymentAmount)
    if (requestedInr <= 0) {
      toast({ title: 'Invalid amount', description: 'Enter a valid contribution amount in INR.', variant: 'destructive' })
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
        toast({
          title: 'Unable to start payment',
          description: orderPayload?.error || 'Failed to create payment order',
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
            toast({
              title: 'Payment verification failed',
              description: verifyPayload?.error || 'Please contact support with payment reference.',
              variant: 'destructive'
            })
            return
          }

          toast({
            title: 'Payment successful',
            description: verifyPayload?.data?.message || 'Contribution recorded successfully.'
          })

          fetchRequestDetails()
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
      console.error('Contribution error:', error)
      toast({
        title: 'Payment failed',
        description: error instanceof Error ? error.message : 'Could not open Razorpay checkout.',
        variant: 'destructive'
      })
    } finally {
      setPaying(false)
    }
  }

  return { paymentAmount, setPaymentAmount, paying, handleContribute }
}

export type Contribution = ReturnType<typeof useContribution>
