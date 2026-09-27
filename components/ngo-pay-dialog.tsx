"use client"

import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { useAuth } from '@/lib/auth-context'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useToast } from '@/hooks/use-toast'
import { openRazorpayCheckout } from '@/lib/razorpay-checkout'
import { PlatformPaymentSummary, getTotalChargeLabel } from '@/components/platform-payment-summary'

export type NgoPayTarget = {
  id: number
  name: string
  email?: string | null
}

function parseNgoPayAmountToInr(value: string) {
  const normalized = value.replace(/,/g, '').trim()
  const amount = Number(normalized)
  return Number.isFinite(amount) ? amount : 0
}

export function NgoPayDialog({
  ngo,
  open,
  onOpenChange,
}: {
  ngo: NgoPayTarget | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { user } = useAuth()
  const { toast: notify } = useToast()
  const [paymentAmount, setPaymentAmount] = useState('')
  const [paying, setPaying] = useState(false)

  const close = () => {
    onOpenChange(false)
    setPaymentAmount('')
  }

  const handlePay = async () => {
    if (!ngo || !user) return

    const token = localStorage.getItem('token')
    if (!token) {
      notify({
        title: 'Sign in required',
        description: 'Log in as a company or individual to pay NGOs.',
        variant: 'destructive',
      })
      return
    }

    const requestedInr = parseNgoPayAmountToInr(paymentAmount)
    if (requestedInr <= 0) {
      notify({
        title: 'Invalid amount',
        description: 'Enter a valid contribution amount in INR.',
        variant: 'destructive',
      })
      return
    }

    setPaying(true)
    try {
      const orderRes = await fetch('/api/ngos/network', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ action: 'create-order', ngoId: ngo.id, amount: requestedInr }),
      })

      const orderPayload = await orderRes.json()
      if (!orderRes.ok || !orderPayload?.success) {
        notify({
          title: 'Unable to start payment',
          description: orderPayload?.error || 'Failed to create payment order',
          variant: 'destructive',
        })
        return
      }

      const orderData = orderPayload.data
      const activeNgo = ngo

      await openRazorpayCheckout({
        keyId: orderData.keyId,
        orderId: orderData.orderId,
        amountInr: Number(orderData.totalCharge || orderData.amount),
        currency: orderData.currency,
        description: `Support for ${activeNgo.name}`,
        prefill: {
          name: user.name || '',
          email: user.email || '',
        },
        onBeforeOpen: () => {
          onOpenChange(false)
        },
        onDismiss: () => {
          close()
        },
        onSuccess: async (response) => {
          const verifyRes = await fetch('/api/ngos/network', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              action: 'verify',
              ngoId: activeNgo.id,
              ...response,
            }),
          })

          const verifyPayload = await verifyRes.json()
          if (!verifyRes.ok || !verifyPayload?.success) {
            notify({
              title: 'Payment verification failed',
              description: verifyPayload?.error || 'Please contact support with your payment reference.',
              variant: 'destructive',
            })
            return
          }

          notify({
            title: 'Payment successful',
            description: verifyPayload?.data?.message || `Your support for ${activeNgo.name} was recorded.`,
          })
          close()
        },
        onFailure: (error) => {
          notify({
            title: 'Payment failed',
            description: error.description || error.reason || 'Payment could not be completed.',
            variant: 'destructive',
          })
        },
      })
    } catch (error) {
      notify({
        title: 'Payment failed',
        description: error instanceof Error ? error.message : 'Could not open checkout.',
        variant: 'destructive',
      })
    } finally {
      setPaying(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? onOpenChange(true) : close())}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Pay {ngo?.name || 'NGO'}</DialogTitle>
          <DialogDescription>
            Send direct support. You can also contact the NGO at{' '}
            {ngo?.email ? (
              <a href={`mailto:${ngo.email}`} className="font-medium text-emerald-700 hover:underline">
                {ngo.email}
              </a>
            ) : (
              'their profile email'
            )}{' '}
            before or after paying.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 py-2">
          <Label htmlFor="ngo-payment-amount">NGO support amount (INR)</Label>
          <Input
            id="ngo-payment-amount"
            inputMode="decimal"
            placeholder="e.g. 1000"
            value={paymentAmount}
            onChange={(event) => setPaymentAmount(event.target.value)}
            disabled={paying}
          />
          <PlatformPaymentSummary baseAmountInr={parseNgoPayAmountToInr(paymentAmount)} />
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={close} disabled={paying}>
            Cancel
          </Button>
          <Button type="button" onClick={handlePay} disabled={paying || parseNgoPayAmountToInr(paymentAmount) <= 0}>
            {paying ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Processing...
              </>
            ) : parseNgoPayAmountToInr(paymentAmount) <= 0 ? (
              'Enter amount to pay'
            ) : (
              `Pay ${getTotalChargeLabel(parseNgoPayAmountToInr(paymentAmount))}`
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
