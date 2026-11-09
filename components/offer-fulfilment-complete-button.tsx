'use client'

import { CheckCircle, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { canCompleteOfferRequest } from '@/lib/offer-requests'

export const OFFER_FULFILMENT_COMPLETE_CONFIRM =
  'Mark this capability offer fulfilment as completed?\n\nThis confirms the engagement is finished and moves the request to history.'

type OfferFulfilmentCompleteButtonProps = {
  requestId: number
  status: string | null | undefined
  updating?: boolean
  onComplete: (requestId: number) => void | Promise<void>
}

/**
 * Owner-only control to mark an accepted Offer request as fulfilled via the existing
 * PUT /api/service-offers/requests/[requestId] { status: 'completed' } contract.
 */
export function OfferFulfilmentCompleteButton({
  requestId,
  status,
  updating = false,
  onComplete,
}: OfferFulfilmentCompleteButtonProps) {
  if (!canCompleteOfferRequest({ status })) return null

  return (
    <Button
      size="sm"
      disabled={updating}
      onClick={() => {
        if (updating) return
        if (!window.confirm(OFFER_FULFILMENT_COMPLETE_CONFIRM)) return
        void onComplete(requestId)
      }}
      className="bg-slate-800 hover:bg-slate-900"
      data-testid="offer-fulfilment-complete"
    >
      {updating ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <>
          <CheckCircle size={14} className="mr-1" />
          Mark Fulfilment Complete
        </>
      )}
    </Button>
  )
}
