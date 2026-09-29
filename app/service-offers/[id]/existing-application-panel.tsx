import { Loader2 } from 'lucide-react'
import { formatPrice } from '@/lib/utils'
import { formatStatusLabel } from '@/lib/format-date'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { formatDate, getStatusColor } from './helpers'
import type { ClientApplication } from './types'

interface ExistingApplicationPanelProps {
  application: ClientApplication
  offerPriceAmount: number
  paying: boolean
  onPay: () => void
}

export function ExistingApplicationPanel({ application, offerPriceAmount, paying, onPay }: ExistingApplicationPanelProps) {
  const meta = application.response_meta

  return (
    <div className="space-y-4">
      <Alert>
        <AlertDescription>
          You have already applied to this capability.
        </AlertDescription>
      </Alert>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">Status:</span>
          <Badge className={getStatusColor(application.status)}>
            {formatStatusLabel(application.status)}
          </Badge>
        </div>

        <div>
          <span className="text-sm font-medium">Your Message:</span>
          <p className="text-sm text-muted-foreground mt-1 p-2 bg-muted rounded">
            {application.message}
          </p>
        </div>

        <p className="text-xs text-muted-foreground">
          Applied on {formatDate(application.applied_at)}
        </p>

        {['accepted', 'active'].includes(application.status) && application.service_request_id ? (
          <div className="rounded-lg border border-gram-border bg-gram-sage p-4 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-gram-ink">Payment linked to service request</p>
                <p className="text-xs text-udaan-blue">
                  Request #{application.service_request_id}{meta?.payment_amount_inr ? ` • ${formatPrice(Number(meta.payment_amount_inr))}` : ''}
                </p>
              </div>
              <Badge className="border-[#D9E0E4] bg-[#F0F3F4] text-udaan-blue">
                {meta?.payment_status === 'paid' ? 'Paid' : 'Pending'}
              </Badge>
            </div>

            {meta?.payment_status !== 'paid' && meta?.payment_required !== false && Number(meta?.payment_amount_inr || offerPriceAmount || 0) > 0 ? (
              <Button onClick={onPay} disabled={paying} className="w-full">
                {paying ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Starting payment...
                  </>
                ) : (
                  'Pay now'
                )}
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  )
}
