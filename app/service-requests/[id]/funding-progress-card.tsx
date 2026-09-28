'use client'

import { IndianRupee } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { PlatformPaymentSummary, getTotalChargeLabel } from '@/components/platform-payment-summary'
import { parseAmountToInr } from '@/lib/utils'
import type { Contribution } from './use-contribution'

interface FundingProgressCardProps {
  isCompleted: boolean
  fundingProgress: number
  fundingTargetInr: number
  fundsRaisedInr: number
  fundsRemainingInr: number
  canPayForRequest: boolean
  contribution: Contribution
}

export function FundingProgressCard({
  isCompleted,
  fundingProgress,
  fundingTargetInr,
  fundsRaisedInr,
  fundsRemainingInr,
  canPayForRequest,
  contribution,
}: FundingProgressCardProps) {
  const { paymentAmount, setPaymentAmount, paying, handleContribute } = contribution

  return (
    <div className="space-y-4 rounded-xl border border-slate-200 bg-slate-50/70 p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-slate-900">Funding Progress</p>
        <Badge className={isCompleted ? 'border-[#D5E2DA] bg-[#F1F6F3] text-[#4F6B5C]' : 'border-[#D9E0E4] bg-[#F0F3F4] text-udaan-blue'}>
          {isCompleted ? 'Fulfilled' : `${fundingProgress}% Funded`}
        </Badge>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs font-medium text-slate-500">
          <span>Raised INR {fundsRaisedInr.toLocaleString('en-IN')}</span>
          <span>Target INR {fundingTargetInr.toLocaleString('en-IN')}</span>
        </div>
        <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-200">
          <div
            className="h-full rounded-full bg-udaan-blue transition-all duration-300"
            style={{ width: `${fundingProgress}%` }}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-3">
        <div className="rounded-lg border border-slate-200 bg-white p-3">
          <p className="text-gray-500">Target</p>
          <p className="font-semibold text-slate-900">INR {fundingTargetInr.toLocaleString('en-IN')}</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-3">
          <p className="text-gray-500">Raised</p>
          <p className="font-semibold text-slate-900">INR {fundsRaisedInr.toLocaleString('en-IN')}</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-3">
          <p className="text-gray-500">Remaining</p>
          <p className="font-semibold text-slate-900">INR {fundsRemainingInr.toLocaleString('en-IN')}</p>
        </div>
      </div>

      {canPayForRequest && fundingTargetInr > 0 && fundsRemainingInr > 0 && (
        <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div>
            <p className="text-sm font-semibold text-slate-900">Contribute via Razorpay</p>
            <p className="text-xs text-slate-500">
              Enter the amount the NGO should receive. Platform fee and GST are added on top at checkout.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="paymentAmount">NGO receives (INR)</Label>
            <div className="relative">
              <IndianRupee className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
              <input
                id="paymentAmount"
                type="number"
                min={1}
                max={Math.ceil(fundsRemainingInr)}
                value={paymentAmount}
                onChange={(e) => setPaymentAmount(e.target.value)}
                className="h-11 w-full rounded-md border border-slate-300 bg-slate-50 px-9 text-sm focus:border-udaan-blue focus:outline-none focus:ring-2 focus:ring-udaan-blue/20"
                placeholder="Enter amount"
              />
            </div>
            <PlatformPaymentSummary
              baseAmountInr={Math.min(parseAmountToInr(paymentAmount), fundsRemainingInr || 0)}
            />
          </div>

          <Button
            onClick={handleContribute}
            disabled={paying || parseAmountToInr(paymentAmount) <= 0}
            className="h-11 w-full"
          >
            {paying
              ? 'Opening Razorpay...'
              : parseAmountToInr(paymentAmount) <= 0
                ? 'Enter amount to pay'
                : `Pay ${getTotalChargeLabel(Math.min(parseAmountToInr(paymentAmount), fundsRemainingInr || 0))}`}
          </Button>
        </div>
      )}

    </div>
  )
}
