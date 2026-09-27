'use client'

import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import type { VolunteerApplicationActions } from './use-volunteer-application'

interface ApplyFormProps {
  isFinancialNeed: boolean
  isSkillServiceNeed: boolean
  verificationRequired: boolean
  actions: VolunteerApplicationActions
}

export function ApplyForm({ isFinancialNeed, isSkillServiceNeed, verificationRequired, actions }: ApplyFormProps) {
  const {
    applying,
    applicationMessage,
    setApplicationMessage,
    applicationFulfillmentAmount,
    setApplicationFulfillmentAmount,
    applicationFulfillmentQuantity,
    setApplicationFulfillmentQuantity,
    handleApply,
  } = actions

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="message">Application Message</Label>
        <Textarea
          id="message"
          placeholder="Tell the NGO why you want to volunteer for this request and how you can help... (optional)"
          value={applicationMessage}
          onChange={(e) => setApplicationMessage(e.target.value)}
          rows={4}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {isFinancialNeed ? (
          <div>
            <Label htmlFor="fulfillment_amount">Amount You Can Fulfill *</Label>
            <Input
              id="fulfillment_amount"
              type="number"
              min="1"
              value={applicationFulfillmentAmount}
              onChange={(e) => setApplicationFulfillmentAmount(e.target.value)}
              placeholder="e.g., 5000"
            />
          </div>
        ) : isSkillServiceNeed ? (
          <div>
            <Label htmlFor="fulfillment_amount">Daily Wage (INR) *</Label>
            <Input
              id="fulfillment_amount"
              type="number"
              min="1"
              value={applicationFulfillmentAmount}
              onChange={(e) => setApplicationFulfillmentAmount(e.target.value)}
              placeholder="e.g., 1500 per day"
            />
          </div>
        ) : (
          <div>
            <Label htmlFor="fulfillment_quantity">Quantity You Can Fulfill *</Label>
            <Input
              id="fulfillment_quantity"
              type="number"
              min="1"
              value={applicationFulfillmentQuantity}
              onChange={(e) => setApplicationFulfillmentQuantity(e.target.value)}
              placeholder="e.g., 10"
            />
          </div>
        )}
      </div>

      <Button
        onClick={handleApply}
        disabled={applying || verificationRequired}
        className="w-full"
      >
        {applying ? (
          <>
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            Submitting...
          </>
        ) : verificationRequired ? (
          'Verification Required'
        ) : (
          'Submit Application'
        )}
      </Button>
    </div>
  )
}
