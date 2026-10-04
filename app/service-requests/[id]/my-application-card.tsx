'use client'

import { CheckCircle } from 'lucide-react'
import { DelhiveryFulfillment } from '@/components/delhivery-fulfillment'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { formatStatusLabel } from '@/lib/format-date'
import { parseJsonObject } from '@/lib/utils'
import { formatDate, getStatusColor } from './helpers'
import type { VolunteerApplication } from './types'
import type { VolunteerApplicationActions } from './use-volunteer-application'

interface MyApplicationCardProps {
  serviceRequestId: number
  application: VolunteerApplication
  isFinancialNeed: boolean
  isMaterialNeed: boolean
  usesManualMarkDone: boolean
  actions: VolunteerApplicationActions
  onUpdated?: () => void | Promise<void>
}

export function MyApplicationCard({
  serviceRequestId,
  application,
  isFinancialNeed,
  isMaterialNeed,
  usesManualMarkDone,
  actions,
  onUpdated,
}: MyApplicationCardProps) {
  const {
    setIndividualReceiptFile,
    individualCompletionNote,
    setIndividualCompletionNote,
    handleMarkIndividualDone,
  } = actions
  const meta = application.response_meta

  return (
    <div className="space-y-4">
      <Alert>
        <CheckCircle className="h-4 w-4" />
        <AlertDescription>
          You have already applied for this need.
        </AlertDescription>
      </Alert>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">Status:</span>
          <Badge className={getStatusColor(application.status)}>
            {formatStatusLabel(application.status || 'pending')}
          </Badge>
        </div>

        <div>
          <span className="text-sm font-medium">Your Message:</span>
          <p className="text-sm text-muted-foreground mt-1 p-2 bg-muted rounded">
            {application.application_message}
          </p>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 text-sm">
          <div>
            <span className="font-medium">Your Fulfillment:</span>
            <p className="mt-1 p-2 bg-muted rounded">
              {isFinancialNeed
                ? `INR ${Number(application.fulfillment_amount || application.assigned_amount || 0).toLocaleString('en-IN')}`
                : String(application.fulfillment_quantity || application.assigned_quantity || 0)}
            </p>
          </div>
          <div>
            <span className="font-medium">Receipt Status:</span>
            <p className="mt-1 p-2 bg-muted rounded">
              {application.individual_done_at || meta?.individual_done_at ? 'Marked done' : 'Pending completion'}
            </p>
          </div>
        </div>

        {(application.status === 'accepted' || application.status === 'active') && usesManualMarkDone && (
          <div className="space-y-3 rounded-lg border bg-muted/30 p-4">
            <div>
              <p className="font-medium text-sm">Mark Fulfillment Done</p>
              <p className="text-xs text-muted-foreground">Upload your receipt and confirm once your part is complete.</p>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <Label htmlFor="individual-receipt">Receipt Upload</Label>
                <Input id="individual-receipt" type="file" accept="image/*,.pdf" onChange={(e) => setIndividualReceiptFile(e.target.files?.[0] || null)} />
              </div>
              <div>
                <Label htmlFor="individual-note">Completion Note</Label>
                <Textarea id="individual-note" value={individualCompletionNote} onChange={(e) => setIndividualCompletionNote(e.target.value)} rows={2} placeholder="Optional note about the completed fulfillment" />
              </div>
            </div>
            <Button onClick={handleMarkIndividualDone} className="w-full">
              Mark as Done
            </Button>
          </div>
        )}

        {isMaterialNeed && (['accepted', 'active'].includes(String(application.status)) || Boolean(meta?.delivery_tracking_id)) && (
          <DelhiveryFulfillment
            serviceRequestId={serviceRequestId}
            volunteerApplicationId={Number(application.id)}
            responseMeta={parseJsonObject(meta)}
            role="donor"
            onUpdated={onUpdated}
          />
        )}

        {application.status === 'rejected' && meta?.ngo_decision_comment && (
          <div>
            <span className="text-sm font-medium text-red-700">Reason from NGO:</span>
            <p className="text-sm text-red-800 mt-1 p-2 bg-red-50 border border-red-200 rounded whitespace-pre-wrap">
              {meta.ngo_decision_comment}
            </p>
          </div>
        )}

        <p className="text-xs text-muted-foreground">
          Applied on {formatDate(application.applied_at)}
        </p>
      </div>
    </div>
  )
}
